#!/usr/bin/env node
// render.mjs : spec.json -> preview PNGs + contact sheet + qc.json (free, local).
//
//   node render.mjs spec.json                      # all locales, into Work/preview/
//   node render.mjs spec.json --locales en-US,tr   # selected locales
//   node render.mjs spec.json --scale 0.5          # quick draft (half resolution)
//
// Output: Work/preview/<locale>/<board>.png, Work/preview/sheet_<locale>.png, Work/preview/qc.json
// Exit code: 2 if QC has any ERROR, 0 if only WARN.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { loadSpec, resolveBoards, CANVAS, fontList } from './layout.mjs';
import Color from './vendor/color.js';

// Dependency lookup order: node_modules next to the script, SS_DEPS (where setup.sh installs), global npm.
export async function loadDep(name) {
  try { return await import(name); } catch {}
  const dirs = [process.env.SS_DEPS, path.join(process.env.HOME ?? '', '.cache/store-screenshots')].filter(Boolean);
  try { dirs.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().replace(/node_modules$/, '')); } catch {}
  for (const d of dirs) { try { return createRequire(path.join(d, 'noop.js'))(name); } catch {} }
  throw new Error(`${name} not found. Install: bash ${path.dirname(new URL(import.meta.url).pathname)}/setup.sh`);
}
const loadPlaywright = () => loadDep('playwright');

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2), opts = {}, pos = [];
for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (opts[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
const specPath = pos[0];
const opt = (k, d) => opts[k] ?? d;
if (!specPath) { console.error('Usage: node render.mjs spec.json [--locales a,b] [--out dir] [--scale 1]'); process.exit(1); }

const { spec, specDir } = loadSpec(specPath);
const locales = (opt('locales') ?? spec.locales.join(',')).split(',');
const outDir = path.resolve(opt('out', path.join(specDir, 'Work/preview')));
const scale = Number(opt('scale', '1'));
const W = CANVAS[spec.canvas].w;

// ---------------------------------------------------------------- HTML generation
const rgba = c => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${+c.a.toFixed(3)})`;
const css = f => !f ? 'transparent'
  : f.kind === 'solid' ? rgba(f.color)
  : `linear-gradient(${f.angle}deg, ${f.stops.map(s => `${rgba(s.color)} ${(s.position * 100).toFixed(2)}%`).join(', ')})`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fam = f => `F_${f.family.replace(/\W/g, '')}_${f.weight ?? 400}${/italic/i.test(f.style) ? 'i' : ''}`;

function fontCss(locale) {
  const faces = [], links = [];
  for (const f of fontList(spec, locale)) {
    const italic = /italic/i.test(f.style);
    if (f.file) {
      const file = path.isAbsolute(f.file) ? f.file : path.join(specDir, f.file);
      faces.push(`@font-face{font-family:'${fam(f)}';src:url('${pathToFileURL(file).href}');font-weight:${f.weight ?? 400};font-style:${italic ? 'italic' : 'normal'};font-display:block}`);
    } else {
      links.push(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:${italic ? 'ital,' : ''}wght@${italic ? '1,' : ''}${f.weight ?? 400}&display=block">`);
    }
  }
  return { faces: faces.join('\n'), links: links.join('\n') };
}
const fontStack = f => f.file ? `'${fam(f)}'` : `'${f.family}'`;

function shadowCss(n) {
  const parts = [];
  if (n.stroke) parts.push(`inset 0 0 0 ${n.stroke.width}px ${rgba(n.stroke.color)}`);
  if (n.shadow) parts.push(`${n.shadow.x}px ${n.shadow.y}px ${n.shadow.blur}px ${n.shadow.spread}px ${rgba(n.shadow.color)}`);
  return parts.length ? `box-shadow:${parts.join(',')};` : '';
}

