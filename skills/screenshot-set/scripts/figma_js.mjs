#!/usr/bin/env node
// figma_js.mjs : spec.json -> Plugin API JavaScript to pass to use_figma.
// Geometry comes from layout.mjs (same as render.mjs); the Figma side only draws.
//
//   node figma_js.mjs build    spec.json [--locales en-US] [--replace] [--fit Work/preview/fit.json]
//   node figma_js.mjs localize spec.json --from en-US --to tr,de-DE [--replace]
//   node figma_js.mjs read     spec.json --locale en-US
//
// Output: Work/figma/<mode>_<locale>[_partN].js. Claude reads the file, passes its content verbatim to
// use_figma's `code` field, and saves the returned JSON as Work/figma/<same name>.result.json.
import fs from 'node:fs';
import path from 'node:path';
import { loadSpec, resolveBoards, fontsOf, parseRuns, boardPrefix, CANVAS } from './layout.mjs';

const argv = process.argv.slice(2), opts = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) { pos.push(argv[i]); continue; }
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v == null || v.startsWith('--')) opts[k] = true; else { opts[k] = v; i++; }
}
const [mode, specPath] = pos;
if (!['build', 'localize', 'read'].includes(mode) || !specPath) {
  console.error('Usage: node figma_js.mjs build|localize|read spec.json [options]'); process.exit(1);
}
const { spec, specDir } = loadSpec(specPath);
const { w: W, h: H } = CANVAS[spec.canvas];
const PAGE = `${spec.code} ${spec.set}`;
const COL_GAP = 120, ROW_GAP = 520;
const rowY = loc => { const i = spec.locales.indexOf(loc); if (i < 0) throw new Error(`Locale not in spec: ${loc}`); return i * (H + ROW_GAP); };
const outDir = path.join(specDir, 'Work/figma'); fs.mkdirSync(outDir, { recursive: true });
const LIMIT = 48000;   // use_figma code field holds 50,000 characters

