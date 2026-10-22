import { chooseReading, chooseQuote } from './literature.js';
import { setupCommunity } from './community.js';
import { setupAudio } from './audio.js';

const community = setupCommunity();
const audio = setupAudio();

let reading = chooseReading();
let paragraphs = reading.paragraphs;
let previousQuote;

const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });

const BACKGROUND = '#f7f7f5';
const MAX_GAME_WIDTH = 1440;
const MAX_GAME_HEIGHT = 900;
const CELL = 28;
const STEP = 1 / 120;
const PALETTE_SIZE = 16;
const ACCENT = '#ed2388';
const PLAYER_COLOR = '#39ff14';
const PLAYER_EDGE = '#168a0b';
const SHIP_ART = ['   ^   ', '  /|\\  ', ' /###\\ ', '<==|==>'];
const SHIP_FONT_SIZE = 17;
const SHIP_LINE_HEIGHT = 17;
const SHIP_SPEED = 420;
const BULLET_SPEED = 640;
const FIRE_INTERVAL = 0.16;
const WAVE_INTERMISSION = 6;
const ENEMY_FONT_SIZE = 16;
const ENEMY_LINE_HEIGHT = 16;
const SPRITE_FONT_FAMILY = '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
const SHIP_FONT = `700 ${SHIP_FONT_SIZE}px ${SPRITE_FONT_FAMILY}`;
const ENEMY_FONT = `700 ${ENEMY_FONT_SIZE}px ${SPRITE_FONT_FAMILY}`;
const ENEMY_TYPES = [
  {
    name: 'skimmer', color: '#df3345', health: 1, points: 100, speed: 58,
    fireInterval: 3.8, shotSpeed: 180,
    art: [' \\ V / ', '<{o o}>', ' / W \\ '],
  },
  {
    name: 'hunter', color: '#236bdc', health: 2, points: 200, speed: 34,
    fireInterval: 4.5, shotSpeed: 215,
    art: ['  /M\\  ', ' [O=O] ', '< / \\ >', '  V V  '],
  },
  {
    name: 'bomber', color: '#df730c', health: 3, points: 300, speed: 22,
    fireInterval: 5.8, shotSpeed: 165,
    art: [' .-===-. ', '/[o|||o]\\', '\\==###==/', '  v v v  '],
  },
];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const keys = new Set();
const ship = { x: null, y: 0, halfWidth: 0, cooldown: 0, health: 3, invulnerable: 0 };
const bullets = [];
const enemies = [];
const enemyBullets = [];
const explosions = [];
const game = { score: 0, wave: 0, waveDelay: 0, intermission: false, over: false, time: 0, started: false, paused: false };
const scoreLabel = document.querySelector('[data-score]');
const waveLabel = document.querySelector('[data-wave]');
const hullLabel = document.querySelector('[data-hull]');
const gameOverPanel = document.querySelector('.game-over');
const startScreen = document.querySelector('.start-screen');
const pauseMenu = document.querySelector('.pause-menu');
const resumeButton = document.querySelector('.resume');
const main = document.querySelector('main');
const readingCredit = document.querySelector('.reading-credit');
const waveClearPanel = document.querySelector('.wave-clear');
const waveClearTitle = document.querySelector('[data-wave-clear-title]');
const waveQuote = document.querySelector('[data-wave-quote]');
const waveSource = document.querySelector('[data-wave-source]');
const waveCountdown = document.querySelector('[data-wave-countdown]');
const finalScoreLabel = document.querySelector('[data-final-score]');
let firingPointer = null;
let shipAdvance = 0;
let enemyAdvance = 0;
let glyphs;
let glyphIndex;

function prepareReading() {
  paragraphs = reading.paragraphs;
  glyphs = [...new Set(paragraphs.join(''))].filter((glyph) => !/\s/.test(glyph));
  glyphIndex = new Map(glyphs.map((glyph, index) => [glyph, index]));
  document.querySelector('.page-text').textContent = paragraphs.join('\n\n');
  readingCredit.textContent = `${reading.title} · ${reading.author}`;
  readingCredit.href = reading.url;
}

prepareReading();

let width;
let height;
let ratio;
let fontSize;
let lineHeight;
let advance;
let atlas;
let tileWidth;
let tileHeight;
let columns;
let rows;
let flowX;
let flowY;
let nextFlowX;
let nextFlowY;
let letters = [];
let frame = 0;
let previousTime = 0;
let accumulator = 0;

