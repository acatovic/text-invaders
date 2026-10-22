import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { before } from 'node:test';
import vm from 'node:vm';
import { build } from 'vite';

// Exercise Vite's actual raw-text imports, including the production catalog.
let readings;
let chooseReading;
let chooseQuote;
before(async () => {
  const bundle = await build({
    logLevel: 'silent',
    build: { ssr: 'literature.js', write: false, minify: false },
  });
  const moduleCode = bundle.output.find((file) => file.type === 'chunk').code;
  ({ readings, chooseReading, chooseQuote } = await import(
    `data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`
  ));
});
const gameCode = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  .replace(/^import .* from '\.\/(literature|community|audio)\.js';\n/gm, '');

function createGame(screenWidth, screenHeight, reducedMotion = false) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const frames = new Map();
  let nextFrame = 0;
  let nextReading = 0;
  const context = new Proxy({
    measureText: () => ({ width: 7 }),
    drawImage: (...args) => args.slice(1).forEach((value) => assert.ok(Number.isFinite(value))),
  }, {
    get: (target, name) => target[name] ?? (() => {}),
  });

  class Element {
    hidden = false;
    textContent = '';
    listeners = new Map();
    classes = new Set();
    classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    };
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    setAttribute() {}
    focus() {}
    blur() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    getContext() { return context; }
    getBoundingClientRect() { return { left: 0, width: screenWidth }; }
    setPointerCapture() {}
  }

  const elements = new Map();
  const document = {
    hidden: false,
    activeElement: new Element(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement: () => new Element(),
    addEventListener: (name, handler) => documentEvents.set(name, handler),
  };
  document.querySelector('main').classes.add('is-starting');
  document.querySelector('.wave-clear').hidden = true;
  document.querySelector('.game-over').hidden = true;
  const sandbox = vm.createContext({
    assert, document, HTMLElement: Element,
    // Cycle through every real excerpt to catch atlas and wrapping errors.
    chooseReading: () => readings[nextReading++ % readings.length],
    chooseQuote,
    setupCommunity: () => ({ startGame() {}, finishGame() {}, refresh() {} }),
    setupAudio: () => ({ unlock() {}, pause() {}, play() {} }),
    window: {
      innerWidth: screenWidth, innerHeight: screenHeight, devicePixelRatio: 2,
      addEventListener: (name, handler) => windowEvents.set(name, handler),
    },
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
    windowEvents, documentEvents,
  });
  vm.runInContext(gameCode, sandbox);
  return (code) => vm.runInContext(code, sandbox);
}

