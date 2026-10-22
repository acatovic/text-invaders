# Gameplay and presentation

[Back to the game](../README.md)

The game opens on a pixel-letter **Txt Invaders** title screen. Click or tap **Start** (or focus it and press Enter or Space) to begin the first wave. A short control hint adapts to keyboard or touch screens.

The startup screen also shows a shared **top-10 leaderboard** and **games played** counter. Qualifying players can save a public nickname after game over, or skip it and play again. **High scores** returns to the startup screen. Ties favor the higher wave, then the earlier submitted score.

The leaderboard and control hints use bold pixel lettering, with pink key highlights and a framed score table. The Silkscreen font is bundled locally under the [SIL Open Font License](../public/fonts/silkscreen-OFL.txt).

An ASCII spaceship sits at the bottom of a page of text. Move with **← / →** or **A / D**, and hold **Space** or the **left mouse button** to fire ASCII shots upward. The ship stays within the screen and only moves horizontally.

On a touch screen, hold and drag to move and fire.

Press **Esc** to pause or resume, or use **Resume** in the pause dialog. Pausing freezes combat, sound effects, and the countdown between waves. Release and press movement or fire controls again after resuming.

Three invader types attack in waves:

- **Red skimmers** move quickly and shoot downward. One hit, 100 points.
- **Blue hunters** aim their shots at your ship. Two hits, 200 points.
- **Orange bombers** fire a three-shot spread. Three hits, 300 points.

You have three hull points and a short shield after taking damage. Clear the enemies to reveal a quote from the current background work: it pops into view, glows pink, and credits the author and title. The next, tougher wave begins after a six-second countdown. Movement and firing pause during the interlude, and remaining shots clear. After losing your ship, click **OK** in the game-over dialog to restart.

Each new game chooses a different work from twelve locally stored literature and poetry samples sourced from Project Gutenberg. Its paragraphs become the fluid background, with a varied starting paragraph and no back-to-back repeat of a work. Wave quotes come directly from that same excerpt, avoid consecutive repeats, and link to the original ebook. The bottom of the playfield also credits the current reading. See [the sample catalog and source notes](../literature/README.md).

Destroyed ships burst into colored ASCII fragments, sparks, and an expanding punctuation ring. Their shockwaves, the ship, and bullets push the background letters into a swirling current. Some letters turn pink, then gradually return to their original position and color. Reduced motion settings soften the disturbance and explosions.

Sound effects come from [Kenney’s Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds), released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/): `laserSmall_004.ogg` for player shots, `lowFrequency_explosion_000.ogg` for destroyed enemies, and `lowFrequency_explosion_001.ogg` for player death. Sounds load when you press Start and can overlap during combat. See [the sound credit](../public/audio-license.txt).

The tab icon uses the pink pixel invader. Social links include a title, description, and 1200 × 630 PNG preview through Open Graph and Twitter card metadata. The generated images are committed in `public/`; regenerate them with `npm run assets:generate` after installing Playwright’s Chromium browser. The generator reuses the existing title, ASCII ships, and bundled font.

The game world is capped at 1440 × 900 and scales proportionally to fill larger windows. The background text repeats continuously and rewraps to fit. Simulation size and canvas resolution stay bounded on large and high-density screens.