// ---------------------------------------------------------------- shared code that runs on the Figma side
const RUNTIME = String.raw`
const warnings = [];
const W2S = {100:'Thin',200:'Extra Light',300:'Light',400:'Regular',500:'Medium',600:'Semi Bold',700:'Bold',800:'Extra Bold',900:'Black'};
const VARS = {}, VARVAL = {}, STYLES = {}, stale = new Set();
// if it is a brand color (token), the paint is bound to the Variable: the designer changes the color in one place.
// If the Variable's value in Figma differs from the spec, it is not bound (so it matches the preview) and a warning is given.
const nearC = (a, c) => a && ['r', 'g', 'b'].every(k => Math.abs(a[k] - c[k]) < 0.004);
const solid = c => { const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
  if (!c.token || !VARS[c.token]) return p;
  if (!nearC(VARVAL[c.token], c)) { if (!stale.has(c.token)) { stale.add(c.token); warnings.push('Variable ' + c.token + ' has a different value in Figma; not bound. Update the brand with tokens.mjs figma, or take Figma as the source with tokens.mjs read/merge.'); } return p; }
  return figma.variables.setBoundVariableForPaint({ ...p, opacity: 1 }, 'color', VARS[c.token]); };
async function loadBrand(collection) {
  if (!collection) return;
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === collection);
  if (!col) { warnings.push('"' + collection + '" Variables collection not found: run tokens.mjs figma first. Colors were written as fixed values.'); return; }
  const all = await figma.variables.getLocalVariablesAsync('COLOR'), byId = Object.fromEntries(all.map(v => [v.id, v]));
  const mode = col.modes[0].modeId;
  const val = (v, d = 0) => { const x = v.valuesByMode[mode] ?? Object.values(v.valuesByMode)[0]; return x && x.type === 'VARIABLE_ALIAS' ? (d < 10 && byId[x.id] ? val(byId[x.id], d + 1) : null) : x; };
  for (const v of all) if (v.variableCollectionId === col.id) { VARS[v.name] = v; VARVAL[v.name] = val(v); }
  for (const s of await figma.getLocalTextStylesAsync()) STYLES[s.name] = s;
}
const paint = f => !f ? [] : f.kind === 'solid' ? [solid(f.color)] : [{ type: 'GRADIENT_LINEAR', gradientTransform: f.transform,
  gradientStops: f.stops.map(s => ({ position: s.position, color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } })) }];
const effects = n => { const e = [];
  if (n.shadow) e.push({ type: 'DROP_SHADOW', color: { r: n.shadow.color.r, g: n.shadow.color.g, b: n.shadow.color.b, a: n.shadow.color.a },
    offset: { x: n.shadow.x, y: n.shadow.y }, radius: n.shadow.blur, spread: (n.kind === 'rect' || n.kind === 'ellipse') ? n.shadow.spread : 0, visible: true, blendMode: 'NORMAL' });
  if (n.blur) e.push({ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: n.blur, visible: true });
  return e; };
// rotate around the center like CSS (node.rotation rotates around the top-left corner)
function place(node, x, y, deg) {
  if (!deg) { node.x = x; node.y = y; return; }
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), w = node.width, h = node.height;
  const cx = x + w / 2, cy = y + h / 2;
  node.relativeTransform = [[c, -s, cx - (c * w / 2 - s * h / 2)], [s, c, cy - (s * w / 2 + c * h / 2)]];
}
const fontMap = {};
async function loadFonts(list) {
  for (const f of list) {
    const key = f.family + '|' + f.style;
    try { await figma.loadFontAsync({ family: f.family, style: f.style }); fontMap[key] = { family: f.family, style: f.style }; }
    catch (e) {
      let fb = { family: 'Inter', style: W2S[f.weight] || 'Regular' };
      try { await figma.loadFontAsync(fb); } catch (e2) { fb = { family: 'Inter', style: 'Regular' }; await figma.loadFontAsync(fb); }
      fontMap[key] = fb;
      warnings.push('Font not available in the Figma account: ' + f.family + ' ' + f.style + ' -> used Inter ' + fb.style);
    }
  }
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
}
const plain = v => (v === figma.mixed ? 'mixed' : v);
const ALIGN = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' };
// CSS angle -> gradientTransform (same as layout.mjs linearTransform; for nodes whose size is only known in Figma)
function linearT(deg, W, H) {
  const a = deg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), L = Math.abs(W * dx) + Math.abs(H * dy);
  const p0x = W / 2 - dx * L / 2, p0y = H / 2 - dy * L / 2, r2a = -dy * W / L, r2b = dx * H / L;
  return [[W * dx / L, H * dy / L, -(p0x * dx + p0y * dy) / L], [r2a, r2b, 0.5 - (r2a + r2b) * 0.5]];
}
async function openPage(name, create) {
  let page = figma.root.children.find(p => p.name === name);
  if (!page) { if (!create) throw new Error('Page not found: ' + name); page = figma.createPage(); page.name = name; }
  await figma.setCurrentPageAsync(page);
  return page;
}
function rowLabel(page, text, y) {
  const t = figma.createText(); page.appendChild(t);
  t.fontName = { family: 'Inter', style: 'Bold' }; t.fontSize = 140; t.characters = text;
  t.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.17 } }];
  t.name = 'label:' + text; t.x = 0; t.y = y - 260; return t;
}
const lineCount = t => { if (t.fontSize === figma.mixed || t.lineHeight === figma.mixed) return -1; const lh = t.lineHeight; const px = lh.unit === 'PIXELS' ? lh.value : lh.unit === 'PERCENT' ? t.fontSize * lh.value / 100 : t.fontSize * 1.2; return Math.round(t.height / px); };
`;

