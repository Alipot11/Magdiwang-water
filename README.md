# Magdiwang Water Supply System (v2)

Cloudflare Workers + Hono + D1 (SQLite). Plain HTML/CSS/JavaScript frontend, no framework, no build step.

| | |
|---|---|
| Residents | `/` account lookup (meter number + first name + last name), `/complaint.html` complaint form. English / Filipino. |
| Admin | everything: customers, bulk bill entry, payments, void, reports, complaints, staff accounts, audit log, backup, analytics for all barangays |
| Treasurer / Staff | locked to ONE barangay: search, record + void payments, receipts, daily report, analytics for that barangay. One active treasurer per barangay, any number of backup staff. |

## Rules enforced by the database (see `migrations/`)
- One bill per meter per month (`UNIQUE(meter_id, billing_period)`), consumption and totals must add up.
- Payments are whole pesos, can never exceed the bill balance, cannot be edited or deleted, only **voided** (reason required).
- Official receipt numbers `OR-YYYY-NNNNNN`, gap-free, allocated atomically with the payment.
- Audit log rows for bills and payments are written by database triggers; the log is read-only.
- One active treasurer per barangay.

## First-time setup
Requires Node 20+ and a free Cloudflare account.

```bash
npm install
npx wrangler login

# 1. two SEPARATE databases
npx wrangler d1 create magdiwang-water-staging
npx wrangler d1 create magdiwang-water-prod
# copy each database_id into wrangler.toml (REPLACE_WITH_... lines)

# 2. local development (fake data)
cp .dev.vars.example .dev.vars          # sets ENVIRONMENT=local
npm run db:local                        # migrations + FAKE seed into the local sqlite file
npm run dev                             # http://localhost:8787
```
Fake logins printed by the seed: `admin` / `Staging-Admin-2026!`, `treasurer_ipil` (or `staff_ipil`, any barangay without dashes) / `Staging-Treasurer-2026!`.

### Staging (live testing, training, restore drills)
```bash
npm run migrate:staging
npm run seed:staging                    # FAKE data only
npm run deploy:staging                  # https://magdiwang-water-staging.<your-subdomain>.workers.dev
```
Every staging page shows a yellow TEST banner. Staging has its own database, its own Worker and its own accounts. Never copy real resident data into it except during a restore drill, and wipe it afterwards.

### Production
```bash
npm run migrate:production
node scripts/create-admin.mjs <username> "<Full Name>"   # prints a wrangler command; run it
npm run deploy:production
```
Then add your domain to the Worker (Cloudflare dashboard > Workers > magdiwang-water > Settings > Domains & Routes).
Never run `seed:staging` or `db:local` against production.

## Release checklist
1. `npm run check` and `npm test`
2. `npm run migrate:staging`, `npm run deploy:staging`, test the change on staging
3. `npm run backup` (production)
4. `npm run migrate:production`, `npm run deploy:production`

## Backups (local only)
- `npm run backup` exports the whole production database to `backups/magdiwang-production-<date>.sql` on this computer, keeps the newest 12, and tells the dashboard a backup was taken. Copy the file to a USB drive or a second computer. Treat it as confidential.
- Admin > Backup also has a "Download backup file" button (JSON, convenience copy).
- The dashboard warns admins when the last backup is more than 7 days old.
- **Restore drill (do once before go-live):** create a throwaway D1 database, run `npx wrangler d1 execute <throwaway-name> --remote --file backups/<file>.sql`, then compare row counts (`SELECT COUNT(*) FROM customers/bills/payments`) with production. Delete the throwaway database afterwards.
- D1 Time Travel (point-in-time recovery) also exists as an extra safety net; check the retention window for your plan.

## Security notes
- Passwords: PBKDF2-SHA256 (100k iterations, the Workers maximum). Sessions: random token in an HttpOnly cookie, stored hashed in D1, 8 h lifetime, 2 h idle timeout, re-checked against the account every request (deactivating a user logs them out immediately). CSRF token on every change.
- Resident lookup returns the same answer for a wrong meter and a wrong name, and is rate-limited per IP and per meter. Names are easier to guess than a PIN, so the rate limit is what makes guessing impractical. A printed account PIN can be added later.
- Strict CSP (`public/_headers`): no inline scripts or styles anywhere.
- Add a Cloudflare Access rule in front of the staging Worker if you want it private.

## Known limits / to verify
- Not yet run against real Cloudflare: this was written without network access. The SQL (migrations, triggers, atomic payment insert, bulk sheet) was tested in SQLite; the JavaScript passes syntax checks and unit tests. Run it on staging first.
- D1 limits queries per Worker request on the free plan; bulk bill posting is capped at 50 bills per request (the page sends several requests automatically).
- Filipino wording should be reviewed by a native speaker.
- Dates use Philippine time (UTC+8) for "today", due-date checks and receipt years.
- Later: automatic surcharge, rate tiers, meter reading history (incl. meter replacement), disconnection tracking, 2FA / password reset, POS printer integration.