function nodeHtml(n) {
  const rot = n.rotate ? `rotate(${n.rotate}deg)` : '';
  const base = `position:absolute;left:${n.x}px;top:${n.y}px;opacity:${n.opacity ?? 1};`;
  const data = `data-name="${esc(n.name)}" data-kind="${n.kind}"`;
  if (n.kind === 'text') {
    const f = n.font;
    const spans = n.runs.map(r => `<span style="color:${rgba(r.color)}">${esc(r.text)}</span>`).join('');
    return `<div ${data} data-size="${n.size}" data-lh="${n.lineHeight}" data-maxlines="${n.maxLines ?? ''}" data-fit="${n.fit === false ? 0 : 1}" data-minsize="${n.minSize ?? ''}" data-role="${esc(n.role)}" style="${base}width:${n.w}px;`
      + `font-family:${fontStack(f)},sans-serif;font-weight:${f.weight ?? 400};font-style:${/italic/i.test(f.style) ? 'italic' : 'normal'};`
      + `font-size:${n.size}px;line-height:${n.lineHeight};letter-spacing:${n.letterSpacing}em;text-align:${n.align};`
      + `white-space:pre-wrap;transform:${rot || 'none'};transform-origin:center">${spans}</div>`;
  }
  if (n.kind === 'badge') {
    const f = n.font;
    const tr = [n.anchor === 'center' ? 'translateX(-50%)' : '', rot].join(' ').trim() || 'none';
    return `<div ${data} style="${base}display:inline-flex;align-items:center;white-space:nowrap;padding:${n.padY}px ${n.padX}px;`
      + `border-radius:${n.radius}px;background:${css(n.fill)};${shadowCss(n)}color:${rgba(n.color)};`
      + `font-family:${fontStack(f)},sans-serif;font-weight:${f.weight ?? 400};font-size:${n.size}px;line-height:1.2;letter-spacing:${n.letterSpacing}em;`
      + `transform:${tr};transform-origin:center">${esc(n.text)}</div>`;
  }
  if (n.kind === 'svg') return `<div ${data} style="${base}width:${n.w}px;height:${n.h}px;line-height:0;transform:${rot || 'none'};transform-origin:center">${n.svg}</div>`;
  const radius = n.kind === 'ellipse' ? '50%' : `${n.radius ?? 0}px`;
  const blur = n.blur ? `filter:blur(${n.blur / 2}px);` : '';
  const inner = n.image
    ? `<img src="${pathToFileURL(n.image.file).href}" style="width:100%;height:100%;object-fit:cover;border-radius:${radius};display:block">`
    : (n.children ?? []).map(nodeHtml).join('');
  return `<div ${data} style="${base}width:${n.w}px;height:${n.h}px;border-radius:${radius};background:${n.image ? 'transparent' : css(n.fill)};`
    + `${shadowCss(n)}${blur}overflow:${n.image ? 'hidden' : 'visible'};transform:${rot || 'none'};transform-origin:center">${inner}</div>`;
}