const BUILD = String.raw`
const page = await openPage(P.page, true);
const names = new Set([...P.boards.map(b => b.name), ...(P.skipLabel ? [] : ['label:' + P.label])]);
const existing = page.children.filter(n => names.has(n.name));
if (existing.length && !P.replace) return { error: 'EXISTS', page: page.id, existing: existing.map(n => n.name),
  hint: 'Stopped so the designer\'s edits are not deleted. Start a new set code, or regenerate on purpose with --replace.' };
existing.forEach(n => n.remove());
await loadFonts(P.fonts);
await loadBrand(P.collection);
const uploads = [], created = [], bound = { variables: 0, textStyles: 0 };

async function build(n, parent) {
  let node;
  if (n.kind === 'svg') {
    node = figma.createNodeFromSvg(n.svg); parent.appendChild(node); node.resize(n.w, n.h);
  } else if (n.kind === 'text') {
    node = figma.createText(); parent.appendChild(node);
    node.fontName = fontMap[n.font.family + '|' + n.font.style];
    node.textAutoResize = 'HEIGHT'; node.resize(n.w, 10); node.textAutoResize = 'HEIGHT';
    node.fontSize = n.size;
    node.lineHeight = { value: n.lineHeight * 100, unit: 'PERCENT' };
    node.letterSpacing = { value: n.letterSpacing * 100, unit: 'PERCENT' };
    node.textAlignHorizontal = ALIGN[n.align] || 'LEFT';
    node.characters = n.runs.map(r => r.text).join('');
    let i = 0; for (const r of n.runs) { node.setRangeFills(i, i + r.text.length, [solid(r.color)]); if (r.color.token && VARS[r.color.token]) bound.variables++; i += r.text.length; }
    if (n.textStyle && STYLES[n.textStyle]) {   // bind to the brand text style; if there is a fitted size, override it
      const st = STYLES[n.textStyle];
      await figma.loadFontAsync(st.fontName);
      if (node.setTextStyleIdAsync) await node.setTextStyleIdAsync(st.id); else node.textStyleId = st.id;
      if (st.fontSize !== n.size) { node.fontSize = n.size; warnings.push(n.name + ': detached from style ' + st.name + ' because it was fitted (' + n.size + ' px)'); }
      if (node.textStyleId === st.id) bound.textStyles++;
    }
  } else if (n.kind === 'badge') {
    node = figma.createAutoLayout('HORIZONTAL'); parent.appendChild(node);
    node.paddingLeft = node.paddingRight = n.padX; node.paddingTop = node.paddingBottom = n.padY;
    node.counterAxisAlignItems = 'CENTER'; node.cornerRadius = n.radius; node.fills = paint(n.fill);
    if (n.stroke) { node.strokes = [solid(n.stroke.color)]; node.strokeWeight = n.stroke.width; node.strokeAlign = 'INSIDE'; }
    const t = figma.createText(); node.appendChild(t);
    t.fontName = fontMap[n.font.family + '|' + n.font.style]; t.fontSize = n.size;
    t.lineHeight = { value: 120, unit: 'PERCENT' }; t.letterSpacing = { value: n.letterSpacing * 100, unit: 'PERCENT' };
    t.characters = n.text; t.fills = [solid(n.color)]; t.name = 'label';
    if (n.fill && n.fill.kind === 'linear') node.fills = paint({ ...n.fill, transform: linearT(n.fill.angle, node.width, node.height) });
  } else {
    node = n.kind === 'ellipse' ? figma.createEllipse() : n.kind === 'frame' ? figma.createFrame() : figma.createRectangle();
    parent.appendChild(node);
    node.resize(Math.max(n.w, 0.01), Math.max(n.h, 0.01));
    if (n.kind !== 'ellipse') node.cornerRadius = n.radius || 0;
    if (n.image) { node.fills = [{ type: 'SOLID', color: { r: 0.82, g: 0.82, b: 0.85 } }]; uploads.push({ nodeId: node.id, file: n.image.file, name: n.name }); }
    else node.fills = paint(n.fill);
    if (n.stroke) { node.strokes = [solid(n.stroke.color)]; node.strokeWeight = n.stroke.width; node.strokeAlign = 'INSIDE'; }
    if (n.kind === 'frame') { node.clipsContent = false; for (const c of n.children) await build(c, node); }
  }
  node.name = n.name;
  if (n.kind !== 'text' || n.shadow) node.effects = effects(n);
  node.opacity = n.opacity ?? 1;
  const x = n.kind === 'badge' && n.anchor === 'center' ? n.x - node.width / 2 : n.x;
  place(node, x, n.y, n.rotate);
  return node;
}

if (!P.skipLabel) created.push(rowLabel(page, P.label, P.rowY).id);
const boards = [];
for (const [i, b] of P.boards.entries()) {
  const f = figma.createFrame(); page.appendChild(f);
  f.name = b.name; f.resize(b.width, b.height); f.x = b.x; f.y = P.rowY;
  f.fills = paint(b.fill); f.clipsContent = true;
  for (const n of b.nodes) await build(n, f);
  boards.push({ name: b.name, id: f.id }); created.push(f.id);
}
return { page: page.id, row: P.label, boards, createdNodeIds: created, uploads, warnings, bound,
  next: uploads.length ? 'upload_assets(count=' + uploads.length + ', nodeIds=uploads[].nodeId in order, scaleMode=FILL, currentPageId=page) -> save the returned URL list -> figma_upload.py' : 'no images, no upload needed' };
`;

