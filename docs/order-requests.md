# B2B order requests and bank transfer

The cart submits orders inside ToyLogix. `POST /api/orders` authenticates the current session, calls `submit_b2b_order`, then delivers an automatically generated Romanian PDF by email to the authenticated customer's email and `NOTIFICATION_TO`. Customers no longer attach PDFs or use an external mail application.

## Setup

Apply `supabase/migrations/20260930095132_b2b_order_flow.sql` after the account-security and stock-management migrations. This adds isolated order tables, an immutable event history, a durable email queue and the private `order-receipts` bucket. This migration was applied to the connected ToyLogix project on September 30, 2026; a rollback-only smoke test verified order creation without retaining a test order.

Order submission and receipt upload require only the existing public Supabase configuration and a verified customer session. They use the customer's JWT and database permissions; `AUTH_RATE_LIMIT_SECRET` and a service-role key are not required to save an order. If `AUTH_SITE_URL` is configured, it must match the browser origin. Otherwise browser requests must have a valid origin and `Sec-Fetch-Site: same-origin`; clients without Fetch Metadata are checked against the requested Host and scheme. This handles Next/proxy adapters that reconstruct an internal localhost URL without accepting arbitrary forwarded hostnames.

The hosted `order-notifications` Edge Function generates Romanian PDFs and drains the initial and status-update queues. Its service credentials are supplied by Supabase; a sending-only Resend key is encrypted in Vault as `toylogix_order_resend_key`. The service-only `order_mail_config()` RPC supplies `comenzi@toylogix.eu`, the admin recipient `romehmetsafi@gmail.com`, and `https://toylogix.eu` tracking links. Health information is available only to verified administrators. Queue wakeups cannot set recipients or email content. JWT verification stays enabled.

Apply the follow-up migrations `20260930114947_order_tracking_notifications.sql`, `20260930121353_order_email_worker.sql`, and `20260930121919_order_worker_access.sql`. Store the deployment URL and public anon JWT under the Vault names `toylogix_order_project_url` and `toylogix_order_anon_key`. A named Supabase Cron job retries every five minutes, independently of the web host or local development computer. Order creation, receipt upload and admin transitions also wake the worker. Missing mail configuration leaves the notification queued while the order remains saved. `AUTH_RATE_LIMIT_SECRET` remains required only for the separate hardened authentication feature.

Alternatively, the Node/Netlify delivery path accepts server-only `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATION_FROM`, and `NOTIFICATION_TO`. Never expose server credentials in public variables.

The bank configuration now uses the user-provided `RO49 BTRL 0000 1234 5678 9001`, beneficiary `ToyLogix`, and bank `Banca Transilvania`. To change these details, use a privileged SQL session:

```sql
update public.b2b_payment_settings
set iban = '<verified IBAN>', beneficiary = '<legal recipient name>', bank = '<bank name>'
where id = true;
```

Orders snapshot these values at creation; configuration changes normally affect new orders. The tracking migration also updates open orders created with the prior placeholder account. Product prices are treated as net wholesale prices in RON; the implementation adds no VAT or shipping formula.

`netlify/functions/order-notifications.ts` retries unsent notifications every five minutes on Netlify. On another host, schedule this same worker with that host's scheduler. Failure to send mail never rolls back or duplicates a saved order. Notifications are claimed atomically and individual recipient sends use provider idempotency keys. Successful delivery is acknowledged only after both recipient messages succeed. The PDF uses the bundled Noto Sans font on the server and includes `public/fonts/NotoSans.ttf` in deployment through `next.config.ts` and `netlify.toml`.

## Customer flow

1. Choose whole boxes, then press **Trimite cererea de comandă**.
2. Server prices, package sizes, archive status and stock are validated. Changed carts require review. Quantities, prices and billing details are snapshotted; stock is not reserved at request time.
3. A year-based reference such as `TLX-2026-0042` is generated atomically. Retries with the same account and request key return the original order.
4. `/store/orders?order=<id>` displays the saved request, net amount, bank details, and mandatory transfer reference. Customers should transfer after approval.
5. Receipt upload is optional, including on the success screen. PDF, PNG and JPG files up to 5 MB are checked by their signatures. Uploading a receipt changes an open order to `payment_under_review`; it does not confirm money was received.
6. **Comenzile mele** is accessible from the store navigation, account menu and cart. Status cards and a four-step progress display refresh every 15 seconds and on focus. Waiting indicators pulse; confirmed payments show a green check. The timeline records every change. Search, state filters and paginated history retain completed and cancelled orders. Files have private paths in `receipt_url`; viewing uses a signed URL valid for 60 seconds.
7. The notification bell shows unread order events and links directly to their order. Reading notifications updates only the current user's marker. The PDF summary is downloadable from the order detail without Resend credentials.

## Admin flow and state machine

Open **Comenzi B2B** from `/admin`, then select an order. The dashboard shows counts by stage, recent orders and unread notifications. Uploaded receipts are marked in the list and displayed in a dedicated **Dovada plății** section near the top of the detail, before payment actions. PNG/JPG images and PDFs have an inline preview plus a direct new-tab link; five-minute private signed links can be refreshed without asynchronous popup creation. CSP permits PDF frames only from the configured Supabase origin. View company details, product snapshots, the total, immutable status history and email delivery state. Queued notifications can be retried from the detail page once Resend is configured.

- `pending_review` → `awaiting_payment`: **Aprobă cererea / proforma**.
- `pending_review`, `awaiting_payment`, or `payment_under_review` → `payment_under_review`: customer uploads optional receipt.
- `awaiting_payment` or `payment_under_review` → `payment_confirmed`: **Confirmă plata**, with or without a receipt.
- Any open order → `rejected` / `cancelled`: **Respinge cererea / Respinge plata** or **Anulează comanda**.

Terminal orders cannot be reopened or accept new receipts. Admin decisions are checked against current database privileges, including the existing MFA/session checks when account hardening is enabled. Customers cannot update financial details or status directly.

Payment confirmation locks the order, creates stock-out movements in product ID order, and updates status in one transaction. Stock is measured in boxes. Duplicate confirmations do not deduct twice. A shortage or archived product rolls back the entire confirmation; the administrator must reconcile availability first. Confirmed orders cannot be cancelled through this workflow: financial refunds and audited stock returns require a separate process.

## Verification

`npm test`, `npm run typecheck`, and `npm run lint` cover the existing application and order security tests. `tests/b2b-orders-database.test.mjs` exercises migrations, customer isolation, receipt ownership, transitions, idempotency, one-time stock deduction and stock-failure rollback using local PostgreSQL-compatible PGlite. Browser fixtures do not send mail or write live records.
