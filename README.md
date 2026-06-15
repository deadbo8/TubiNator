# Tubinator

Turn any topic into a personalized learning journey. Tubinator uses an LLM (via
Groq) to generate a structured course outline, then matches each lesson with the
best tutorial on YouTube. 100% free / open-source stack, designed to run on a
single small VM (e.g. Oracle Cloud Always Free).

## Tech stack

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| Framework    | Next.js 14 (App Router) + TypeScript                |
| UI           | Tailwind CSS + Framer Motion (glassmorphic theme)   |
| Auth         | Auth.js (NextAuth v5): Google OAuth + email/password |
| Database     | PostgreSQL + Prisma ORM                             |
| AI engine    | Groq API (Llama 3.3 70B, JSON mode)                 |
| Video source | YouTube Data API v3 (quota-aware, cached)           |
| Deploy       | Docker Compose: app + Postgres + Caddy (HTTPS)      |

## Features

- **Hybrid keys (BYOK):** runs on shared "house" keys by default with a daily
  free-generation cap; power users can add their own Groq / YouTube keys in
  Settings to bypass the cap and run on their own quota. User keys are encrypted
  at rest with AES-256-GCM.
- **Quota-aware YouTube lookup:** two-step `search.list` + `videos.list`, with
  duration filtering and a views/likes ranking. Results are cached in Postgres
  and shared across users, and videos are only fetched the first time a lesson
  is opened (lazy).
- **Course caching:** identical `topic + level + goal` requests reuse a single
  generated course.
- **Progress tracking:** per-user lesson completion with progress bars.

---

## 1. Prerequisites

- A Linux VM with Docker and the Docker Compose plugin installed.
  - On Oracle Cloud Always Free (Ampere ARM), the images used here are all
    multi-arch and build natively on ARM64.
- A domain name pointed at the VM (optional, but needed for automatic HTTPS).
- API credentials:
  - **Groq API key** - https://console.groq.com/keys
  - **YouTube Data API v3 key** - https://console.cloud.google.com/apis/credentials
  - **Google OAuth client** (optional, for Google login) - same console,
    Authorized redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google`

## 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
# generate strong secrets
openssl rand -base64 32   # -> AUTH_SECRET
openssl rand -hex 32      # -> ENCRYPTION_KEY
```

Set at minimum:

