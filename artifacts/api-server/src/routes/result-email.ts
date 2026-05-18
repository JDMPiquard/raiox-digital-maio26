import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { assessmentEmailsTable, assessmentsTable, db } from "@workspace/db";
import {
  CaptureResultEmailBody,
  CaptureResultEmailParams,
  DispatchResultEmailBody,
  DispatchResultEmailParams,
} from "@workspace/api-zod";
import { sendResultEmail } from "../lib/resend";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Crude in-memory IP rate limiter to keep the public /email endpoint from
// being abused as an outbound mail relay. Each IP gets a bucket of timestamps;
// requests older than WINDOW_MS are evicted on each call.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;
const ipBuckets = new Map<string, number[]>();
let lastPruneAt = 0;

function pruneIpBuckets(now: number): void {
  // Cheap janitor: at most once per minute, walk the map and drop entries
  // whose newest hit fell outside the window. Keeps memory bounded under
  // IP churn (botnets, mobile NAT, etc.) without needing an external store.
  if (now - lastPruneAt < 60 * 1000) return;
  lastPruneAt = now;
  const cutoff = now - RATE_WINDOW_MS;
  for (const [ip, bucket] of ipBuckets) {
    const fresh = bucket.filter((t) => t > cutoff);
    if (fresh.length === 0) ipBuckets.delete(ip);
    else if (fresh.length !== bucket.length) ipBuckets.set(ip, fresh);
  }
}

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  pruneIpBuckets(now);
  const cutoff = now - RATE_WINDOW_MS;
  const bucket = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (bucket.length >= RATE_MAX) {
    ipBuckets.set(ip, bucket);
    return false;
  }
  bucket.push(now);
  ipBuckets.set(ip, bucket);
  return true;
}

function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

router.post("/result/:sid/email", async (req, res) => {
  if (!rateLimitOk(clientIp(req))) {
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }
  const paramsParsed = CaptureResultEmailParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_sid" });
  }
  const bodyParsed = CaptureResultEmailBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }

  const { sid } = paramsParsed.data;
  const { email, immediate, shopName } = bodyParsed.data;

  try {
    await db
      .insert(assessmentEmailsTable)
      .values({ sid, email })
      .onConflictDoUpdate({
        target: assessmentEmailsTable.sid,
        set: { email, updatedAt: sql`now()`, sentAt: null },
      });
  } catch (err) {
    logger.error({ err, sid }, "Failed to persist result email");
    return res.status(500).json({ ok: false, error: "persist_failed" });
  }

  const resolvedShopName = shopName ?? (await lookupShopName(sid));

  // If the result is already cached we send right away, regardless of the
  // `immediate` hint from the client — there is no reason to make the user
  // wait for the dispatch-after-cache hook just because the form was
  // submitted from the waiting view. If the result is not yet cached we
  // queue and let POST /result/:sid/cache flush it on completion.
  const resultReady = await isResultCached(sid);
  if (!resultReady) {
    return res.json({ ok: true, queued: true, sent: false });
  }
  void immediate;

  const outcome = await sendResultEmail({
    to: email,
    sid,
    shopName: resolvedShopName,
  });
  if (outcome.sent) {
    try {
      await db
        .update(assessmentEmailsTable)
        .set({ sentAt: sql`now()` })
        .where(eq(assessmentEmailsTable.sid, sid));
    } catch (err) {
      logger.warn({ err, sid }, "Failed to mark email as sent");
    }
    return res.json({ ok: true, sent: true, queued: false });
  }

  // If the configured Resend client is missing entirely (no key / no from),
  // the address has still been persisted — treat the request as accepted
  // and queued so dev/preview environments don't surface a hard error.
  if (outcome.reason === "no-key" || outcome.reason === "no-from") {
    return res.json({ ok: true, sent: false, queued: true });
  }

  // Send genuinely failed (e.g. Resend rejected the call). Surface it
  // honestly to the UI so the user gets a real "tenta de novo" instead of
  // false success. The email row stays on file for a later dispatch retry.
  return res
    .status(502)
    .json({ ok: false, error: outcome.reason ?? "send_failed" });
});

router.post("/result/:sid/email/dispatch", async (req, res) => {
  const paramsParsed = DispatchResultEmailParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_sid" });
  }
  const bodyParsed = DispatchResultEmailBody.safeParse(req.body ?? {});
  const shopName = bodyParsed.success ? bodyParsed.data.shopName : undefined;
  const { sid } = paramsParsed.data;

  let row: typeof assessmentEmailsTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(assessmentEmailsTable)
      .where(eq(assessmentEmailsTable.sid, sid))
      .limit(1);
    row = rows[0];
  } catch (err) {
    logger.error({ err, sid }, "Failed to load email row for dispatch");
    return res.status(500).json({ ok: false, error: "lookup_failed" });
  }

  if (!row) return res.json({ ok: true, sent: false, queued: false });
  if (row.sentAt) return res.json({ ok: true, sent: true, queued: false });

  // Guard: never dispatch unless the result has actually been cached. The
  // link in the email would otherwise point at a /r/:sid page with no data
  // to render.
  const resultReady = await isResultCached(sid);
  if (!resultReady) return res.json({ ok: true, sent: false, queued: true });

  const resolvedShopName = shopName ?? (await lookupShopName(sid));
  const outcome = await sendResultEmail({
    to: row.email,
    sid,
    shopName: resolvedShopName,
  });
  if (outcome.sent) {
    try {
      await db
        .update(assessmentEmailsTable)
        .set({ sentAt: sql`now()` })
        .where(eq(assessmentEmailsTable.sid, sid));
    } catch (err) {
      logger.warn({ err, sid }, "Failed to mark dispatched email as sent");
    }
    return res.json({ ok: true, sent: true, queued: false });
  }
  return res.json({ ok: true, sent: false, queued: true });
});

async function lookupShopName(sid: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ shopName: assessmentsTable.shopName })
      .from(assessmentsTable)
      .where(eq(assessmentsTable.sid, sid))
      .limit(1);
    return rows[0]?.shopName ?? null;
  } catch {
    return null;
  }
}

async function isResultCached(sid: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ sid: assessmentsTable.sid })
      .from(assessmentsTable)
      .where(eq(assessmentsTable.sid, sid))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export default router;
