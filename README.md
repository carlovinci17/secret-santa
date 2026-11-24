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

- **Storage:** locally, data lives in one JSON file (`data/db.json`, git-ignored), written atomically. When `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set (as on Vercel), everything is stored as a single key, `secret-santa:db`, in Upstash Redis instead. Each API request loads the latest data and saves any changes before responding.
- The local file and the Redis database are separate: data added on your machine does not appear on the deployed site, and vice versa.
- Redeploying or pushing code never touches the stored data, so participants, links and draws survive deploys.
- Links look like `https://your-site/s/<random-token>`. Tokens are 144-bit random, so they can't be guessed. The reveal API only ever returns the one name for that token.
- Adding/removing people or changing exclusions cancels an existing draw (the admin panel warns you first). Renaming does not.
- Links stay the same across redraws, so you only send them once.

## Deploy

Participants need to reach it over the internet, so host it somewhere public:

**Vercel** (this is how the live site runs)
1. Import the GitHub repo at vercel.com/new. Vercel detects Express from `server.js`, so no build settings are needed. If the repo doesn't show up, give Vercel's GitHub app access to it at github.com/settings/installations.
2. In the project's *Storage* tab, add **Upstash for Redis** from the Marketplace and connect it. This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the app uses instead of `db.json` (Vercel's filesystem isn't persistent).
3. Under *Settings → Environment Variables* add `ADMIN_PASSWORD` and `SESSION_SECRET` (required here, since each serverless instance would otherwise pick its own secret), then redeploy. Env var changes only apply to new deployments.
4. Every push to `main` deploys to production automatically.

Notes for Vercel:
- Share the project's public production domain (`<project>.vercel.app`, under *Settings → Domains*). The other generated URLs are behind Vercel's deployment protection and ask visitors to log in to Vercel. Participant links use whatever address you opened the admin panel on, so open it via the public domain.
- `vercel.json` serves `/admin` and `/s/<token>` as static pages and adds `noindex` / `no-referrer` headers to participant links.
- The login lockout (5 wrong tries → 5 minutes) is tracked per server instance, so it's weaker on serverless. Use a long random `ADMIN_PASSWORD`.
- To change the password, edit `ADMIN_PASSWORD` in the project settings and redeploy.

**Azure App Service (Linux, Node 20)**
1. Create the Web App, then under *Configuration* add `ADMIN_PASSWORD`, `SESSION_SECRET` and `DATA_DIR=/home/data` (`/home` persists across restarts and deploys).
2. Deploy with `az webapp up --name <app-name> --runtime "NODE:20-lts"` from this folder, or via VS Code / GitHub Actions.

**Render / Railway / Fly.io** also work: start command `npm start`, set the env vars, and attach a persistent disk pointed at `DATA_DIR`.

## Tests

```bash
npm test
```
