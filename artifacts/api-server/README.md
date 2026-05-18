# @workspace/api-server

Express API for the Raio-X Digital flow.

## Routes

- `GET /api/healthz` — health check.
- `GET /api/result/:sid/cache` — read the cached diagnostic payload by `sid`. Returns 404 if no result has been cached yet.
- `POST /api/result/:sid/cache` — upsert the full diagnostic payload by `sid`. The UI calls this when polling completes so that shared `/r/:sid` links resolve instantly without re-running the diagnostic. Also flushes any queued result email for that `sid`.
- `POST /api/result/:sid/email` — capture an email for the result. Body: `{ email, immediate?: boolean, shopName?: string }`. When `immediate` is true _and_ a cached result exists, the email is sent via Resend now; otherwise the email is persisted and dispatched as soon as the result is cached.
- `POST /api/result/:sid/email/dispatch` — flush any queued email for `sid`. Safe to call when there is nothing to send.

## Environment

Required:

- `PORT` — set by Replit, the server fails fast if missing.
- `DATABASE_URL` — Postgres connection used by `@workspace/db`.

Optional (result emails):

- `RESEND_API_KEY` — Resend API key. If missing, the email is still persisted to `assessment_emails` but the actual send is a no-op (a warning is logged once at startup).
- `RESULT_EMAIL_FROM` — verified `from` address Resend should send from (e.g. `Raio-X AHI <raiox@your-verified-domain.com>`). If missing, the send is also a no-op. The Resend domain must be verified on the Resend dashboard for sends to succeed.
- `RESULT_PUBLIC_ORIGIN` — public origin used to build the `https://…/r/:sid` link inside the email body. Defaults to `https://raiox.j24d.com` when unset. Override in non-prod environments (e.g. a Replit preview URL).

## Tables (owned by `@workspace/db`)

- `assessments(sid PK, shop_name, payload jsonb, created_at, updated_at)` — cache of the full diagnostic payload, keyed by `sid`.
- `assessment_emails(sid PK, email, created_at, updated_at, sent_at)` — emails captured against an assessment. One row per `sid`; a later submit replaces the previous email.