const LOCALIZE = String.raw`
const page = await openPage(P.page, false);
const byName = n => page.children.find(c => c.name === n);
const clash = [...P.items.map(i => i.dst), ...(P.skipLabel ? [] : ['label:' + P.label])].filter(n => byName(n));
if (clash.length && !P.replace) return { error: 'EXISTS', existing: clash, hint: 'The target locale row already exists. Use --replace to rebuild it on purpose.' };
clash.forEach(n => byName(n).remove());
await loadFonts(P.fonts);
await loadBrand(P.collection);
const uploads = [], texts = [], created = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!P.skipLabel) created.push(rowLabel(page, P.label, P.rowY).id);

for (const it of P.items) {
  const src = byName(it.src);
  if (!src) { warnings.push('Source frame not found: ' + it.src); continue; }
  const dst = src.clone(); dst.name = it.dst; dst.x = src.x; dst.y = P.rowY; created.push(dst.id);
  for (const tx of it.texts) {
    const node = dst.findOne(n => n.type === 'TEXT' && n.name === tx.name);
    if (!node) { warnings.push(it.dst + ': text layer not found ' + tx.name); continue; }
    const segs = node.getStyledTextSegments(['fontName', 'fills']);
    await Promise.all(segs.map(s => figma.loadFontAsync(s.fontName)));
    const base = segs.reduce((m, s) => (s.end - s.start > m.end - m.start ? s : m), segs[0]);   // longest segment = base
    const acc = segs.find(s => !same(s.fills, base.fills)) || null;
    const accFills = acc ? acc.fills : (tx.accent ? [solid(tx.accent)] : base.fills);
    // a locale-specific font (byLocale), if any, replaces the source font
    const swap = tx.font && tx.srcFont && (tx.font.family !== tx.srcFont.family || tx.font.style !== tx.srcFont.style);
    const baseFont = swap ? fontMap[tx.font.family + '|' + tx.font.style] : base.fontName;
    const accFont = swap ? baseFont : (acc ? acc.fontName : base.fontName);
    const h0 = node.height, size0 = node.fontSize;
    node.characters = tx.runs.map(r => r.text).join('');
    node.setRangeFontName(0, node.characters.length, baseFont);
    node.setRangeFills(0, node.characters.length, base.fills);
    let i = 0;
    for (const r of tx.runs) { if (r.accent && r.text.length) { node.setRangeFills(i, i + r.text.length, accFills); node.setRangeFontName(i, i + r.text.length, accFont); } i += r.text.length; }
    let size = typeof size0 === 'number' ? size0 : null;
    if (tx.maxLines && size && tx.fit !== false) {
      const min = size * 0.75;
      while (lineCount(node) > tx.maxLines && size * 0.98 >= min) { size = Math.round(size * 0.98 * 10) / 10; node.fontSize = size; }
    }
    const lines = lineCount(node);
    texts.push({ board: it.dst, name: tx.name, lines, maxLines: tx.maxLines, size: [plain(size0), plain(size)], grew: Math.round(node.height - h0),
      status: lines < 0 ? 'CHECK: mixed font sizes, could not count lines' : tx.maxLines && lines > tx.maxLines ? 'ERROR: does not fit, shorten the text' : size !== size0 ? 'shrunk' : 'ok' });
  }
  for (const bd of it.badges) {
    const fr = dst.findOne(n => n.name === bd.name);
    const t = fr && fr.findOne(n => n.type === 'TEXT');
    if (!t) { warnings.push(it.dst + ': badge not found ' + bd.name); continue; }
    await Promise.all(t.getStyledTextSegments(['fontName']).map(s => figma.loadFontAsync(s.fontName)));
    const cx = fr.x + fr.width / 2;
    t.characters = bd.text;
    if (bd.anchor === 'center' && !fr.rotation) fr.x = cx - fr.width / 2;
  }
  for (const im of it.images) {
    const node = dst.findOne(n => n.name === im.name);
    if (!node) { warnings.push(it.dst + ': image layer not found ' + im.name); continue; }
    uploads.push({ nodeId: node.id, file: im.file, name: im.name });
  }
}
return { page: page.id, row: P.label, createdNodeIds: created, texts, uploads, warnings,
  next: uploads.length ? 'upload the ' + uploads.length + ' locale-specific images with upload_assets -> figma_upload.py' : 'no images to upload' };
`;