function boardHtml(b, locale) {
  const { faces, links } = fontCss(locale);
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>${faces}
html,body{margin:0;padding:0;background:#000}*{box-sizing:border-box}
#board{position:relative;overflow:hidden;width:${b.width}px;height:${b.height}px;background:${css(b.fill)};
-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal}
</style></head><body><div id="board">${b.nodes.map(nodeHtml).join('\n')}</div></body></html>`;
}

// ---------------------------------------------------------------- fitting + QC (measured in the browser)
// If a text with maxLines does not fit, the font size shrinks in 2% steps down to minSize (disable with fit:false).
function fitInPage() {
  const fitted = {};
  for (const e of document.querySelectorAll('[data-kind="text"]')) {
    const max = Number(e.dataset.maxlines || 0); if (!max || e.dataset.fit === '0') continue;
    const lh = Number(e.dataset.lh), start = Number(e.dataset.size), min = Number(e.dataset.minsize || start * 0.75);
    let size = start;
    const lines = () => Math.round(e.offsetHeight / (size * lh));
    while (lines() > max && size * 0.98 >= min) { size = Math.round(size * 0.98 * 10) / 10; e.style.fontSize = size + 'px'; }
    if (size !== start) { e.dataset.size = size; fitted[e.dataset.name] = { from: start, to: size }; }
  }
  return fitted;
}

function qcInPage({ W, slices, fonts }) {
  const out = [];
  const board = document.getElementById('board').getBoundingClientRect();
  const rel = r => ({ x: r.left - board.left, y: r.top - board.top, w: r.width, h: r.height });
  const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const inkRects = e => {                       // the text's real line boxes (ink, not the box)
    if (e.dataset.kind === 'badge') return [rel(e.getBoundingClientRect())];
    const r = document.createRange(); r.selectNodeContents(e);
    return [...r.getClientRects()].map(rel).filter(q => q.w > 0 && q.h > 0);
  };
  const solids = [...document.querySelectorAll('[data-kind="frame"],[data-name^="img:"]:not([data-name="img:bg"])')]
    .filter(e => e.parentElement.id === 'board').map(e => ({ name: e.dataset.name, r: rel(e.getBoundingClientRect()) }));
  for (const f of fonts) if (!document.fonts.check(`${f.weight} 100px ${f.stack}`)) out.push({ level: 'ERROR', what: `font not loaded: ${f.family} ${f.style} (drawn with a fallback font)` });
  const texts = [...document.querySelectorAll('[data-kind="text"],[data-kind="badge"]')].map(e => ({ e, name: e.dataset.name, ink: inkRects(e), box: rel(e.getBoundingClientRect()) }));
  for (const t of texts) {
    const { e, name, box } = t;
    if (e.dataset.kind === 'text') {
      const lines = Math.round(e.offsetHeight / (Number(e.dataset.size) * Number(e.dataset.lh)));
      const max = Number(e.dataset.maxlines || 0);
      if (max && lines > max) out.push({ level: 'ERROR', name, what: `${lines} lines, limit ${max} (shrunk to minSize and still does not fit: shorten the text)` });
      if (e.dataset.role === 'headline' && Number(e.dataset.size) < W * 0.06) out.push({ level: 'WARN', name, what: `headline ${e.dataset.size}px, hard to read in search results (recommended >= ${Math.round(W * 0.07)}px)` });
      t.lines = lines;
    }
    if (box.x < 0 || box.y < 0 || box.y + box.h > board.height) out.push({ level: 'ERROR', name, what: 'overflows the canvas' });
    const sl = slices.find(s => box.x >= s.x - 1 && box.x < s.x + s.w);
    const right = Math.max(...t.ink.map(q => q.x + q.w), box.x);
    if (sl && right > sl.x + sl.w + 1) out.push({ level: 'ERROR', name, what: `overflows the edge/slice (${Math.round(right - sl.x - sl.w)}px)` });
    for (const s of solids) if (t.ink.some(q => hit(q, s.r))) out.push({ level: 'WARN', name, what: `collides with ${s.name}` });
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++)
    if (texts[i].ink.some(a => texts[j].ink.some(b => hit(a, b)))) out.push({ level: 'ERROR', name: texts[i].name, what: `overlaps ${texts[j].name}` });
  return { issues: out, texts: texts.filter(t => t.lines).map(t => ({ name: t.name, lines: t.lines, size: Number(t.e.dataset.size) })) };
}

// ---------------------------------------------------------------- contrast QC (the real pixels UNDER the text)
// Texts are made transparent and the board is captured; background pixels inside each text's line boxes are sampled,
// and WCAG 2.1 contrast against the text color is computed (color.js). APCA Lc is written to qc.json for information.
function textTargets() {
  const board = document.getElementById('board').getBoundingClientRect();
  const rel = r => ({ x: r.left - board.left, y: r.top - board.top, w: r.width, h: r.height });
  return [...document.querySelectorAll('[data-kind="text"],[data-kind="badge"]')].map(e => {
    let rects;
    if (e.dataset.kind === 'badge') { const q = rel(e.getBoundingClientRect()); rects = [{ x: q.x + q.h / 2, y: q.y + q.h * 0.25, w: Math.max(1, q.w - q.h), h: q.h * 0.5 }]; }   // skip the pill's rounded ends
    else { const r = document.createRange(); r.selectNodeContents(e); rects = [...r.getClientRects()].map(rel).filter(q => q.w > 1 && q.h > 1); }
    const colors = e.dataset.kind === 'badge' ? [getComputedStyle(e).color] : [...e.querySelectorAll('span')].filter(s => s.textContent.trim()).map(s => getComputedStyle(s).color);
    return { name: e.dataset.name, size: Number(e.dataset.size || parseFloat(getComputedStyle(e).fontSize)), rects, colors: [...new Set(colors)] };
  });
}
async function samplePixels({ b64, scale, targets }) {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return targets.map(t => {
    const px = [];
    for (const q of t.rects) {
      const x0 = Math.max(0, Math.floor(q.x * scale)), y0 = Math.max(0, Math.floor(q.y * scale));
      const w = Math.min(c.width - x0, Math.ceil(q.w * scale)), h = Math.min(c.height - y0, Math.ceil(q.h * scale));
      if (w <= 0 || h <= 0) continue;
      const d = ctx.getImageData(x0, y0, w, h).data, step = Math.max(1, Math.floor(Math.sqrt(w * h / 600)));
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]); }
    }
    px.sort((a, b) => lum(a) - lum(b));
    const at = p => px[Math.min(px.length - 1, Math.floor(p * px.length))];
    return { name: t.name, size: t.size, colors: t.colors, n: px.length, p10: at(0.1), p50: at(0.5), p90: at(0.9) };
  });
}
function rgbaOf(css) { const m = css.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; }
function contrastReport(samples, W) {
  const out = [], issues = [];
  for (const s of samples) {
    if (!s.n) continue;
    const large = s.size >= W * 0.045, min = large ? 3 : 4.5;
    let worstMed = Infinity, worstEdge = Infinity, lc = null;
    for (const css of s.colors) {
      const f = rgbaOf(css);
      for (const [key, bg] of [['p50', s.p50], ['p10', s.p10], ['p90', s.p90]]) {
        const blend = [0, 1, 2].map(i => ([f.r, f.g, f.b][i] * f.a + bg[i] * (1 - f.a)) / 255);
        const fg = new Color('srgb', blend), bc = new Color('srgb', bg.map(v => v / 255));
        const r = fg.contrast(bc, 'WCAG21');
        if (key === 'p50') { worstMed = Math.min(worstMed, r); lc = bc.contrast(fg, 'APCA'); } else worstEdge = Math.min(worstEdge, r);
      }
    }
    out.push({ name: s.name, min, median: +worstMed.toFixed(2), worst: +worstEdge.toFixed(2), apcaLc: +lc.toFixed(1) });
    if (worstMed < min) issues.push({ level: 'ERROR', name: s.name, what: `contrast ${worstMed.toFixed(2)} (threshold ${min}, WCAG 2.1): text gets lost in the background` });
    else if (worstEdge < min) issues.push({ level: 'WARN', name: s.name, what: `part of the text sits on a low-contrast background (worst ${worstEdge.toFixed(2)}, threshold ${min})` });
  }
  return { contrast: out, issues };
}

// ---------------------------------------------------------------- run
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const report = { spec: path.resolve(specPath), scale, locales: {} };
let errors = 0;
const fit = {};
const fontsForQc = loc => fontList(spec, loc).map(f => ({ family: f.family, style: f.style, weight: f.weight ?? 400, stack: fontStack(f) }));

for (const locale of locales) {
  const dir = path.join(outDir, locale); fs.mkdirSync(dir, { recursive: true });
  const shots = []; report.locales[locale] = [];
  for (const b of resolveBoards(spec, specDir, locale)) {
    const htmlPath = path.join(dir, `_${b.name}.html`);
    fs.writeFileSync(htmlPath, boardHtml(b, locale));
    const page = await browser.newPage({ viewport: { width: b.width, height: b.height }, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    await page.evaluate(async (fonts) => {
      await Promise.all(fonts.map(f => document.fonts.load(`${f.weight} 100px ${f.stack}`).catch(() => {})));
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    }, fontsForQc(locale));
    const fitted = await page.evaluate(fitInPage);
    const qc = await page.evaluate(qcInPage, { W, slices: b.slices, fonts: fontsForQc(locale) });
    {   // contrast: hide text, capture background, measure, restore text
      const targets = await page.evaluate(textTargets);
      await page.addStyleTag({ content: '[data-kind="text"] span,[data-kind="badge"]{color:transparent!important}' });
      const bgShot = await page.screenshot({ clip: { x: 0, y: 0, width: b.width, height: b.height } });
      await page.evaluate(() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('transparent!important')) s.remove(); }));
      const samples = await page.evaluate(samplePixels, { b64: bgShot.toString('base64'), scale, targets });
      const cr = contrastReport(samples, W);
      qc.contrast = cr.contrast; qc.issues.push(...cr.issues);
    }
    qc.fitted = fitted;
    for (const [n, f] of Object.entries(fitted)) console.log(`FITTED ${locale} ${b.name} ${n} ${f.from}px -> ${f.to}px`);
    fit[locale] ??= {}; fit[locale][b.name] = Object.fromEntries(Object.entries(fitted).map(([n, f]) => [n, f.to]));
    for (const s of b.slices) {
      const file = path.join(dir, `${b.name.replace(/_pano$/, '')}${b.slices.length > 1 || b.name.endsWith('_pano') ? '_' + s.shot : ''}.png`);
      await page.screenshot({ path: file, clip: { x: s.x, y: 0, width: s.w, height: b.height } });
      shots.push({ file, shot: s.shot });
    }
    await page.close();
    report.locales[locale].push({ board: b.name, ...qc });
    for (const i of qc.issues) { if (i.level === 'ERROR') errors++; console.log(`${i.level.padEnd(5)} ${locale} ${b.name} ${i.name ?? ''} ${i.what}`); }
  }
  // contact sheet: the first 3 screenshots show in App Store search, marked with an outline
  const cells = shots.map((s, i) => `<div class="c${i < 3 ? ' top' : ''}"><img src="${pathToFileURL(s.file).href}"><span>${s.shot}</span></div>`).join('');
  const sheetHtml = path.join(dir, '_sheet.html');
  fs.writeFileSync(sheetHtml, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1c1c1f;font:600 22px/1 Inter,system-ui,sans-serif;color:#ddd}
#s{display:flex;gap:18px;padding:28px;width:max-content}.c{display:flex;flex-direction:column;align-items:center;gap:10px}
.c img{width:260px;border-radius:14px;outline:2px solid #333}.top img{outline:4px solid #3d8bff}</style>
<div id="s">${cells}</div><div style="padding:0 28px 24px;white-space:nowrap">${esc(spec.code + spec.set)} · ${locale} · blue outline: first 3 visible in search</div>`);
  const sp = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await sp.goto(pathToFileURL(sheetHtml).href);
  await sp.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await sp.screenshot({ path: path.join(outDir, `sheet_${locale}.png`), fullPage: true });
  await sp.close();
  console.log(`${locale}: ${shots.length} screenshots -> ${dir}`);
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'qc.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, 'fit.json'), JSON.stringify(fit, null, 2));   // figma_js.mjs reads this, so Figma gets the same size
console.log(`qc.json -> ${path.join(outDir, 'qc.json')}  (${errors} ERROR)`);
process.exit(errors ? 2 : 0);
