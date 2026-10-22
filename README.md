# text-invaders
Space Invaders but with text and ascii

## ASCII arcade

The game opens on a pixel-letter **Txt Invaders** title screen. Click or tap **Start** (or focus it and press Enter or Space) to begin the first wave. A short control hint adapts to keyboard or touch screens.

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

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Build with `npm run build`.

Run `npm test` to check the bundled sample catalog, quote accuracy, new-game selection, and wave transitions at desktop, mobile, and landscape sizes. The simulation checks cover remaining enemy shots, paused input, countdown timing, text atlas rebuilding, and restarts.

The player, shots, and motion live in `main.js`; page styling lives in `style.css`. `literature.js` selects readings and quotes from the UTF-8 `.txt` files in `literature/samples/` and source metadata in `literature/sources.json`. Vite bundles the samples for immediate loading without runtime requests to Gutenberg. There are no runtime dependencies.