const READ = String.raw`
const page = await openPage(P.page, false);
const out = {};
for (const name of P.boards) {
  const f = page.children.find(c => c.name === name);
  if (!f) { out[name] = null; continue; }
  const o = {};
  for (const t of f.findAll(n => n.type === 'TEXT')) {
    const label = t.parent && t.parent.name.startsWith('badge:') ? t.parent.name : t.name;
    if (!label.startsWith('text:') && !label.startsWith('badge:')) continue;
    const segs = t.getStyledTextSegments(['fills']);
    let s = '';
    if (segs.length > 1) { const base = JSON.stringify(segs[0].fills); for (const g of segs) s += JSON.stringify(g.fills) === base ? g.characters : '*' + g.characters + '*'; }
    else s = t.characters;
    const ref = label.startsWith('badge:') ? t.parent : t;
    o[label] = { text: s, fontSize: plain(t.fontSize), x: Math.round(ref.absoluteTransform[0][2] - f.absoluteTransform[0][2]), y: Math.round(ref.absoluteTransform[1][2] - f.absoluteTransform[1][2]), rotated: !!ref.rotation };
  }
  out[name] = o;
}
return { page: page.id, boards: out };
`;

// ---------------------------------------------------------------- output
const wrap = (body, P) => `// auto-generated: figma_js.mjs ${mode} (${new Date().toISOString().slice(0, 16)})\nconst P = ${JSON.stringify(P)};\n${RUNTIME}\n${body}`;
function emit(name, body, P, splitKey) {
  let code = wrap(body, P);
  if (code.length <= LIMIT || !splitKey) return [write(name, code)];
  const items = P[splitKey], parts = Math.ceil(code.length / LIMIT) + 1, per = Math.ceil(items.length / parts), files = [];
  if (per < 1 || items.length < 2) throw new Error(`${name}: a single board is already ${code.length} characters, reduce the layers`);
  for (let k = 0; k * per < items.length; k++) {
    const sub = { ...P, [splitKey]: items.slice(k * per, (k + 1) * per), ...(k > 0 ? { skipLabel: true } : {}) };
    files.push(write(`${name}_part${k + 1}`, wrap(body, sub)));
  }
  return files;
}
function write(name, code) {
  const f = path.join(outDir, `${name}.js`); fs.writeFileSync(f, code);
  if (code.length > 50000) throw new Error(`${f} is ${code.length} characters, use_figma limit is 50,000`);
  return { file: path.relative(process.cwd(), f), chars: code.length };
}
const r1 = v => Math.round(v * 10000) / 10000;   // color precision: 4 decimals, error < 0.03 levels
function slim(o) {   // round numbers, shorten the JS
  if (Array.isArray(o)) return o.map(slim);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) if (v != null && k !== 'raw' && k !== 'hex') r[k] = slim(v); return r; }
  return typeof o === 'number' ? r1(o) : o;
}

