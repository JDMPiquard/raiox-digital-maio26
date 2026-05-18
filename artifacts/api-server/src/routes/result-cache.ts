import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  assessmentEmailsTable,
  assessmentsTable,
  db,
} from "@workspace/db";
import {
  CacheResultBody,
  CacheResultParams,
  GetCachedResultParams,
} from "@workspace/api-zod";
import { sendResultEmail } from "../lib/resend";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/result/:sid/cache", async (req, res) => {
  const parsed = GetCachedResultParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_sid" });
  }
  const { sid } = parsed.data;
  try {
    const rows = await db
      .select()
      .from(assessmentsTable)
      .where(eq(assessmentsTable.sid, sid))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const emailRows = await db
      .select({ email: assessmentEmailsTable.email })
      .from(assessmentEmailsTable)
      .where(eq(assessmentEmailsTable.sid, sid))
      .limit(1);
    return res.json({
      sid: row.sid,
      shopName: row.shopName,
      payload: row.payload,
      cachedAt: row.updatedAt.toISOString(),
      hasEmail: emailRows.length > 0,
    });
  } catch (err) {
    logger.error({ err, sid }, "Failed to load cached result");
    return res.status(500).json({ ok: false, error: "lookup_failed" });
  }
});

router.post("/result/:sid/cache", async (req, res) => {
  const paramsParsed = CacheResultParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_sid" });
  }
  const bodyParsed = CacheResultBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }
  const { sid } = paramsParsed.data;
  const { payload, shopName } = bodyParsed.data;
  const inferredShopName =
    shopName ??
    (typeof (payload as { shop?: { name?: unknown } })?.shop?.name === "string"
      ? ((payload as { shop: { name: string } }).shop.name)
      : null);

  try {
    await db
      .insert(assessmentsTable)
      .values({
        sid,
        shopName: inferredShopName,
        payload: payload as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: assessmentsTable.sid,
        set: {
          payload: payload as Record<string, unknown>,
          shopName: inferredShopName,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    logger.error({ err, sid }, "Failed to cache assessment result");
    return res.status(500).json({ ok: false, error: "cache_failed" });
  }

  // Side-effect: if an email was queued before the result was ready, send it
  // now that we have a payload to point at.
  try {
    const emailRows = await db
      .select()
      .from(assessmentEmailsTable)
      .where(eq(assessmentEmailsTable.sid, sid))
      .limit(1);
    const emailRow = emailRows[0];
    if (emailRow && !emailRow.sentAt) {
      const outcome = await sendResultEmail({
        to: emailRow.email,
        sid,
        shopName: inferredShopName,
      });
      if (outcome.sent) {
        await db
          .update(assessmentEmailsTable)
          .set({ sentAt: sql`now()` })
          .where(eq(assessmentEmailsTable.sid, sid));
      }
    }
  } catch (err) {
    logger.warn({ err, sid }, "Cache succeeded but queued-email dispatch failed");
  }

  return res.json({ ok: true });
});

export default router;
