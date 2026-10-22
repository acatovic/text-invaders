# text-invaders
Space Invaders but with text and ascii

## ASCII arcade

The game opens on a pixel-letter **Txt Invaders** title screen. Click or tap **Start** (or focus it and press Enter or Space) to begin the first wave. A short control hint adapts to keyboard or touch screens.

The startup screen also shows a shared **top-10 leaderboard** and **games played** counter. Qualifying players can save a public nickname after game over, or skip it and play again. **High scores** returns to the startup screen. Ties favor the higher wave, then the earlier submitted score.

The leaderboard and control hints use bold pixel lettering, with pink key highlights and a framed score table. The Silkscreen font is bundled locally under the [SIL Open Font License](public/fonts/silkscreen-OFL.txt).

An ASCII spaceship sits at the bottom of a page of text. Move with **← / →** or **A / D**, and hold **Space** or the **left mouse button** to fire ASCII shots upward. The ship stays within the screen and only moves horizontally.

On a touch screen, hold and drag to move and fire.

Three invader types attack in waves:

- **Red skimmers** move quickly and shoot downward. One hit, 100 points.
- **Blue hunters** aim their shots at your ship. Two hits, 200 points.
- **Orange bombers** fire a three-shot spread. Three hits, 300 points.

You have three hull points and a short shield after taking damage. Clear the enemies to reveal a quote from the current background work: it pops into view, glows pink, and credits the author and title. The next, tougher wave begins after a six-second countdown. Movement and firing pause during the interlude, and remaining shots clear. After losing your ship, click **OK** in the game-over dialog to restart.

Each new game chooses a different work from twelve locally stored literature and poetry samples sourced from Project Gutenberg. Its paragraphs become the fluid background, with a varied starting paragraph and no back-to-back repeat of a work. Wave quotes come directly from that same excerpt, avoid consecutive repeats, and link to the original ebook. The bottom of the playfield also credits the current reading. See [the sample catalog and source notes](literature/README.md).

Destroyed ships burst into colored ASCII fragments, sparks, and an expanding punctuation ring. Their shockwaves, the ship, and bullets push the background letters into a swirling current. Some letters turn pink, then gradually return to their original position and color. Reduced motion settings soften the disturbance and explosions.

The game world is capped at 1440 × 900 and scales proportionally to fill larger windows. The background text repeats continuously and rewraps to fit. Simulation size and canvas resolution stay bounded on large and high-density screens.

Use Node.js 24 or later for development and tests.

```sh
npm install
npm run dev:full
```

Open `http://127.0.0.1:8787`. This builds the game, applies the local database migration, and starts Cloudflare’s local emulator. No Cloudflare account is needed. Local scores persist in `.wrangler/state/` and are separate from production.

For hot reload, first run `npm run dev:full` once, then use `npm run dev:api` in one terminal and `npm run dev` in another. Vite proxies `/api` to the local Worker. The game remains playable when the API is unavailable; it shows an unavailable message instead of inventing local scores or counts.

Build with `npm run build`. Run `npm test` for the game simulation and backend database tests. To run the browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser tests use a fresh isolated local database in `.wrangler/e2e-<random ID>/` on each run. They cover actual starts and restarts, nickname submission, a lost-response retry, persistence after reload, offline play, the mobile top-10 layout, and the production bundle. Test scores never enter the development or production database.

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

`wrangler.jsonc` is ready for Workers Static Assets plus D1. Its all-zero database ID is a local-development placeholder; replace it before deploying.

```sh
npx wrangler login
npx wrangler d1 create txt-invaders
```

Copy the created database ID into `d1_databases[0].database_id` in `wrangler.jsonc`, preserving the `DB` binding. Then:

```sh
npm run db:migrate:remote
npm run deploy
```

After deploying, attach `txtinvaders.com` as a Worker custom domain in Cloudflare. The API uses the same origin as the game, so there are no frontend API URLs or credentials to configure. Local test records are never uploaded. No remote database has been created or deployed by this change.

To moderate an entry, find its numeric ID with a read query, then delete that ID. For example:

```sh
npx wrangler d1 execute DB --remote --command "SELECT id, name, score, wave FROM scores ORDER BY score DESC, wave DESC, id ASC LIMIT 10;"
npx wrangler d1 execute DB --remote --command "DELETE FROM scores WHERE id = 42;"
```

Cloudflare Web Analytics can be enabled separately when the domain is live. This implementation only adds the game counter and leaderboard.

The player, shots, and motion live in `main.js`; page styling lives in `style.css`. `community.js` manages the leaderboard UI and score submission. `literature.js` selects readings and quotes from the UTF-8 `.txt` files in `literature/samples/` and source metadata in `literature/sources.json`. Vite bundles the samples for immediate loading without runtime requests to Gutenberg. There are no client runtime dependencies.
