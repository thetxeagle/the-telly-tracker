<p align="center">
  <img src="web/public/telly-tracker-logo.svg" alt="Telly Tracker" width="520">
</p>

<p align="center">
  <a href="https://github.com/thetxeagle/the-telly-tracker/actions/workflows/publish-container.yml"><img alt="Container build" src="https://github.com/thetxeagle/the-telly-tracker/actions/workflows/publish-container.yml/badge.svg?branch=v0.1.0"></a>
  <a href="CHANGELOG.md"><img alt="Release v0.1.0" src="https://img.shields.io/badge/release-v0.1.0-ff6464?style=flat-square"></a>
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&amp;logo=docker&amp;logoColor=white">
  <img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white">
  <img alt="PostgreSQL 17" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&amp;logo=postgresql&amp;logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f4efe6?style=flat-square"></a>
</p>

# Telly Tracker

Telly Tracker is a private, multi-user release tracker for shows and movies. It records complete episode schedules, release dates, per-episode watched state, movie watched state, favorites, and future releases in a responsive dashboard.

TMDB supplies the stored show lifecycle status while TVmaze supplements episode and air-schedule data. Explicit provider states such as ended or canceled are shown as confirmed provider data. When a provider has not declared a show ended but its latest released episode is more than two years old, Telly Tracker labels it **Long hiatus · status unconfirmed** instead of claiming it was canceled. That warning is an inference, not a provider fact.

Built on:

- PostgreSQL 17
- React 19 and Vite
- Express 5
- Prisma 6

## Screenshots

> Screenshot titles and catalog entries are fictional demonstration content. The poster artwork was AI-generated specifically for Telly Tracker; it does not represent real productions, performers, or licensed show artwork.

![Telly Tracker home dashboard](docs/screenshots/home-dashboard.webp)

<details>
<summary><strong>View the complete interface gallery</strong></summary>

<table>
  <tr>
    <td><img src="docs/screenshots/sign-in-desktop.webp" alt="Desktop sign-in"><br><strong>Desktop sign-in</strong></td>
    <td><img src="docs/screenshots/library.webp" alt="Media library"><br><strong>Library</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/show-detail.webp" alt="Show detail and episode guide"><br><strong>Show detail and episode guide</strong></td>
    <td><img src="docs/screenshots/discover.webp" alt="Title discovery and JSON import"><br><strong>Discover and import</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/release-calendar.webp" alt="Release calendar"><br><strong>Release calendar</strong></td>
    <td><img src="docs/screenshots/account-settings.webp" alt="Account security and calendar settings"><br><strong>Account settings</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-access.webp" alt="Administration access settings"><br><strong>Administration: access</strong></td>
    <td><img src="docs/screenshots/admin-email.webp" alt="Administration email settings"><br><strong>Administration: email</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-users.webp" alt="Administration user management"><br><strong>Administration: users</strong></td>
    <td align="center"><img src="docs/screenshots/sign-in-mobile.webp" alt="Mobile sign-in" width="260"><br><strong>Mobile sign-in</strong></td>
  </tr>
</table>

</details>

## Features

- Media library import
- Internet calendar subscriptions
- TOTP two-factor authentication
- SMTP invitation delivery
- Multi-user, isolated personal libraries
- Recent and upcoming release tracking
- Open, invite-only, and closed registration modes

### Import your media library

Telly Tracker supports JSON import under Discover. Download or copy the ready-to-upload [`examples/library-import.example.json`](examples/library-import.example.json) file to use as a starting point. TMDB must be configured with `TMDB_ACCESS_TOKEN` for matching and imports.

## Quick Start with Docker

Use `openssl rand -hex 32` to generate secret credentials for the following environment variables:

- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_KEY`

Copy the templates, replace the secret placeholders in `.env`, then pull and start the public GHCR image:

```bash
cp .env.example .env
cp docker-compose-example.yml docker-compose.yml
docker compose pull && docker compose up -d
```

Open <http://localhost:8080>. The first-launch wizard creates the owner account, makes it the administrator, selects registration access, and optionally configures SMTP.

Complete the owner step from a trusted network before exposing a new installation publicly. Until the first account exists, anyone who can reach the registration endpoint can claim the owner role.

To load the fictional demo catalog and account, set `DEMO_SEED_DATA=true` in `.env` before starting the stack. The optional demo account is:

- Email: `demo@telly.local`
- Password: `demo1234`

### Configure SMTP

SMTP can be configured during first launch or later under **Admin → Email delivery**. Required fields are host, port, and sender email. Username and password are optional for trusted local relays. Use implicit TLS for port 465; leave it disabled for STARTTLS on port 587.

For deployment-managed email, set `SMTP_ENABLED` explicitly to `true` or `false` and provide the remaining `SMTP_*` values in `.env` or your container platform. Environment configuration takes precedence over values stored in PostgreSQL and makes the Admin email screen read-only:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=telly@example.com
SMTP_PASSWORD=replace-with-the-smtp-password
SMTP_FROM_NAME=Telly Tracker
SMTP_FROM_EMAIL=telly@example.com
```

