const paragraphs = [
  'The page holds still until something passes through it. A small movement is enough: the letters loosen, the lines bend, and what looked like a solid thing remembers how to flow. For a moment there is only the current, carrying little pieces of meaning out of place. Then, slowly, each one finds its way home.',
  'There is a kind of order in water. It takes the shape of whatever holds it, but never quite stops moving. Beneath a quiet surface, one small motion becomes another. The edge of a ripple reaches the next ripple. Nothing moves alone. Even here, between one word and the next, there is room for a current to pass.',
  'Imagine a sentence laid gently on the surface of a river. At first you can read it. Then the water turns, and the spaces open, and the words drift apart without forgetting where they belong. Some catch the light for an instant. A little pink in all that black. A trace of where your hand has been.',
  'We think of a page as something fixed. Ink dries, a line ends, a thought settles into its place. But reading is a movement too. Your eyes pull the words forward. A phrase stays with you while the rest slips past. The same sentence can return a hundred times and arrive a little differently each time.',
  'Push gently and the movement stays close. Move quickly and a wider wake opens behind you. The letters follow one another around the bend, gather at the edges, and spill into the empty space. There is no hurry to put everything back. Let the disturbance travel. Let the last small motion finish on its own.',
  'A current does not keep the shape of the thing that made it. It opens, folds, unwinds. For a little while it carries the memory of a direction. Then the memory becomes smaller than the water around it, and the surface is quiet again. Nothing has disappeared. Everything is simply finding its place.',
  'Between the letters there is more space than you might expect. Enough for a turn, a pause, a passing wave. Enough for something familiar to become strange and then familiar again. Follow a single letter as it leaves its line. It drifts, it hesitates, it returns. The sentence has been waiting for it.',
  'Leave the page alone and it becomes a page again. The bright marks fade. The scattered words draw close. Each line straightens until the whole surface is still, holding the possibility of another movement. A quiet field of little black letters. A little time. The smallest touch, and everything begins again.',
];

const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
document.querySelector('.accessible-text').textContent = paragraphs.join('\n\n');

const BACKGROUND = '#f7f7f5';
const CELL = 28;
const STEP = 1 / 120;
const PALETTE_SIZE = 16;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0, y: 0, present: false, strokes: [] };
const glyphs = [...new Set(paragraphs.join(''))].filter((glyph) => glyph !== ' ');
const glyphIndex = new Map(glyphs.map((glyph, index) => [glyph, index]));

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
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  accumulator = 0;
  width = window.innerWidth;
  height = window.innerHeight;
  ratio = Math.min(window.devicePixelRatio || 1, 2);
  fontSize = width < 600 ? 11 : 12;
  lineHeight = width < 600 ? 16 : 18;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  makeAtlas();

  columns = Math.ceil(width / CELL) + 2;
  rows = Math.ceil(height / CELL) + 2;
  flowX = new Float32Array(columns * rows);
  flowY = new Float32Array(columns * rows);
  nextFlowX = new Float32Array(columns * rows);
  nextFlowY = new Float32Array(columns * rows);
  pointer.strokes.length = 0;
  pointer.present = false;
  letters = [];

  const margin = width < 600 ? 16 : 24;
  const charactersPerLine = Math.max(1, Math.floor((width - margin * 2) / advance));
  let y = margin + fontSize;
  let paragraphIndex = 0;
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

  while (y <= height - margin) {
    const words = paragraphs[paragraphIndex % paragraphs.length].split(' ');
    let line = '';
    for (const word of words) {
      if (line.length + word.length + (line ? 1 : 0) > charactersPerLine) {
        addLine(line);
        line = '';
        if (y > height - margin) break;
      }
      // Break long words only on unusually narrow viewports.
      let remainder = word;
      while (remainder.length > charactersPerLine && y <= height - margin) {
        addLine(remainder.slice(0, charactersPerLine));
        remainder = remainder.slice(charactersPerLine);
      }
      line += (line ? ' ' : '') + remainder;
    }
    if (line && y <= height - margin) addLine(line);
    y += lineHeight * 0.55;
    paragraphIndex++;
  }

  draw();
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

  const radius = Math.min(165, Math.max(95, width * 0.115));
  const segments = Math.max(1, Math.ceil(distance / 14));
  const impulse = Math.min(distance * 4.8, 180) / segments
    * (motionPreference.matches ? 0.3 : 1);
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
}

function tick(time) {
  const elapsed = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : STEP;
  previousTime = time;
  accumulator += elapsed;
  for (const stroke of pointer.strokes) stir(stroke);
  pointer.strokes.length = 0;
  let energy = Infinity;
  while (accumulator >= STEP) {
    energy = update(STEP);
    accumulator -= STEP;
  }

  if (energy < 0.035) {
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
  if (!frame) frame = requestAnimationFrame(tick);
}

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' && !event.isPrimary) return;
  const x = event.clientX;
  const y = event.clientY;
  if (pointer.present) {
    pointer.strokes.push({ fromX: pointer.x, fromY: pointer.y, x, y });
    // Bound queued work if input arrives while a tab is throttled.
    if (pointer.strokes.length > 32) pointer.strokes.shift();
    wake();
  }
  pointer.x = x;
  pointer.y = y;
  pointer.present = true;
}, { passive: true });

canvas.addEventListener('pointerdown', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.present = true;
}, { passive: true });

for (const event of ['pointerleave', 'pointercancel']) {
  canvas.addEventListener(event, () => { pointer.present = false; }, { passive: true });
}

window.addEventListener('blur', () => { pointer.present = false; });
document.addEventListener('visibilitychange', () => {
  pointer.present = false;
  pointer.strokes.length = 0;
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