test('twelve bundled works contain authentic, bounded quote selections', () => {
  assert.equal(readings.length, 12);
  assert.equal(new Set(readings.map(({ id }) => id)).size, 12);
  for (const reading of readings) {
    const text = reading.paragraphs.join(' ').replace(/\s+/g, ' ');
    assert.ok(text.length > 800, reading.id);
    assert.doesNotMatch(text, /PROJECT GUTENBERG|\[Illustration|FULL LICENSE/);
    assert.ok(reading.quotes.length >= 3, reading.id);
    for (const quote of reading.quotes) {
      assert.ok(quote.length <= 150, quote);
      assert.ok(text.includes(quote), `${reading.id}: ${quote}`);
    }
  }
});

test('new games and wave quotes avoid consecutive repeats', () => {
  for (const previous of readings) {
    for (const value of [0, 0.25, 0.5, 0.9999]) {
      const next = chooseReading(previous.id, () => value);
      assert.notEqual(next.id, previous.id);
      assert.deepEqual([...next.paragraphs].sort(), [...readings.find(({ id }) => id === next.id).paragraphs].sort());
      for (const quote of previous.quotes) {
        assert.notEqual(chooseQuote(previous, quote, () => value), quote);
      }
    }
  }
});

test('Escape freezes gameplay and wave countdowns, clears input, and resumes without catching up', () => {
  const run = createGame(1440, 900);
  run(`
    const escape = (repeat = false) => windowEvents.get('keydown')({ code: 'Escape', repeat, preventDefault() {} });
    escape();
    assert.equal(game.paused, false);
    restartGame();
    fireShot();
    keys.add('Space'); keys.add('ArrowRight'); firingPointer = 1;
    escape();
    assert.equal(game.paused, true);
    assert.equal(pauseMenu.open, true);
    assert.equal(frame, 0);
    assert.equal(keys.size, 0);
    assert.equal(firingPointer, null);
    const snapshot = () => JSON.stringify({ game, ship, bullets, enemies, enemyBullets, explosions, letters, flow: [...flowX] });
    const frozen = snapshot();
    updateGame(30); update(30); fireShot(); hitShip();
    windowEvents.get('keydown')({ code: 'Space', preventDefault() {} });
    canvas.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerType: 'touch', pointerId: 2, clientX: 0, preventDefault() {} });
    documentEvents.get('visibilitychange')();
    wake();
    assert.equal(frame, 0);
    assert.equal(snapshot(), frozen);
    escape(true);
    assert.equal(game.paused, true);
    escape();
    assert.equal(game.paused, false);
    assert.equal(pauseMenu.open, false);
    assert.equal(previousTime, 0);
    assert.equal(accumulator, 0);
    assert.ok(frame > 0);
    const timeBefore = game.time;
    update(STEP);
    assert.equal(game.time, timeBefore + STEP);
    assert.equal(bullets.length, 1);

    enemies.length = 0; updateGame(STEP); updateGame(2);
    assert.equal(game.intermission, true);
    const countdownBefore = game.waveDelay;
    escape(); updateGame(30);
    assert.equal(game.waveDelay, countdownBefore);
    document.querySelector('.resume').listeners.get('click')();
    updateGame(STEP);
    assert.equal(game.waveDelay, countdownBefore + STEP);

    escape(); restartGame();
    assert.equal(game.paused, false);
    assert.equal(pauseMenu.open, false);
    for (let i = 0; i < 3; i++) { ship.invulnerable = 0; hitShip(); }
    escape();
    assert.equal(game.paused, false);
  `);
});

for (const [width, height, reducedMotion] of [[1440, 900, false], [390, 844, false], [640, 360, true]]) {
  test(`game flow, quotes, input, and restart at ${width} × ${height}`, () => {
    const run = createGame(width, height, reducedMotion);
    run(`
      assert.equal(game.started, false);
      assert.equal(enemies.length, 0);
      assert.equal(frame, 0);
      fireShot();
      assert.equal(bullets.length, 0);
      document.querySelector('.start').listeners.get('click')();
      assert.equal(game.wave, 1);
      assert.ok(enemies.length > 0);
      assert.equal(startScreen.hidden, true);
      assert.equal(readingCredit.href, reading.url);
      assert.equal(document.querySelector('.page-text').textContent, reading.paragraphs.join('\\n\\n'));

      // A lethal enemy shot overlaps the ship on the tick of the final kill.
      enemies.splice(1);
      const lastEnemy = enemies[0];
      lastEnemy.health = 1;
      lastEnemy.cooldown = 100;
      bullets.push({ x: lastEnemy.x, y: lastEnemy.y + lastEnemy.height });
      enemyBullets.push({ x: ship.x, y: ship.y, vx: 0, vy: 180 });
      ship.health = 1;
      ship.invulnerable = 0;
      keys.add('Space');
      firingPointer = 1;
      updateGame(STEP);
      assert.equal(game.intermission, true);
      assert.equal(game.over, false);
      assert.equal(ship.health, 1);
      assert.equal(game.score, lastEnemy.type.points);
      assert.equal(bullets.length + enemyBullets.length, 0);
      assert.equal(keys.size, 0);
      assert.equal(firingPointer, null);
      assert.equal(waveClearPanel.hidden, false);
      assert.ok(reading.quotes.includes(waveQuote.textContent));
      assert.equal(waveSource.href, reading.url);
      assert.match(waveCountdown.textContent, /02 IN 6$/);

      const pausedX = ship.x;
      windowEvents.get('keydown')({ code: 'Space', preventDefault() {} });
      windowEvents.get('keydown')({ code: 'ArrowRight', preventDefault() {} });
      canvas.listeners.get('pointerdown')({ button: 0, isPrimary: true, pointerType: 'touch', pointerId: 2, clientX: 0, preventDefault() {} });
      assert.equal(bullets.length, 0);
      assert.equal(keys.size, 0);
      assert.equal(ship.x, pausedX);
      for (let i = 0; i < 360; i++) updateGame(STEP);
      const elapsedBeforeResize = game.waveDelay;
      layout();
      assert.equal(game.waveDelay, elapsedBeforeResize);
      assert.equal(waveClearPanel.hidden, false);
      assert.equal(ship.x, pausedX);
      for (let i = 0; i < 359; i++) updateGame(STEP);
      assert.equal(game.wave, 1);
      assert.equal(enemies.length, 0);
      updateGame(STEP);
      assert.equal(game.wave, 2);
      assert.ok(enemies.length > 0);
      assert.equal(game.intermission, false);
      assert.equal(waveClearPanel.hidden, true);
      fireShot();
      assert.equal(bullets.length, 1);

      // A second completed wave gets another quote from the same reading.
      const firstQuote = waveQuote.textContent;
      enemies.length = 0;
      updateGame(STEP);
      assert.equal(game.intermission, true);
      assert.notEqual(waveQuote.textContent, firstQuote);
      assert.ok(reading.quotes.includes(waveQuote.textContent));

      // Restarting resets the interlude and rebuilds all text glyphs.
      let previousReading = reading.id;
      for (let i = 0; i < 12; i++) {
        restartGame();
        assert.notEqual(reading.id, previousReading);
        previousReading = reading.id;
        assert.equal(game.wave, 1);
        assert.equal(game.score, 0);
        assert.equal(game.waveDelay, 0);
        assert.equal(game.intermission, false);
        assert.equal(waveClearPanel.hidden, true);
        assert.equal(ship.health, 3);
        assert.ok(letters.length > 0);
        assert.ok(letters.every((letter) => Number.isInteger(letter.glyph)));
        draw();
      }
      for (let i = 0; i < 3; i++) { ship.invulnerable = 0; hitShip(); }
      assert.equal(game.over, true);
      assert.equal(gameOverPanel.hidden, false);
      document.querySelector('.restart').listeners.get('click')();
      assert.equal(game.over, false);
      assert.equal(gameOverPanel.hidden, true);
      assert.equal(game.wave, 1);
    `);
  });
}
