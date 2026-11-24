# 🎅 Secret Santa

A small self-hosted Secret Santa app.

- **Admin panel** (password protected) to add, rename and remove people
- **Exclusions**: choose who each person can't draw (with a "both ways" option for couples)
- **A private link per person**, created the moment you add them
- **Draw** names with one click. Every valid draw respects all exclusions, nobody gets themselves, and everyone gets exactly one person. If the exclusions make a draw impossible, it tells you who's causing it.
- **Reveal page**: the person opens their link, taps a present, and sees who they're buying for, plus the budget, date and your note
- See who has **opened** their link, **redraw** or **reset**, and **peek** at all pairings (hidden by default so you don't spoil it for yourself)
- **Copy message** button gives you a ready-to-paste text with the link for WhatsApp, SMS or email
- **New link** button if someone's link leaks (the old one stops working)

## Run it locally

Requires Node 18+.

```bash
npm install
ADMIN_PASSWORD=your-password npm start
```

Open http://localhost:3000/admin.

On Windows PowerShell: `$env:ADMIN_PASSWORD="your-password"; npm start`

## Settings (environment variables)

| Variable | Purpose | Default |
|---|---|---|
| `ADMIN_PASSWORD` | Organiser login password | `changeme` (set this!) |
| `SESSION_SECRET` | Signs the admin login cookie. Set a long random string so logins survive restarts | random per start |
| `PORT` | Port to listen on | `3000` |
| `DATA_DIR` | Folder for `db.json` | `./data` |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Store data in Upstash Redis instead of `db.json` | unset |

## How it works

- Data lives in one JSON file (`data/db.json`), written atomically. No database server needed.
- Links look like `https://your-site/s/<random-token>`. Tokens are 144-bit random, so they can't be guessed. The reveal API only ever returns the one name for that token.
- Adding/removing people or changing exclusions cancels an existing draw (the admin panel warns you first). Renaming does not.
- Links stay the same across redraws, so you only send them once.

## Deploy

Participants need to reach it over the internet, so host it somewhere public:

**Vercel**
1. Import the GitHub repo at vercel.com/new (no build settings needed).
2. In the project's *Storage* tab, add **Upstash for Redis** from the Marketplace and connect it. This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the app uses instead of `db.json` (Vercel's filesystem isn't persistent).
3. Under *Settings → Environment Variables* add `ADMIN_PASSWORD` and `SESSION_SECRET` (required here, since each serverless instance would otherwise pick its own secret), then redeploy.

**Azure App Service (Linux, Node 20)**
1. Create the Web App, then under *Configuration* add `ADMIN_PASSWORD`, `SESSION_SECRET` and `DATA_DIR=/home/data` (`/home` persists across restarts and deploys).
2. Deploy with `az webapp up --name <app-name> --runtime "NODE:20-lts"` from this folder, or via VS Code / GitHub Actions.

**Render / Railway / Fly.io** also work: start command `npm start`, set the env vars, and attach a persistent disk pointed at `DATA_DIR`.

## Tests

```bash
npm test
```
