# text-invaders
Space Invaders but with text and ascii

## ASCII arcade

An ASCII spaceship sits at the bottom of a page of text. Move with **← / →** or **A / D**, and hold **Space** or the **left mouse button** to fire ASCII shots upward. The ship stays within the screen and only moves horizontally.

On a touch screen, hold and drag to move and fire.

Three invader types attack in waves:

- **Red skimmers** move quickly and shoot downward. One hit, 100 points.
- **Blue hunters** aim their shots at your ship. Two hits, 200 points.
- **Orange bombers** fire a three-shot spread. Three hits, 300 points.

You have three hull points and a short shield after taking damage. Clear the enemies to start a tougher wave. After losing your ship, press **R**, **Enter**, or **Space**, or use **Retry**.

Destroyed ships burst into colored ASCII fragments, sparks, and an expanding punctuation ring. Their shockwaves, the ship, and bullets push the background letters into a swirling current. Some letters turn pink, then gradually return to their original position and color. Reduced motion settings soften the disturbance and explosions.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Build with `npm run build`.

The text, player, shots, and motion live in `main.js`; page styling lives in `style.css`. There are no runtime dependencies.