const out = [];
if (mode === 'build') {
  const locs = (opts.locales ?? spec.baseLocale ?? spec.locales[0]).split(',');
  const fitPath = opts.fit ?? path.join(specDir, 'Work/preview/fit.json');
  const fit = fs.existsSync(fitPath) ? JSON.parse(fs.readFileSync(fitPath, 'utf8')) : {};
  for (const loc of locs) {
    const boards = resolveBoards(spec, specDir, loc).map((b, i) => {
      for (const n of b.nodes) if (n.kind === 'text' && fit[loc]?.[b.name]?.[n.name]) n.size = fit[loc][b.name][n.name];
      return slim({ ...b, x: i * (W + COL_GAP) });
    });
    const P = { page: PAGE, label: loc, rowY: rowY(loc), replace: !!opts.replace, fonts: fontsOf(spec, loc), collection: spec._brand?.collection ?? null, boards };
    out.push(...emit(`build_${loc}`, BUILD, P, 'boards'));
  }
} else if (mode === 'localize') {
  const from = opts.from ?? spec.baseLocale ?? spec.locales[0];
  if (!opts.to) throw new Error('--to is required (example: --to tr,de-DE)');
  const pre = boardPrefix(spec);
  for (const loc of String(opts.to).split(',')) {
    const srcBoards = resolveBoards(spec, specDir, from), dstBoards = resolveBoards(spec, specDir, loc);
    const items = dstBoards.map((b, i) => {
      const flatten = ns => { const out = []; const walk = a => a.forEach(n => { out.push(n); if (n.children) walk(n.children); }); walk(ns); return out; };
      const flat = flatten(b.nodes), srcFlat = flatten(srcBoards[i].nodes);
      return {
        src: srcBoards[i].name, dst: b.name,
        texts: flat.filter(n => n.kind === 'text').map(n => {
          const parsed = parseRuns(n.raw), k = parsed.findIndex(r => r.accent);
          const src = srcFlat.find(m => m.name === n.name);
          return { name: n.name, runs: parsed, maxLines: n.maxLines, fit: n.fit, accent: k >= 0 ? n.runs[k].color : null,
            font: { family: n.font.family, style: n.font.style }, srcFont: src ? { family: src.font.family, style: src.font.style } : null };
        }),
        badges: flat.filter(n => n.kind === 'badge').map(n => ({ name: n.name, text: n.text, anchor: n.anchor })),
        images: flat.filter(n => n.image?.localized).map(n => ({ name: n.name, file: n.image.file })),
      };
    });
    const P = { page: PAGE, label: loc, rowY: rowY(loc), replace: !!opts.replace, fonts: fontsOf(spec, loc), collection: spec._brand?.collection ?? null, items: slim(items) };
    out.push(...emit(`localize_${loc}`, LOCALIZE, P, 'items'));
  }
} else {
  const loc = opts.locale ?? spec.baseLocale ?? spec.locales[0];
  const P = { page: PAGE, boards: resolveBoards(spec, specDir, loc).map(b => b.name) };
  out.push(...emit(`read_${loc}`, READ, P));
}
for (const o of out) console.log(`${o.file}  (${o.chars} characters)`);
console.log(`Figma page: "${PAGE}". Pass each file's content to the use_figma 'code' field; the first build call creates the page, the rest can run in parallel.`);
