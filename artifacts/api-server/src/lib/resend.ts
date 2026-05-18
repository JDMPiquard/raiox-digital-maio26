import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env["RESEND_API_KEY"];
const fromAddress = process.env["RESULT_EMAIL_FROM"];
const configuredOrigin = process.env["RESULT_PUBLIC_ORIGIN"];
const DEFAULT_ORIGIN = "https://raiox.j24d.com";

const client = apiKey ? new Resend(apiKey) : null;

if (!client) {
  logger.warn(
    "RESEND_API_KEY is not set — result emails will be persisted but the send will be a no-op.",
  );
} else if (!fromAddress) {
  logger.warn(
    "RESULT_EMAIL_FROM is not set — result emails will be persisted but the send will be a no-op.",
  );
}

function resultUrl(sid: string): string {
  const origin = (configuredOrigin || DEFAULT_ORIGIN).replace(/\/+$/, "");
  return `${origin}/r/${encodeURIComponent(sid)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default:  return "&#39;";
    }
  });
}

export interface SendResultEmailInput {
  to: string;
  sid: string;
  shopName?: string | null;
}

export interface SendResultEmailOutcome {
  sent: boolean;
  reason?: "no-key" | "no-from" | "send-failed";
}

export async function sendResultEmail(
  input: SendResultEmailInput,
): Promise<SendResultEmailOutcome> {
  if (!client) return { sent: false, reason: "no-key" };
  if (!fromAddress) return { sent: false, reason: "no-from" };

  const url = resultUrl(input.sid);
  const name = (input.shopName ?? "").trim();
  const subject = name
    ? `O teu Raio-X Digital — ${name}`
    : "O teu Raio-X Digital";

  const line = name
    ? `Aqui está o teu Raio-X Digital de ${escapeHtml(name)}.`
    : "Aqui está o teu Raio-X Digital.";

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1714;background:#f5efe6;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fffaf2;padding:32px;border-radius:8px;">
    <p style="font-size:18px;line-height:1.5;margin:0 0 16px;">${line}</p>
    <p style="font-size:15px;line-height:1.5;color:#4a3f33;margin:0 0 24px;">Uma leitura curta da presença online da tua loja — feita só com fontes públicas.</p>
    <p style="margin:0 0 24px;">
      <a href="${url}" style="display:inline-block;background:#c75a3e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Ver o meu Raio-X →</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#7a6b5a;margin:0 0 8px;">Ou copia o link:<br/><a href="${url}" style="color:#c75a3e;word-break:break-all;">${url}</a></p>
    <p style="font-size:12px;line-height:1.5;color:#9a8a76;margin:24px 0 0;">— AHI · Fórum do Comércio do Porto</p>
  </div>
</body></html>`;

  const text = `${name ? `Aqui está o teu Raio-X Digital de ${name}.` : "Aqui está o teu Raio-X Digital."}\n\nVê-o aqui: ${url}\n\n— AHI · Fórum do Comércio do Porto`;

  try {
    const result = await client.emails.send({
      from: fromAddress,
      to: input.to,
      subject,
      html,
      text,
    });
    if (result.error) {
      logger.warn({ err: result.error, sid: input.sid }, "Resend send failed");
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.warn({ err, sid: input.sid }, "Resend send threw");
    return { sent: false, reason: "send-failed" };
  }
}
