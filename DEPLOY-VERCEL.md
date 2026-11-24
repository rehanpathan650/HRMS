# Deploying Attendly to Vercel

You'll set up four free-tier services, then connect them in Vercel. Plan on about 30–45 minutes the first time.

| Service | Used for | Free tier |
| --- | --- | --- |
| [Vercel](https://vercel.com) | Hosting the app (HTTPS included) | Hobby is **non-commercial only**; a company HRMS needs **Pro ($20/mo)** |
| [Neon](https://neon.tech) | PostgreSQL database | Yes |
| [Upstash](https://upstash.com) | Redis (login/rate limiting) | Yes |
| [Cloudflare R2](https://dash.cloudflare.com) | Private storage for selfies and photos | Yes (10 GB) |

> **Never paste secrets into chat, issues or code.** Put them only in Vercel's Environment Variables screen
> and in your local `.env.vercel` file (gitignored).

**Pick one region and use it everywhere.** For India, use **Mumbai (ap-south-1)** where available, otherwise
**Singapore (ap-southeast-1)**. A database far from the app makes every page slow.

---

## 1. Merge the code into `master`

Vercel deploys your production branch. `master` currently has only the starter commit, so on GitHub open a
pull request from **`feat/attendly-hrms` → `master`** and merge it.
(Alternatively set Vercel's production branch to `feat/attendly-hrms` in step 5.)

## 2. Database — Neon

> **Easiest:** in your Vercel project open **Storage → Create Database → Neon**, pick Mumbai/Singapore and connect it.
> Vercel adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically (the build uses the latter for migrations),
> so skip the manual steps below. For step 7, copy those two values from Vercel → Settings → Environment Variables.


1. Create a project (Postgres 16, region as above).
2. On the dashboard, click **Connect** and copy two connection strings:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL`. Append `&pgbouncer=true&connect_timeout=15`.
   - **Direct** (toggle "Connection pooling" off) → this is `DIRECT_URL`.

   Both end with `?sslmode=require`.

## 3. Redis — Upstash

> **Easiest:** Vercel → **Storage → Create Database → Upstash (Redis)**, same region, connect it. Vercel adds `KV_URL`,
> which the app uses automatically. Skip the manual steps below.


1. Create a **Redis** database in the same region. Enable **TLS** (default).
2. Copy the **`rediss://default:…@….upstash.io:6379`** URL → this is `REDIS_URL`.

## 4. File storage — Cloudflare R2

1. **R2 → Create bucket** named `attendly-evidence`. Leave **public access off** (the app uses short-lived signed URLs).
2. **R2 → Manage R2 API Tokens → Create API token**: permission **Object Read & Write**, limited to that bucket.
3. Note the **Access Key ID**, **Secret Access Key**, and the endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

## 5. Vercel project

1. **Add New → Project**, import `rehanpathan650/HRMS`. Framework is detected as Next.js; leave the build settings
   alone (`vercel.json` sets the build command, which also applies database migrations).
2. **Settings → Functions → Function Region**: same region as the database (e.g. Mumbai `bom1`).
3. **Settings → Environment Variables** (Production). If you ran the setup with Claude, the ready-to-paste values
   (with `APP_SECRET`/`CRON_SECRET` already generated) are in your local, gitignored `VERCEL-ENV.local.md`.
   Otherwise generate each secret with:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   | Name | Value |
   | --- | --- |
   | `APP_URL` | `https://<your-project>.vercel.app` (update after step 6 if different) |
   | `DATABASE_URL` | Neon **pooled** URL (with `&pgbouncer=true&connect_timeout=15`) |
   | `DIRECT_URL` | Neon **direct** URL |
   | `REDIS_URL` | Upstash `rediss://…` URL |
   | `APP_SECRET` | new random value |
   | `CRON_SECRET` | another new random value |
   | `TRUST_PROXY` | `true` |
   | `SESSION_TTL_HOURS` | `12` |
   | `STORAGE_DRIVER` | `s3` |
   | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `attendly-evidence` |
   | `S3_ACCESS_KEY_ID` | R2 access key ID |
   | `S3_SECRET_ACCESS_KEY` | R2 secret access key |
   | `S3_FORCE_PATH_STYLE` | `true` |

   Do **not** set `NODE_ENV` or `DEV_EXPOSE_RESET_LINK`.

## 6. Deploy

Click **Deploy**. The build generates the Prisma client, **applies all migrations to Neon**, and builds the app.
When it finishes, note the URL. If it differs from what you put in `APP_URL`, fix `APP_URL` and
**Redeploy** (Deployments → ⋯ → Redeploy).

## 7. Create your admin account

On your computer, in the project folder, create a file named **`.env.vercel`** (gitignored) containing only:

```
DATABASE_URL=<Neon pooled URL>
DIRECT_URL=<Neon direct URL>
```

Then run (one line, edit the values):

```powershell
npm run setup:prod -- --email you@yourcompany.com --first Your --last Name --company "Your Company" --timezone Asia/Kolkata --app-url https://<your-project>.vercel.app
```

It creates company settings, a default shift (09:30–18:30, Mon–Fri) and leave types, and your admin account — no
demo data. The admin password is written to **`CREDENTIALS.production.local.md`** (gitignored); you must change it at
first sign-in. Re-running is safe; add `--reset-password` to issue a new admin password.

## 8. First sign-in checklist

1. Sign in at `https://<your-project>.vercel.app/login` and set a new password.
2. **Settings → Offices → Add office**: stand in the office and click **Use my location**; radius 100–200 m;
   mark it **Default**.
3. **Settings → Shifts**: set real working hours and grace period.
4. **Settings → General & policy**: confirm timezone, remote-attendance rule, GPS accuracy limit.
5. **Departments**, then **Employees → Add employee**. Each new employee gets a one-time temporary password
   (shown once) and must change it at first sign-in.
6. Test a check-in from a phone over HTTPS.

## 9. Custom domain (optional)

Vercel → **Settings → Domains → Add** (e.g. `hrms.yourcompany.com`), follow the DNS instructions, then set
`APP_URL=https://hrms.yourcompany.com` and redeploy. Use one address only; redirect `www`/the `vercel.app` URL to it.

---

## How it runs on Vercel

- **Migrations** run automatically on every deploy (`npm run vercel-build`).
- **Data retention** runs daily at 03:00 IST via Vercel Cron → `/api/cron/retention`, authenticated with
  `CRON_SECRET`. Selfies older than the retention period are deleted from R2.
- **Selfies/avatars** live in the private R2 bucket; the browser only gets 5-minute signed links.
- **Rate limiting** is shared across all serverless instances through Upstash.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails at `prisma migrate deploy` | `DIRECT_URL` missing or is the pooled URL; use Neon's direct URL. |
| "Cross-origin request blocked" | `APP_URL` doesn't exactly match the address in the browser (scheme + host). Fix and redeploy. |
| Selfies don't display | Check the `S3_*` variables, `S3_FORCE_PATH_STYLE=true`, and redeploy (the CSP is built from `S3_ENDPOINT`). |
| `APP_SECRET is still a placeholder` | Set a real random `APP_SECRET`. |
| Slow pages | Function region and database region differ. |
| Password reset emails | Not built in. Reset links appear in Vercel → Logs; admins can also reset passwords from the employee page. |
