# Development and deployment

[Back to the game](../README.md) · [Gameplay](GAMEPLAY.md) · [Credits and licenses](CREDITS.md)

## Run locally

Use Node.js 24 or later for development and tests.

```sh
npm install
npm run dev:full
```

Open `http://127.0.0.1:8787`. This builds the game, applies the local database migration, and starts Cloudflare’s local emulator. No Cloudflare account is needed. Local scores persist in `.wrangler/state/` and are separate from production.

For hot reload, first run `npm run dev:full` once, then use `npm run dev:api` in one terminal and `npm run dev` in another. Vite proxies `/api` to the local Worker. The game remains playable when the API is unavailable; it shows an unavailable message instead of inventing local scores or counts.

## Build and test

Build with `npm run build`. Run `npm test` for the game simulation and backend database tests. To run the browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser tests use a fresh isolated local database in `.wrangler/e2e-<random ID>/` on each run. They cover starts and restarts, nickname submission, a lost-response retry, persistence after reload, offline play, the mobile top-10 layout, sound playback, pause/resume, and the production bundle. Test scores never enter the development or production database.

## Shared leaderboard and counter

`worker.js` serves the API and passes other requests to the built game. D1 stores the data using `migrations/0001_leaderboard.sql`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/leaderboard` | Top 10 entries and total games played |
| `POST /api/runs` | Register a new game using a random UUID receipt; count it once, including retries |
| `POST /api/scores` | Save one score per registered run and return its current top-10 rank |

A game is counted when Start or OK is pressed, including runs abandoned before game over. This is a count of starts, not distinct people or page views. Run receipts expire after 24 hours and are cleaned up as new games are registered. A failed registration does not prevent play, but that run cannot submit a high score. Score submission can be retried safely after a connection failure.

Nicknames use 1–12 letters or numbers, optionally with spaces, periods, hyphens, or underscores. Names are rendered as text. The server validates input, score increments, wave bounds, and elapsed time; one receipt cannot submit multiple scores. Cloudflare rate-limits write requests to 30 per minute per connection IP at each location. These are basic abuse checks; the browser game does not provide authoritative cheat-proof scoring.

The database stores the chosen public nickname, score, wave, submission time, and random run receipt. There are no login accounts, analytics cookies, browser storage identifiers, or visitor profiles. Connection IPs are used transiently by Cloudflare’s abuse limiter and are not saved in the game database. Submitted scores remain stored until removed; only the top 10 are public. Cloudflare’s infrastructure processes network requests separately from this application.

## Launch on Cloudflare

`wrangler.jsonc` targets the production `txt-invaders` Worker and D1 database in the configured Cloudflare account, with `txtinvaders.com` as its custom domain. Local development and browser tests continue to use isolated local databases.

For your own deployment, create a database with `npx wrangler d1 create txt-invaders` after logging in, then replace `account_id`, `d1_databases[0].database_id`, and the custom domain in `wrangler.jsonc` with your own values.

```sh
npx wrangler login
npm run db:migrate:remote
npm run deploy
```

The deploy command attaches `txtinvaders.com` as a Worker custom domain using the route in `wrangler.jsonc`. The domain must be an active zone in the authenticated Cloudflare account. The API uses the same origin as the game, so there are no frontend API URLs or credentials to configure. Local test records are never uploaded.

To moderate an entry, find its numeric ID with a read query, then delete that ID. For example:

```sh
npx wrangler d1 execute DB --remote --command "SELECT id, name, score, wave FROM scores ORDER BY score DESC, wave DESC, id ASC LIMIT 10;"
npx wrangler d1 execute DB --remote --command "DELETE FROM scores WHERE id = 42;"
```

Cloudflare Web Analytics can be enabled separately when the domain is live. This implementation only adds the game counter and leaderboard.

The player, shots, and motion live in `main.js`; page styling lives in `style.css`. `community.js` manages the leaderboard UI and score submission. `literature.js` selects readings and quotes from the UTF-8 `.txt` files in `literature/samples/` and source metadata in `literature/sources.json`. Vite bundles the samples for immediate loading without runtime requests to Gutenberg. There are no client runtime dependencies.