Leave `SMTP_ENABLED` blank to configure SMTP during initialization or in the Admin portal. This distinction is intentional: a value of `false` means the deployment explicitly manages SMTP and keeps it disabled.

SMTP passwords are encrypted with AES-256-GCM before being stored in PostgreSQL and are never returned by the API. Set a stable, independent encryption secret before saving SMTP credentials:

```dotenv
SETTINGS_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

Changing that key later makes the saved SMTP password unreadable; enter and save the password again after an intentional key rotation. Administrators can send a test message to their own account and can choose whether each invitation is emailed. If delivery fails, the invitation link is still shown for manual delivery.

### Container layout

Telly Tracker ships as a single application container. The image builds React first, copies the compiled assets into the Node runtime, and runs one Express process. Express handles `/api/*`, serves static assets, and returns the React shell for client-side routes. PostgreSQL remains a separate service.

This removes nginx, the internal API proxy, and frontend/backend tag coordination while keeping one process in the application container. An external reverse proxy can still provide HTTPS, public routing, compression, or access controls.

### Use an existing PostgreSQL server

Telly Tracker can use an existing PostgreSQL 17+ server instead of the bundled `database` service. Create a dedicated database and login role, then point the API's `DATABASE_URL` at that server. URL-encode any reserved characters in the username or password.

The API runs Prisma migrations before startup and then maintains a connection pool. Allow the application role enough sessions for migrations, the API pool, and administration. As a PostgreSQL administrator, apply the repository's idempotent role configuration with `psql`:

```bash
psql "$POSTGRES_ADMIN_URL" \
  --set=app_role=thetellytracker \
  --set=connection_limit=20 \
  --file scripts/configure-postgres-role.sql
```

The command safely quotes the role name, defaults the role limit to `20` when `connection_limit` is omitted, and prints the applied limit. It requires a PostgreSQL administrator or another role allowed to alter the application role. It does not create the role or database.

When PostgreSQL runs in a local container, the same script can be streamed through that container's `psql` client; replace the container and administrator names when they differ:

```bash
docker exec -i postgres_server \
  psql -U postgres -d postgres \
  --set=app_role=thetellytracker \
  --set=connection_limit=20 \
  < scripts/configure-postgres-role.sql
```

In DBeaver, connect with an administrative account, open **SQL Editor → New SQL Script**, and run the equivalent statement:

```sql
ALTER ROLE thetellytracker CONNECTION LIMIT 20;
```

Keep Prisma's pool below the PostgreSQL role limit. For one API instance, the recommended settings are a five-connection pool and a ten-second pool timeout:

```dotenv
DATABASE_CONNECTION_LIMIT=5
DATABASE_POOL_TIMEOUT_SECONDS=10
```

For a custom Compose deployment, the resulting connection URL is:

```yaml
DATABASE_URL: "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:5432/${POSTGRES_DB}?schema=public&connection_limit=${DATABASE_CONNECTION_LIMIT:-5}&pool_timeout=${DATABASE_POOL_TIMEOUT_SECONDS:-10}"
```

If startup reports `FATAL: too many connections for role`, inspect the role limit and active sessions before raising it further:

```sql
SELECT rolname, rolconnlimit FROM pg_roles WHERE rolname = 'thetellytracker';
SELECT pid, application_name, client_addr, state
FROM pg_stat_activity
WHERE usename = 'thetellytracker';
```

## Environment Variables Configuration

The complete runtime contract lives in [`.env.example`](.env.example):

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | Yes | PostgreSQL database name. |
| `POSTGRES_USER` | Yes | PostgreSQL application user. |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password; replace the development value before deployment. |
| `DATABASE_CONNECTION_LIMIT` | No | Maximum Prisma connections per API instance; defaults to `5`. |
| `DATABASE_POOL_TIMEOUT_SECONDS` | No | Seconds Prisma waits for a pool connection; defaults to `10`. |
| `JWT_SECRET` | Yes | Secret used to sign login sessions; use at least 32 random characters. |
| `SETTINGS_ENCRYPTION_KEY` | Recommended | Stable 32+ character secret used to encrypt stored SMTP passwords and TOTP secrets; falls back to `JWT_SECRET` when omitted. |
| `ADMIN_EMAILS` | No | Optional comma-separated recovery emails promoted to administrator on registration or sign-in. |
| `SMTP_ENABLED` | No | Set to `true` or `false` to manage SMTP through the deployment; leave blank to use setup/Admin configuration. |
| `SMTP_HOST` | With environment SMTP | SMTP server hostname. |
| `SMTP_PORT` | No | SMTP server port; defaults to `587`. |
| `SMTP_SECURE` | No | `true` for implicit TLS, normally on port 465; otherwise use the server's STARTTLS policy. |
| `SMTP_USERNAME` | No | Optional SMTP authentication username. |
| `SMTP_PASSWORD` | No | Optional SMTP authentication password; keep it in a secret store or uncommitted `.env`. |
| `SMTP_FROM_NAME` | No | Sender display name; defaults to `Telly Tracker`. |
| `SMTP_FROM_EMAIL` | With enabled environment SMTP | Sender email address. |
| `WEB_PORT` | No | Host port for the web application; defaults to `8080`. |
| `WEB_ORIGIN` | Yes | Exact browser origin allowed by CORS and used to select secure cookies; use the public HTTPS URL in production, without a trailing slash. |
| `CALENDAR_PUBLIC_URL` | No | Public app origin used for ICS subscription and event links; defaults to `WEB_ORIGIN`. |
| `DEMO_SEED_DATA` | No | Loads the fictional catalog and demo account only when set to `true`. |
| `APP_IMAGE` | No | Full combined application image reference; defaults to `ghcr.io/thetxeagle/the-telly-tracker:v0.1.0`. |
| `WEB_DIST_DIR` | No | Internal path containing the compiled React application; the published image sets `/app/web-dist`. |
| `TMDB_ACCESS_TOKEN` | For real metadata | Server-side bearer token for movie/show discovery and artwork. |
| `TMDB_API_BASE_URL` | No | Overrides the TMDB API endpoint for testing or proxying. |
| `TMDB_IMAGE_BASE_URL` | No | Overrides the TMDB image CDN root. |
| `TVMAZE_API_BASE_URL` | No | Overrides the public TVmaze endpoint used for episode and schedule data. |
| `PROVIDER_TIMEOUT_MS` | No | Provider request timeout in milliseconds; defaults to `8000`. |
| `PROVIDER_MAX_RETRIES` | No | Retries for throttling, server errors, and network failures; defaults to `2`. |
| `PROVIDER_SEARCH_CACHE_TTL_MS` | No | In-memory TMDB search cache lifetime; defaults to five minutes. |
| `PROVIDER_REFRESH_INTERVAL_MS` | No | Stale-metadata refresh interval; defaults to six hours, or `0` to disable. |
| `PROVIDER_REFRESH_BATCH_SIZE` | No | Maximum titles refreshed per scheduled run; defaults to `25`. |

TVmaze's public API does not require a token. Keep `TMDB_ACCESS_TOKEN` server-side: do not add it to `web/`, prefix it with `VITE_`, commit `.env`, or expose it through a frontend route.

TMDB is the primary discovery, movie, show, and artwork source. TVmaze supplements television episodes and air schedules. Shows are matched through external IMDb or TheTVDB identifiers rather than titles alone. Both services require source attribution in the finished UI.

Telly Tracker does not scrape IMDb or require a separate IMDb API. Provider search results open an IMDb title search; after import, TMDB's stored IMDb identifier is used for an exact title-page link when available.

## Local development

Prerequisites: Node.js 22+, npm, and PostgreSQL 17+.

```bash
npm --prefix server install
npm --prefix web install
export DATABASE_URL='postgresql://telly:local-telly-password@localhost:5432/telly_tracker?schema=public&connection_limit=5&pool_timeout=10'
export JWT_SECRET='replace-with-at-least-32-random-characters'
export SETTINGS_ENCRYPTION_KEY='replace-with-a-separate-32-character-secret'
export TMDB_ACCESS_TOKEN='your-own-read-access-token'
npm --prefix server run db:deploy
# Optional fictional evaluation data only:
npm --prefix server run db:seed
npm run dev:api
```

In a second terminal:

```bash
npm run dev:web
```

The Vite app runs on port `5173` and proxies `/api` to port `3001`.

## Validation

```bash
npm run lint
npm test
npm run typecheck
npm run build
APP_ENV_FILE=.env.example docker compose --env-file .env.example -f docker-compose-example.yml config --quiet
docker compose -f docker-compose.dev.yml config --quiet
git diff --check
```

The PostgreSQL integration suite deploys migrations to the database named by `DATABASE_URL` and removes only its own uniquely named test records:

```bash
DATABASE_URL='postgresql://telly:password@localhost:5432/telly_tracker_test?schema=public' npm run test:integration
```

## Security notes

Authentication uses a seven-day HTTP-only, same-site cookie. Passwords are hashed with bcrypt. Optional TOTP secrets are encrypted at rest, login challenges are short-lived and attempt-limited, and recovery codes are stored only as keyed hashes. Internet-calendar URLs contain a signed, purpose-scoped bearer token; per-user token versions allow immediate revocation without storing the token itself. API mutations always derive the user identity from the verified session rather than accepting a user ID from the client.

This is an early private MVP. Before exposing it publicly, add request-rate limiting, CSRF protection for cross-site deployment scenarios, a production secret manager, email verification, password recovery, and a backup policy.