- `POSTGRES_PASSWORD` - a strong password
- `AUTH_SECRET` - from the command above
- `ENCRYPTION_KEY` - from the command above (must be 32 bytes / 64 hex chars)
- `NEXTAUTH_URL` - e.g. `https://yourdomain.com`
- `DOMAIN` - e.g. `yourdomain.com` (or `localhost` for local testing)
- `GROQ_API_KEY`, `YOUTUBE_API_KEY` - your house keys
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` - only if using Google login

> `DATABASE_URL` is injected automatically by docker-compose to point at the
> `db` service, so you don't need to change it for the Docker deploy.

## 3. Create the first migration

The repo ships without a committed migration. Generate one once (locally or on
the server with Node + a reachable Postgres):

```bash
npm install
npx prisma migrate dev --name init
```

This creates `prisma/migrations/*`. Commit it. On every container start the
entrypoint runs `prisma migrate deploy` to apply migrations automatically.

> Prefer not to run Node locally? You can instead use `prisma db push` once
> against the running `db` container, but committing a real migration is
> recommended for production.

## 4. Build and run

```bash
docker compose up -d --build
```

This starts three containers:

- `db` - PostgreSQL 16 (data persisted in the `pgdata` volume)
- `web` - the Next.js app on port 3000
- `caddy` - reverse proxy on host ports 8080 (HTTP) / 9443 (HTTPS, self-signed)

> **Port mapping (Option B).** The public 80/443 on this host are used by other
> containers, so Tubinator is remapped to free ports: web -> 127.0.0.1:3002
> (localhost only), caddy HTTP -> 8080, caddy HTTPS -> 9443 (self-signed via
> `tls internal`). Automatic Let's Encrypt is disabled because ACME needs the
> public 80/443.

Visit `http://YOUR_HOST:8080` or `https://YOUR_HOST:9443` (browsers warn on the
self-signed cert). For a trusted cert, route the app through your existing main
Caddy/nginx instead of running this `caddy` service.

## 4b. Free domain + trusted HTTPS with DuckDNS

You don't need a domain to run Tubinator (IP + self-signed cert works), but a
free DuckDNS hostname gives you a clean URL and a trusted Let's Encrypt cert.

**Recommended setup (route through an existing Caddy that owns 80/443):**

1. Sign in at https://www.duckdns.org with GitHub/Google and create a subdomain,
   e.g. `tubinator`. You get `tubinator.duckdns.org` and a token.
2. Point it at your server's public IP (set it on the DuckDNS dashboard, or run
   their updater so it auto-tracks your IP).
3. Start Tubinator WITHOUT the bundled proxy (default). This runs db + web only,
   with the app on `127.0.0.1:3002`:
   ```bash
   docker compose up -d --build
   ```
4. Add a site block to your EXISTING main Caddy and reload it:
   ```
   tubinator.duckdns.org {
       reverse_proxy 127.0.0.1:3002
   }
   ```
   Your main Caddy already holds 80/443, so it fetches a free Let's Encrypt cert
   automatically over the HTTP-01 challenge. No DNS plugin needed.
5. Set `NEXTAUTH_URL=https://tubinator.duckdns.org` in `.env` and restart web:
   ```bash
   docker compose up -d web
   ```

Visit `https://tubinator.duckdns.org` — trusted HTTPS, no port in the URL.

**Alternative (no existing proxy): bundled Caddy + DuckDNS DNS challenge.** The
stock `caddy:2-alpine` image lacks the DuckDNS DNS plugin, so you'd need a custom
image built with `xcaddy --with github.com/caddy-dns/duckdns` and a `tls { dns
duckdns <token> }` block. Routing through an existing Caddy (above) is simpler.

## 5. Useful commands

```bash
docker compose logs -f web      # tail app logs
docker compose ps               # container status
docker compose down             # stop
docker compose down -v          # stop and wipe the database volume
docker compose exec web npx prisma studio  # inspect data (port 5555)
```

---

## Local development (without Docker)

```bash
npm install
# point DATABASE_URL at a local Postgres, fill .env
npx prisma migrate dev
npm run dev
```

App runs at http://localhost:3000.

## Project structure

```
src/
  auth.ts            # Auth.js full config (Prisma adapter + providers)
  auth.config.ts     # edge-safe config used by middleware
  middleware.ts      # route protection
  lib/
    prisma.ts        # Prisma client singleton
    crypto.ts        # AES-256-GCM encrypt/decrypt for BYOK keys
    keys.ts          # key resolution (user -> house) + house rate limit
    groq.ts          # course outline generation (JSON + Zod validation)
    youtube.ts       # quota-aware search + ranking
    utils.ts
  types/course.ts    # Zod schemas
  app/
    page.tsx         # landing
    login, register  # auth pages
    dashboard        # enrolled courses + progress
    generate         # 3-step course wizard
    courses/[id]     # course player
    settings         # BYOK key management
    api/             # route handlers
prisma/schema.prisma
```

## Notes & quotas

- YouTube `search.list` costs 100 units; the default 10,000 units/day budget is
  ~100 lesson lookups/day on the house key. Lazy fetching + caching stretches
  this a long way; power users on their own keys don't touch the house budget.
- Groq free tier is generous but rate-limited; the house daily generation cap
  (`HOUSE_DAILY_LIMIT`, default 5) protects it. BYOK users bypass the cap.
- The YouTube API no longer exposes dislike counts (removed in 2021), so ranking
  uses views + likes only.

## 7. Telegram bot (full app, in chat)

Tubinator ships a pure chat bot (Python / aiogram) that replicates the whole
web experience inside Telegram: generate courses, browse modules & lessons,
watch the picked YouTube video, track progress, and optionally bring your own
API keys. It talks to the same backend over a private, secret-protected API
(`/api/bot/*`) on the internal Docker network, so nothing extra is exposed to
the internet.

### Setup

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token.
2. In your `.env`, set:
   - `BOT_TOKEN` = the token from BotFather
   - `BOT_API_SECRET` = a random secret shared by the web API and the bot.
     Generate one with: `openssl rand -hex 24`
3. Build and start everything (db + web + bot):
   ```bash
   docker compose up -d --build
   ```
   The `bot` service polls Telegram (long polling) and reaches the web app at
   `http://web:3000` inside the Docker network, so it is unaffected by the
   host port remap (127.0.0.1:3002).

### Using it

- `/learn` - wizard: topic -> level (Beginner/Intermediate/Advanced) -> goal,
  then it generates your course.
- `/courses` - list your courses with progress; tap one to open it.
- Inside a course, each lesson has a watch button (sends the YouTube link,
  which Telegram plays inline) and a checkbox to toggle completion.
- `/settings` - add or clear your own Groq / YouTube keys (BYOK). Your key
  message is auto-deleted after it is stored encrypted.
- `/cancel` - abort the current wizard. `/help` - command list.

### Notes

- The bot identifies users by their Telegram ID (`telegramId` on `User`),
  so a fresh DB migration is required before first run (see section 2).
- Videos are sent as links rather than uploads; Telegram renders an inline
  player. This keeps the bot fast and within Telegram's file limits.