function makeAtlas() {
  const font = `${fontSize}px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
  context.font = font;
  advance = context.measureText('M').width;
  tileWidth = Math.ceil(advance + 8);
  tileHeight = lineHeight + 8;
  atlas = document.createElement('canvas');
  atlas.width = Math.ceil(tileWidth * glyphs.length * ratio);
  atlas.height = Math.ceil(tileHeight * PALETTE_SIZE * ratio);
  const ink = atlas.getContext('2d');
  ink.scale(ratio, ratio);
  ink.font = font;
  ink.textBaseline = 'alphabetic';

  for (let color = 0; color < PALETTE_SIZE; color++) {
    const amount = color / (PALETTE_SIZE - 1);
    const red = Math.round(37 + (237 - 37) * amount);
    const green = Math.round(37 + (35 - 37) * amount);
    const blue = Math.round(37 + (136 - 37) * amount);
    ink.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    glyphs.forEach((glyph, index) => {
      ink.fillText(glyph, index * tileWidth + 4, color * tileHeight + fontSize + 4);
    });
  }
}

function layout() {
  const previousWidth = width;
  const previousHeight = height;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  accumulator = 0;
  // Scale a bounded game world to fill the screen, preserving its aspect ratio.
  // Both simulation size and backing pixels stay capped on large/HiDPI displays.
  const scale = Math.max(1, window.innerWidth / MAX_GAME_WIDTH, window.innerHeight / MAX_GAME_HEIGHT);
  width = window.innerWidth / scale;
  height = window.innerHeight / scale;
  ratio = Math.min((window.devicePixelRatio || 1) * scale, 2);
  fontSize = width < 600 ? 11 : 12;
  lineHeight = width < 600 ? 16 : 18;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  makeAtlas();
  context.font = SHIP_FONT;
  shipAdvance = context.measureText('M').width;
  context.font = ENEMY_FONT;
  enemyAdvance = context.measureText('M').width;
  ship.halfWidth = SHIP_ART[0].length * shipAdvance / 2;
  ship.x = clampShipX(previousWidth ? ship.x / previousWidth * width : width / 2);
  ship.y = Math.max(0, height - SHIP_ART.length * SHIP_LINE_HEIGHT - 48);
  bullets.length = 0;
  enemyBullets.length = 0;
  for (const enemy of enemies) {
    enemy.halfWidth = enemy.type.art[0].length * enemyAdvance / 2;
    const padding = Math.min(width / 2, enemy.halfWidth + 12);
    enemy.x = Math.max(padding, Math.min(width - padding, enemy.x / previousWidth * width));
    enemy.baseY = enemy.baseY / previousHeight * height;
    enemy.y = enemy.baseY;
  }
  explosions.length = 0;

  columns = Math.ceil(width / CELL) + 2;
  rows = Math.ceil(height / CELL) + 2;
  flowX = new Float32Array(columns * rows);
  flowY = new Float32Array(columns * rows);
  nextFlowX = new Float32Array(columns * rows);
  nextFlowY = new Float32Array(columns * rows);
  letters = [];

  const margin = width < 600 ? 16 : 24;
  const charactersPerLine = Math.max(1, Math.floor((width - margin * 2) / advance));
  let y = margin + fontSize + 36;
  let seed = 73;

  function addLine(text) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const random = seed / 4294967296;
      const x = margin + i * advance;
      letters.push({
        homeX: x, homeY: y, x, y, vx: 0, vy: 0,
        glyph: glyphIndex.get(text[i]),
        canTurnPink: random < 0.17,
        pink: 0,
        angle: 0,
        variation: 0.85 + random * 0.3,
      });
    }
    y += lineHeight;
  }

  // Keep repeating the text across paragraph boundaries so even ultrawide
  // screens get full rows, without stretching the glyphs or increasing gaps.
  const words = paragraphs.join(' ').trim().split(/\s+/);
  let wordIndex = 0;
  let remainder = words[wordIndex];
  let line = '';
  while (y <= height - margin) {
    if (line && line.length + 1 + remainder.length > charactersPerLine) {
      addLine(line);
      line = '';
      continue;
    }
    // Break long words only on unusually narrow viewports.
    if (remainder.length > charactersPerLine) {
      addLine(remainder.slice(0, charactersPerLine));
      remainder = remainder.slice(charactersPerLine);
      continue;
    }
    line += (line ? ' ' : '') + remainder;
    wordIndex = (wordIndex + 1) % words.length;
    remainder = words[wordIndex];
  }

  draw();
  if (hasGameActivity()) wake();
}

function clampShipX(x) {
  const padding = Math.min(ship.halfWidth + 12, width / 2);
  return Math.max(padding, Math.min(width - padding, x));
}

function shipXFromPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  return clampShipX((event.clientX - bounds.left) * width / bounds.width);
}

function movementDirection() {
  return Number(keys.has('ArrowRight') || keys.has('KeyD'))
    - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
}

function isFiring() {
  return game.started && !game.over && !game.intermission && !game.paused && (keys.has('Space') || firingPointer !== null);
}

function hasGameActivity() {
  return game.started && (!game.over || bullets.length > 0 || enemyBullets.length > 0 || explosions.length > 0);
}

function fireShot() {
  if (!game.started || game.over || game.intermission || game.paused) return;
  bullets.push({ x: ship.x, y: ship.y - 8 });
  ship.cooldown = FIRE_INTERVAL;
  audio.play('playerShot');
}

function updateHud() {
  scoreLabel.textContent = String(game.score).padStart(5, '0');
  waveLabel.textContent = String(game.wave).padStart(2, '0');
  hullLabel.textContent = '♥'.repeat(ship.health) + '♡'.repeat(3 - ship.health);
  hullLabel.setAttribute('aria-label', `${ship.health} of 3 hull remaining`);
}

function spawnWave() {
  game.wave++;
  const count = Math.max(1, Math.min(6, Math.floor((width - 24) / 115)));
  const rowCount = height < 500 ? 1 : height < 700 ? 2 : 3;
  const rowSpacing = Math.min(96, Math.max(72, (ship.y - 150) / rowCount));
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < count; column++) {
      const type = ENEMY_TYPES[(column + row + game.wave - 1) % ENEMY_TYPES.length];
      const baseY = Math.max(52, Math.min(76 + row * rowSpacing, ship.y - 105));
      enemies.push({
        type, x: width * (column + 0.5) / count, y: baseY, baseY,
        halfWidth: type.art[0].length * enemyAdvance / 2,
        height: type.art.length * ENEMY_LINE_HEIGHT,
        health: type.health, direction: row % 2 ? -1 : 1,
        phase: column * 1.7 + row * 0.8,
        cooldown: 2.5 + row * 0.9 + column * 0.45 + Math.random() * 1.5,
        flash: 0,
      });
    }
  }
  updateHud();
}

function restartGame() {
  audio.unlock();
  game.paused = false;
  pauseMenu.close();
  main.classList.remove('is-paused');
  resetInput();
  reading = chooseReading(reading.id);
  previousQuote = undefined;
  prepareReading();
  game.started = true;
  startScreen.hidden = true;
  main.classList.remove('is-starting', 'is-intermission');
  waveClearPanel.hidden = true;
  game.intermission = false;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  bullets.length = enemyBullets.length = enemies.length = explosions.length = 0;
  game.score = game.wave = game.waveDelay = game.time = 0;
  game.over = false;
  ship.health = 3;
  ship.cooldown = 0;
  ship.invulnerable = 2;
  ship.x = width / 2;
  gameOverPanel.hidden = true;
  layout();
  spawnWave();
  wake();
  community.startGame();
}

function togglePause() {
  if (!game.started || game.over) return;
  game.paused = !game.paused;
  resetInput();
  previousTime = 0;
  accumulator = 0;
  if (game.paused) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    audio.pause();
    main.classList.add('is-paused');
    pauseMenu.showModal();
  } else {
    pauseMenu.close();
    resumeButton.blur();
    main.classList.remove('is-paused');
    audio.unlock();
    wake();
  }
}

function beginWaveIntermission() {
  game.intermission = true;
  game.waveDelay = 0;
  resetInput();
  bullets.length = enemyBullets.length = 0;
  previousQuote = chooseQuote(reading, previousQuote);
  waveClearTitle.textContent = `WAVE ${String(game.wave).padStart(2, '0')} CLEARED`;
  waveQuote.textContent = previousQuote;
  waveSource.textContent = `${reading.author} · ${reading.title}`;
  waveSource.href = reading.url;
  updateWaveCountdown();
  main.classList.add('is-intermission');
  waveClearPanel.hidden = false;
  shockwave(width / 2, height / 2, Math.max(width, height) * 0.7, 500);
}

function updateWaveCountdown() {
  const remaining = Math.max(0, Math.ceil(WAVE_INTERMISSION - game.waveDelay));
  const label = `WAVE ${String(game.wave + 1).padStart(2, '0')} IN ${remaining}`;
  if (waveCountdown.textContent !== label) waveCountdown.textContent = label;
}

function fireEnemyShot(enemy) {
  const x = enemy.x;
  const y = enemy.y + enemy.height + 5;
  const speed = enemy.type.shotSpeed + Math.min(70, (game.wave - 1) * 8);
  const addShot = (angle, glyph) => enemyBullets.push({
    x, y, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed,
    color: enemy.type.color, glyph,
  });
  if (enemy.type.name === 'bomber') {
    for (const angle of [-0.32, 0, 0.32]) addShot(angle, '*');
  } else if (enemy.type.name === 'hunter') {
    const angle = Math.max(-0.65, Math.min(0.65, Math.atan2(ship.x - x, ship.y - y)));
    addShot(angle, ':');
  } else {
    addShot(0, 'v');
  }
}

function shockwave(x, y, radius, strength) {
  const motionScale = motionPreference.matches ? 0.25 : 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const dx = (column - 1) * CELL - x;
      const dy = (row - 1) * CELL - y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      const force = (1 - distance / radius) ** 2 * strength * motionScale;
      const index = row * columns + column;
      flowX[index] += dx / Math.max(distance, 8) * force;
      flowY[index] += dy / Math.max(distance, 8) * force;
    }
  }
}

function explode(x, y, color, art, glyphAdvance, lineSpacing, scale = 1) {
  const particles = [];
  const reduced = motionPreference.matches;
  if (art) {
    for (let row = 0; row < art.length; row++) {
      for (let column = 0; column < art[row].length; column++) {
        const glyph = art[row][column];
        if (glyph === ' ' || (reduced && (row + column) % 2)) continue;
        const dx = (column - (art[row].length - 1) / 2) * glyphAdvance;
        const dy = (row - (art.length - 1) / 2) * lineSpacing;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.6;
        const speed = (60 + Math.random() * 145) * scale * (reduced ? 0.35 : 1);
        particles.push({
          x: x + dx, y: y + dy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          glyph, life: 0.5 + Math.random() * 0.55, maxLife: 1.1, debris: true,
        });
      }
    }
  }
  const sparks = reduced ? 8 : Math.round(24 * scale);
  for (let i = 0; i < sparks; i++) {
    const angle = Math.PI * 2 * i / sparks + Math.random() * 0.2;
    const speed = (90 + Math.random() * 190) * scale * (reduced ? 0.35 : 1);
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      glyph: ['*', '+', '.', '·', ':'][i % 5],
      life: 0.35 + Math.random() * 0.6, maxLife: 1, debris: false,
    });
  }
  explosions.push({ x, y, color, particles, age: 0, duration: 1.25, scale });
  shockwave(x, y, 150 * scale, 380 * scale);
}

function hitShip() {
  if (ship.invulnerable > 0 || game.over || game.intermission || game.paused) return;
  ship.health--;
  ship.invulnerable = 2;
  explode(ship.x, ship.y + SHIP_LINE_HEIGHT * 2, PLAYER_COLOR,
    ship.health ? null : SHIP_ART, shipAdvance, SHIP_LINE_HEIGHT, ship.health ? 0.6 : 1.3);
  updateHud();
  if (!ship.health) {
    audio.play('playerDeath');
    game.over = true;
    resetInput();
    finalScoreLabel.textContent = `${game.score.toLocaleString()} points · wave ${game.wave}`;
    gameOverPanel.hidden = false;
    gameOverPanel.focus({ preventScroll: true });
    void community.finishGame(game.score, game.wave);
  }
}

function updateGame(dt) {
  if (!game.started || game.paused) return;
  game.time += dt;
  if (game.intermission) {
    game.waveDelay += dt;
    updateWaveCountdown();
    if (game.waveDelay + 1e-9 >= WAVE_INTERMISSION) {
      game.intermission = false;
      game.waveDelay = 0;
      waveClearPanel.hidden = true;
      main.classList.remove('is-intermission');
      spawnWave();
    }
  }
  ship.invulnerable = Math.max(0, ship.invulnerable - dt);
  const previousX = ship.x;
  if (!game.over && !game.intermission) ship.x = clampShipX(ship.x + movementDirection() * SHIP_SPEED * dt);
  stir({
    fromX: previousX, fromY: ship.y + SHIP_LINE_HEIGHT * 2,
    x: ship.x, y: ship.y + SHIP_LINE_HEIGHT * 2,
    radius: 86, strength: 1.25,
  });

  ship.cooldown = Math.max(0, ship.cooldown - dt);
  if (isFiring() && ship.cooldown <= 0) fireShot();

  if (!game.over) {
    for (const enemy of enemies) {
      enemy.x += enemy.direction * enemy.type.speed * (1 + Math.min(0.6, game.wave * 0.05)) * dt;
      const padding = Math.min(width / 2, enemy.halfWidth + 12);
      if (enemy.x <= padding || enemy.x >= width - padding) {
        enemy.x = Math.max(padding, Math.min(width - padding, enemy.x));
        enemy.direction *= -1;
      }
      enemy.y = enemy.baseY + Math.sin(game.time * 1.6 + enemy.phase) * (motionPreference.matches ? 2 : 9);
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0 && enemyBullets.length < 48) {
        fireEnemyShot(enemy);
        enemy.cooldown = enemy.type.fireInterval / (1 + Math.min(0.8, (game.wave - 1) * 0.1))
          + Math.random() * 1.2;
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const previousY = bullet.y;
    bullet.y -= BULLET_SPEED * dt;
    stir({
      fromX: bullet.x, fromY: previousY,
      x: bullet.x, y: bullet.y,
      radius: 42, strength: 0.9,
    });
    let target = null;
    for (const enemy of enemies) {
      // Sweep the shot segment so fast shots cannot skip a sprite between ticks.
      if (Math.abs(bullet.x - enemy.x) <= enemy.halfWidth + 3
        && bullet.y <= enemy.y + enemy.height && previousY + 20 >= enemy.y
        && (!target || enemy.y > target.y)) target = enemy;
    }
    if (target && !game.over) {
      bullets.splice(i, 1);
      target.health--;
      target.flash = 0.12;
      if (target.health <= 0) {
        audio.play('enemyDestroyed');
        explode(target.x, target.y + target.height / 2, target.type.color,
          target.type.art, enemyAdvance, ENEMY_LINE_HEIGHT);
        enemies.splice(enemies.indexOf(target), 1);
        game.score += target.type.points;
        updateHud();
      } else {
        explode(bullet.x, bullet.y, target.type.color, null, 0, 0, 0.25);
      }
    } else if (bullet.y < -32) {
      bullets.splice(i, 1);
    }
  }

  // Celebrate as soon as the last invader falls, before any remaining enemy
  // shot can hit the player. Explosions and the text current keep settling.
  if (!game.over && !game.intermission && enemies.length === 0) beginWaveIntermission();

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    const previousY = bullet.y;
    const previousX = bullet.x;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    stir({
      fromX: previousX, fromY: previousY, x: bullet.x, y: bullet.y,
      radius: 28, strength: 0.5,
    });
    if (!game.over && Math.abs(bullet.x - ship.x) < ship.halfWidth - 8
      && bullet.y + 12 >= ship.y && previousY <= ship.y + SHIP_LINE_HEIGHT * SHIP_ART.length) {
      enemyBullets.splice(i, 1);
      hitShip();
    } else if (bullet.y > height + 24 || bullet.x < -24 || bullet.x > width + 24) {
      enemyBullets.splice(i, 1);
    }
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    const explosion = explosions[i];
    explosion.age += dt;
    for (const particle of explosion.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-1.5 * dt);
      particle.vy = particle.vy * Math.exp(-1.5 * dt) + 60 * dt;
    }
    if (explosion.age >= explosion.duration) explosions.splice(i, 1);
  }
}

// Bilinear sampling makes a small velocity grid feel continuous at letter scale.
function sample(field, x, y) {
  const gx = Math.max(0, Math.min(columns - 1.001, x / CELL + 1));
  const gy = Math.max(0, Math.min(rows - 1.001, y / CELL + 1));
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const tx = gx - ix;
  const ty = gy - iy;
  const index = iy * columns + ix;
  return (field[index] * (1 - tx) + field[index + 1] * tx) * (1 - ty)
    + (field[index + columns] * (1 - tx) + field[index + columns + 1] * tx) * ty;
}

function stir(stroke) {
  const dx = stroke.x - stroke.fromX;
  const dy = stroke.y - stroke.fromY;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return;

  const radius = stroke.radius ?? Math.min(165, Math.max(95, width * 0.115));
  const segments = Math.max(1, Math.ceil(distance / 14));
  const impulse = Math.min(distance * 4.8, 180) / segments
    * (stroke.strength ?? 1) * (motionPreference.matches ? 0.3 : 1);
  const directionX = dx / distance;
  const directionY = dy / distance;

  for (let segment = 1; segment <= segments; segment++) {
    const x = stroke.fromX + dx * segment / segments;
    const y = stroke.fromY + dy * segment / segments;
    const left = Math.max(0, Math.floor((x - radius) / CELL + 1));
    const right = Math.min(columns - 1, Math.ceil((x + radius) / CELL + 1));
    const top = Math.max(0, Math.floor((y - radius) / CELL + 1));
    const bottom = Math.min(rows - 1, Math.ceil((y + radius) / CELL + 1));

    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const rx = (column - 1) * CELL - x;
        const ry = (row - 1) * CELL - y;
        const r = Math.hypot(rx, ry);
        if (r >= radius) continue;
        const falloff = (1 - r / radius) ** 2;
        const nx = rx / Math.max(r, 8);
        const ny = ry / Math.max(r, 8);
        const index = row * columns + column;
        // A wake, outward pressure, and a small turn all travel together.
        flowX[index] += (directionX * 1.65 + nx * 1.1 - ny * 0.8) * impulse * falloff;
        flowY[index] += (directionY * 1.65 + ny * 1.1 + nx * 0.8) * impulse * falloff;
        const speed = Math.hypot(flowX[index], flowY[index]);
        if (speed > 650) {
          flowX[index] *= 650 / speed;
          flowY[index] *= 650 / speed;
        }
      }
    }
  }
}

function updateFlow(dt) {
  const decay = Math.exp(-2.4 * dt);
  let energy = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = (column - 1) * CELL;
      const y = (row - 1) * CELL;
      // Carry the flow through itself, rather than leaving forces stuck in place.
      const sourceX = x - flowX[index] * dt;
      const sourceY = y - flowY[index] * dt;
      const left = index - (column > 0 ? 1 : 0);
      const right = index + (column < columns - 1 ? 1 : 0);
      const top = index - (row > 0 ? columns : 0);
      const bottom = index + (row < rows - 1 ? columns : 0);
      const averageX = (flowX[left] + flowX[right] + flowX[top] + flowX[bottom]) * 0.25;
      const averageY = (flowY[left] + flowY[right] + flowY[top] + flowY[bottom]) * 0.25;
      nextFlowX[index] = (sample(flowX, sourceX, sourceY) * 0.94 + averageX * 0.06) * decay;
      nextFlowY[index] = (sample(flowY, sourceX, sourceY) * 0.94 + averageY * 0.06) * decay;
      energy = Math.max(energy, Math.abs(nextFlowX[index]), Math.abs(nextFlowY[index]));
    }
  }

  [flowX, nextFlowX] = [nextFlowX, flowX];
  [flowY, nextFlowY] = [nextFlowY, flowY];
  return energy;
}

function update(dt) {
  if (game.paused) return 0;
  updateGame(dt);
  let energy = updateFlow(dt);
  const spring = motionPreference.matches ? 28 : 12;
  const damping = motionPreference.matches ? 10 : 4.6;

  for (const letter of letters) {
    const dx = letter.x - letter.homeX;
    const dy = letter.y - letter.homeY;
    const currentX = sample(flowX, letter.x, letter.y);
    const currentY = sample(flowY, letter.x, letter.y);
    letter.vx += (currentX * 7 * letter.variation - dx * spring - letter.vx * damping) * dt;
    letter.vy += (currentY * 7 * letter.variation - dy * spring - letter.vy * damping) * dt;
    letter.x += letter.vx * dt;
    letter.y += letter.vy * dt;

    const speed = Math.hypot(letter.vx, letter.vy);
    const displacement = Math.hypot(dx, dy);
    const agitation = speed + displacement * 2;
    const pinkTarget = letter.canTurnPink ? Math.min(1, Math.max(0, (agitation - 15) / 100)) : 0;
    const pinkRate = pinkTarget > letter.pink ? 9 : 1.65;
    letter.pink += (pinkTarget - letter.pink) * (1 - Math.exp(-pinkRate * dt));
    const angleTarget = motionPreference.matches ? 0 : Math.max(-0.38, Math.min(0.38, letter.vy * 0.0017 + dx * 0.002));
    letter.angle += (angleTarget - letter.angle) * (1 - Math.exp(-7 * dt));
    energy = Math.max(energy, speed, displacement, letter.pink * 20, Math.abs(letter.angle) * 20);
  }

  return energy;
}

function draw() {
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  for (const letter of letters) {
    if (letter.x < -tileWidth || letter.x > width + tileWidth
      || letter.y < -tileHeight || letter.y > height + tileHeight) continue;
    const sourceX = letter.glyph * tileWidth * ratio;
    const sourceY = Math.round(letter.pink * (PALETTE_SIZE - 1)) * tileHeight * ratio;
    if (Math.abs(letter.angle) > 0.005) {
      context.save();
      context.translate(letter.x + advance / 2, letter.y - fontSize / 2);
      context.rotate(letter.angle);
      context.drawImage(atlas, sourceX, sourceY, tileWidth * ratio, tileHeight * ratio,
        -advance / 2 - 4, -fontSize / 2 - 4, tileWidth, tileHeight);
      context.restore();
    } else {
      context.drawImage(atlas, sourceX, sourceY, tileWidth * ratio, tileHeight * ratio,
        letter.x - 4, letter.y - fontSize - 4, tileWidth, tileHeight);
    }
  }

  drawGame();
}

function drawGame() {
  if (!game.started) return;
  context.save();
  context.font = SHIP_FONT;
  context.textBaseline = 'top';
  context.textAlign = 'center';
  context.fillStyle = PLAYER_COLOR;
  // A paper-colored outline keeps ASCII readable as the letters flow behind it.
  context.strokeStyle = BACKGROUND;
  context.lineWidth = 4;
  context.lineJoin = 'round';

  for (const bullet of bullets) {
    context.strokeText('^', bullet.x, bullet.y);
    context.strokeText('|', bullet.x, bullet.y + SHIP_LINE_HEIGHT * 0.65);
    context.fillText('^', bullet.x, bullet.y);
    context.fillText('|', bullet.x, bullet.y + SHIP_LINE_HEIGHT * 0.65);
  }

  context.font = ENEMY_FONT;
  for (const bullet of enemyBullets) {
    context.fillStyle = bullet.color;
    context.globalAlpha = 0.35;
    context.strokeText('.', bullet.x - bullet.vx * 0.05, bullet.y - bullet.vy * 0.05);
    context.fillText('.', bullet.x - bullet.vx * 0.05, bullet.y - bullet.vy * 0.05);
    context.globalAlpha = 1;
    context.strokeText(bullet.glyph, bullet.x, bullet.y);
    context.fillText(bullet.glyph, bullet.x, bullet.y);
  }

  for (const enemy of enemies) {
    context.fillStyle = enemy.flash > 0 ? ACCENT : enemy.type.color;
    drawAscii(enemy.type.art, enemy.x, enemy.y, enemyAdvance, ENEMY_LINE_HEIGHT);
    if (enemy.type.health > 1) {
      context.textAlign = 'center';
      context.font = '10px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
      const armor = '+'.repeat(enemy.health) + '·'.repeat(enemy.type.health - enemy.health);
      context.strokeText(armor, enemy.x, enemy.y - 13);
      context.fillText(armor, enemy.x, enemy.y - 13);
      context.font = ENEMY_FONT;
    }
  }

  context.font = SHIP_FONT;
  context.fillStyle = PLAYER_COLOR;
  if (!game.over) {
    context.globalAlpha = ship.invulnerable > 0 ? 0.45 + 0.55 * (Math.sin(game.time * 8) ** 2) : 1;
    drawAscii(SHIP_ART, ship.x, ship.y, shipAdvance, SHIP_LINE_HEIGHT, PLAYER_EDGE);
    context.globalAlpha = 1;
  }

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const explosion of explosions) {
    const burst = Math.max(0, 1 - explosion.age / 0.4);
    if (burst > 0) {
      const radius = (8 + explosion.age * (motionPreference.matches ? 60 : 210)) * explosion.scale;
      context.globalAlpha = burst;
      context.fillStyle = explosion.color;
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        const x = explosion.x + Math.cos(angle) * radius;
        const y = explosion.y + Math.sin(angle) * radius;
        const glyph = i % 3 === 0 ? '+' : '·';
        context.strokeText(glyph, x, y);
        context.fillText(glyph, x, y);
      }
      context.strokeText(explosion.age < 0.12 ? '##' : '*', explosion.x, explosion.y);
      context.fillText(explosion.age < 0.12 ? '##' : '*', explosion.x, explosion.y);
    }
    for (const particle of explosion.particles) {
      if (particle.life <= 0) continue;
      context.globalAlpha = Math.min(1, particle.life / 0.3);
      context.fillStyle = !particle.debris && explosion.age < 0.18 ? '#f5a623' : explosion.color;
      context.strokeText(particle.glyph, particle.x, particle.y);
      context.fillText(particle.glyph, particle.x, particle.y);
    }
  }
  context.restore();
}

function drawAscii(art, x, y, glyphAdvance, rowHeight, edgeColor) {
  context.textAlign = 'left';
  const left = x - art[0].length * glyphAdvance / 2;
  for (let row = 0; row < art.length; row++) {
    for (let column = 0; column < art[row].length; column++) {
      const glyph = art[row][column];
      if (glyph === ' ') continue;
      const glyphX = left + column * glyphAdvance;
      const glyphY = y + row * rowHeight;
      context.strokeText(glyph, glyphX, glyphY);
      if (edgeColor) {
        // A thin dark rim gives fluorescent ink definition against the pale page.
        context.save();
        context.strokeStyle = edgeColor;
        context.lineWidth = 0.8;
        context.strokeText(glyph, glyphX, glyphY);
        context.restore();
      }
      context.fillText(glyph, glyphX, glyphY);
    }
  }
}

function tick(time) {
  if (game.paused) {
    frame = 0;
    return;
  }
  const elapsed = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : STEP;
  previousTime = time;
  accumulator += elapsed;
  let energy = Infinity;
  while (accumulator >= STEP) {
    energy = update(STEP);
    accumulator -= STEP;
  }

  if (energy < 0.035 && !hasGameActivity()) {
    for (const letter of letters) {
      letter.x = letter.homeX;
      letter.y = letter.homeY;
      letter.vx = letter.vy = letter.angle = letter.pink = 0;
    }
    flowX.fill(0);
    flowY.fill(0);
    frame = 0;
    previousTime = 0;
    accumulator = 0;
    draw();
    return;
  }

  draw();
  frame = requestAnimationFrame(tick);
}

function wake() {
  if (!frame && !game.paused && !document.hidden) frame = requestAnimationFrame(tick);
}

const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space']);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && game.started && !game.over) {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (!game.started || game.over || !gameKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (document.hidden || game.intermission || game.paused) return;
  audio.unlock();
  if (event.code === 'Space' && !keys.has('Space') && !isFiring()) fireShot();
  keys.add(event.code);
  wake();
});

window.addEventListener('keyup', (event) => {
  if (!game.started || game.over || !gameKeys.has(event.code)) return;
  event.preventDefault();
  keys.delete(event.code);
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  if (!game.started || game.over || game.intermission || game.paused) return;
  audio.unlock();
  if (event.pointerType === 'touch') ship.x = shipXFromPointer(event);
  if (!isFiring()) fireShot();
  firingPointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  wake();
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' && event.pointerId === firingPointer && !game.over && !game.intermission && !game.paused) {
    ship.x = shipXFromPointer(event);
  }
});

document.querySelector('.restart').addEventListener('click', restartGame);
document.querySelector('.start').addEventListener('click', restartGame);
resumeButton.addEventListener('click', togglePause);
pauseMenu.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (game.paused) togglePause();
});
document.querySelector('[data-show-leaderboard]').addEventListener('click', () => {
  resetInput();
  game.started = false;
  gameOverPanel.hidden = true;
  startScreen.hidden = false;
  main.classList.add('is-starting');
  document.querySelector('.start').focus({ preventScroll: true });
  void community.refresh();
});

function releaseFire(event) {
  if (event.pointerId === firingPointer) firingPointer = null;
}

window.addEventListener('pointerup', releaseFire);
window.addEventListener('pointercancel', releaseFire);
canvas.addEventListener('lostpointercapture', releaseFire);

function resetInput() {
  keys.clear();
  firingPointer = null;
}

window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => {
  resetInput();
  previousTime = 0;
  if (document.hidden && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else if (!document.hidden) {
    wake();
  }
});
window.addEventListener('resize', layout);
motionPreference.addEventListener('change', wake);
layout();
