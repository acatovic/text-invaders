import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Render the existing vector logo and ASCII ships, keeping branding reproducible.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const write = (path, data) => writeFile(new URL(path, root), data);
const dataUrl = (type, data) => `data:${type};base64,${data.toString('base64')}`;
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const icon = dataUrl('image/svg+xml', await read('public/favicon.svg'));
const title = dataUrl('image/svg+xml', await read('title.svg'));
const font = dataUrl('font/ttf', await read('public/fonts/silkscreen-bold.ttf'));
const poem = (await read('literature/samples/jabberwocky.txt')).toString('utf8');
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const icons = [];
  for (const size of [16, 32, 48, 180]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}img{display:block;width:100%;height:100%}</style><img src="${icon}">`);
    await page.locator('img').evaluate((img) => img.decode());
    const png = await page.screenshot({ omitBackground: true });
    if (size === 180) await write('public/apple-touch-icon.png', png);
    else icons.push({ size, png });
  }
  // ICO directory entries point at PNG images for small and high-density tabs.
  const header = Buffer.alloc(6 + icons.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icons.length, 4);
  let offset = header.length;
  icons.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await write('public/favicon.ico', Buffer.concat([header, ...icons.map(({ png }) => png)]));

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Arcade; src: url('${font}'); font-weight: 700; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f7f7f5; color: #252525; font-family: 'Liberation Mono', monospace; }
    .paper { position: absolute; inset: -20px 24px; margin: 0; color: #252525; opacity: .075; font: 15px/24px 'Liberation Mono', monospace; white-space: pre-wrap; overflow: hidden; }
    .wash { position: absolute; inset: 0; background: linear-gradient(#f7f7f5e8 0%, #f7f7f5d9 38%, #f7f7f500 70%); }
    .eyebrow { position: absolute; top: 46px; left: 68px; margin: 0; color: #b51965; font: 700 16px Arcade; letter-spacing: 1px; }
    .title { position: absolute; top: 96px; left: 64px; width: 920px; height: auto; }
    .tagline { position: absolute; top: 224px; left: 68px; margin: 0; font-size: 23px; line-height: 1.5; }
    .ship { position: absolute; margin: 0; text-align: center; white-space: pre; font: 700 25px/27px 'Liberation Mono', monospace; -webkit-text-stroke: .4px currentColor; }
    .skimmer { left: 236px; top: 334px; color: #df3345; }
    .hunter { left: 550px; top: 322px; color: #236bdc; }
    .bomber { right: 188px; top: 322px; color: #df730c; }
    .player { left: 550px; top: 468px; color: #39ff14; -webkit-text-stroke: .6px #168a0b; text-shadow: 0 0 12px #39ff1422; font-size: 21px; line-height: 21px; }
    .laser { position: absolute; top: 435px; left: 601px; width: 3px; height: 20px; background: #ed2388; }
    .footer { position: absolute; bottom: 28px; left: 68px; right: 68px; display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #252525; padding-top: 18px; }
    .domain { font: 700 18px Arcade; }
    .play { color: #b51965; font: 700 14px Arcade; }
  </style></head><body>
    <div class="paper">${escape((poem.replaceAll('\n', ' ') + ' ').repeat(12))}</div><div class="wash"></div>
    <p class="eyebrow">THE PAGE IS YOUR BATTLEFIELD</p>
    <img class="title" src="${title}" alt="Txt Invaders">
    <p class="tagline">An ASCII arcade game on a living page of literature.</p>
    <pre class="ship skimmer">${escape([' \\ V / ', '<{o o}>', ' / W \\ '].join('\n'))}</pre>
    <pre class="ship hunter">${escape(['  /M\\  ', ' [O=O] ', '< / \\ >', '  V V  '].join('\n'))}</pre>
    <pre class="ship bomber">${escape([' .-===-. ', '/[o|||o]\\', '\\==###==/', '  v v v  '].join('\n'))}</pre>
    <div class="laser"></div>
    <pre class="ship player">${escape(['   ^   ', '  /|\\  ', ' /###\\ ', '<==|==>'].join('\n'))}</pre>
    <div class="footer"><span class="domain">txtinvaders.com</span><span class="play">PLAY FREE IN YOUR BROWSER</span></div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.title').evaluate((img) => img.decode());
  await write('public/social-preview.png', await page.screenshot());
  console.log('Generated favicon.ico, apple-touch-icon.png, and social-preview.png (1200 × 630).');
} finally {
  await browser.close();
}
