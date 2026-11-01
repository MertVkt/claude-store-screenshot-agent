#!/usr/bin/env node
// figma_dryrun.mjs : runs the generated use_figma JS in a strict Plugin API mock, without sending it to Figma.
// Catches: syntax errors, undefined variables, unknown properties on the wrong node type, 0-255 colors,
// an `a` field in a paint, writing text with an unloaded font, enum errors, a missing return.
// Does not catch: real Figma rendering differences. Figma MCP calls are limited, so run it here first.
//
//   node figma_dryrun.mjs Work/figma/build_en-US.js [--state Work/figma/_dryrun_state.json]
//
// With --state the scene is written to a file and read on the next run (to test the build -> localize sequence).
import fs from 'node:fs';
import path from 'node:path';

const [file, , statePath] = [process.argv[2], process.argv[3], process.argv[4]];
if (!file) { console.error('Usage: node figma_dryrun.mjs <file.js> [--state state.json]'); process.exit(1); }

let nextId = 1;
const id = () => `${Math.floor(nextId / 1000) + 1}:${nextId++}`;
const fail = m => { throw new Error('[dryrun] ' + m); };
const isUnit = v => typeof v === 'number' && v >= 0 && v <= 1.0000001;
const loaded = new Set(['Inter|Regular']);
const AVAILABLE = /^(Inter|Roboto|Poppins|Montserrat|Open Sans|SF Pro Display|SF Pro Text|DM Sans|Manrope|Plus Jakarta Sans|Lato|Nunito)\|/;

function checkPaints(ps, where) {
  if (!Array.isArray(ps)) fail(`${where}: paint list must be an array`);
  for (const p of ps) {
    if (p.type === 'SOLID') {
      if ('a' in p.color) fail(`${where}: SOLID color cannot contain 'a', use opacity`);
      for (const k of ['r', 'g', 'b']) if (!isUnit(p.color[k])) fail(`${where}: color ${k}=${p.color[k]} is not in the 0-1 range`);
      if (p.opacity != null && !isUnit(p.opacity)) fail(`${where}: opacity ${p.opacity}`);
    } else if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL') {
      if (!Array.isArray(p.gradientTransform) || p.gradientTransform.length !== 2) fail(`${where}: gradientTransform must be 2x3`);
      for (const s of p.gradientStops) { for (const k of ['r', 'g', 'b', 'a']) if (!isUnit(s.color[k])) fail(`${where}: gradient stop ${k}`); }
    } else if (p.type !== 'IMAGE') fail(`${where}: unknown paint ${p.type}`);
  }
}
function checkEffects(es, where) {
  for (const e of es) {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      for (const k of ['r', 'g', 'b', 'a']) if (!isUnit(e.color?.[k])) fail(`${where}: shadow color.${k}`);
      if (!e.offset || typeof e.radius !== 'number' || e.visible == null || !e.blendMode) fail(`${where}: shadow fields missing`);
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      if (typeof e.radius !== 'number' || e.visible == null) fail(`${where}: blur fields missing`);
    } else fail(`${where}: unknown effect ${e.type}`);
  }
}

const COMMON = ['name', 'x', 'y', 'opacity', 'visible', 'locked', 'rotation', 'relativeTransform', 'effects', 'blendMode', 'constraints', 'layoutPositioning'];
const GEOM = ['fills', 'strokes', 'strokeWeight', 'strokeAlign'];
const CORNER = ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
const AUTO = ['layoutMode', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing', 'counterAxisAlignItems', 'primaryAxisAlignItems', 'primaryAxisSizingMode', 'counterAxisSizingMode', 'clipsContent', 'layoutSizingHorizontal', 'layoutSizingVertical'];
const ALLOWED = {
  PAGE: ['name'], RECTANGLE: [...COMMON, ...GEOM, ...CORNER], ELLIPSE: [...COMMON, ...GEOM],
  FRAME: [...COMMON, ...GEOM, ...CORNER, ...AUTO],
  TEXT: [...COMMON, ...GEOM, 'characters', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textAlignHorizontal', 'textAlignVertical', 'textAutoResize', 'textStyleId', 'layoutSizingHorizontal', 'layoutSizingVertical'],
};
const ENUM = { textAlignHorizontal: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'], textAutoResize: ['NONE', 'HEIGHT', 'WIDTH_AND_HEIGHT', 'TRUNCATE'],
  strokeAlign: ['INSIDE', 'OUTSIDE', 'CENTER'], layoutMode: ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'], counterAxisAlignItems: ['MIN', 'MAX', 'CENTER', 'BASELINE'] };

function makeNode(type, init = {}) {
  const st = { type, id: id(), name: type, x: 0, y: 0, width: 100, height: 100, children: [], parent: null, fills: [], strokes: [], effects: [], opacity: 1,
    characters: '', fontSize: 12, fontName: { family: 'Inter', style: 'Regular' }, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: 0 },
    textAutoResize: 'WIDTH_AND_HEIGHT', layoutMode: 'NONE', paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, rotation: 0, ranges: [], ...init };
  const relayout = () => {
    if (st.type === 'TEXT') {
      const lh = st.lineHeight.unit === 'PIXELS' ? st.lineHeight.value : st.lineHeight.unit === 'PERCENT' ? st.fontSize * st.lineHeight.value / 100 : st.fontSize * 1.2;
      const lineW = s => s.length * st.fontSize * 0.56;
      if (st.textAutoResize === 'WIDTH_AND_HEIGHT') { st.width = Math.max(1, ...st.characters.split('\n').map(lineW)); st.height = lh * st.characters.split('\n').length; }
      else if (st.textAutoResize === 'HEIGHT') st.height = lh * st.characters.split('\n').reduce((a, s) => a + Math.max(1, Math.ceil(lineW(s) / st.width)), 0);
    }
    if (st.type === 'FRAME' && st.layoutMode === 'HORIZONTAL') {
      st.width = st.paddingLeft + st.paddingRight + st.children.reduce((a, c) => a + c.width, 0);
      st.height = st.paddingTop + st.paddingBottom + Math.max(0, ...st.children.map(c => c.height));
    }
    if (st.parent && st.parent.__relayout) st.parent.__relayout();
  };
  const api = {
    appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); st.children.push(c); c.__setParent(proxy); relayout(); },
    insertChild(i, c) { st.children.splice(i, 0, c); c.__setParent(proxy); },
    remove() { if (st.parent) st.parent.children.splice(st.parent.children.indexOf(proxy), 1); st.removed = true; },
    resize(w, h) { if (!(w > 0 && h > 0)) fail(`${st.name}: resize(${w},${h}) must be positive`); st.width = w; st.height = h; relayout(); },
    findOne(fn) { for (const c of st.children) { if (fn(c)) return c; const r = c.findOne?.(fn); if (r) return r; } return null; },
    findAll(fn) { const out = []; for (const c of st.children) { if (fn(c)) out.push(c); if (c.findAll) out.push(...c.findAll(fn)); } return out; },
    clone() { const cp = makeNode(st.type, { ...JSON.parse(JSON.stringify({ ...st, children: [], parent: null })), id: undefined }); cp.__state.id = id();
      for (const c of st.children) cp.appendChild(c.clone()); if (st.parent) st.parent.appendChild(cp); return cp; },
    getStyledTextSegments(fields) { if (st.type !== 'TEXT') fail('getStyledTextSegments is TEXT only');
      const segs = []; let cur = null;
      for (let i = 0; i < st.characters.length; i++) { const f = JSON.stringify(st.ranges[i] ?? st.fills); if (!cur || cur.k !== f) { cur = { k: f, start: i, end: i + 1, characters: st.characters[i], fills: JSON.parse(f), fontName: st.fontName }; segs.push(cur); } else { cur.end++; cur.characters += st.characters[i]; } }
      return segs.length ? segs.map(({ k, ...s }) => s) : [{ start: 0, end: 0, characters: '', fills: st.fills, fontName: st.fontName }]; },
    setRangeFills(a, b, p) { if (st.type !== 'TEXT') fail('setRangeFills is TEXT only'); if (!(a >= 0 && b <= st.characters.length && a < b)) fail(`setRangeFills(${a},${b}) out of range (${st.characters.length})`); checkPaints(p, st.name); for (let i = a; i < b; i++) st.ranges[i] = p; },
    setRangeFontName(a, b, f) { if (!loaded.has(f.family + '|' + f.style)) fail(`setRangeFontName: font not loaded ${f.family} ${f.style}`); if (!(a >= 0 && b <= st.characters.length)) fail('setRangeFontName out of range'); },
    screenshot: async () => ({}),
    async setTextStyleIdAsync(sid) { if (st.type !== 'TEXT') fail('setTextStyleIdAsync is TEXT only'); const ts = DB.textStyles.find(x => x.id === sid); if (!ts) fail('text style not found: ' + sid);
      if (!loaded.has(ts.fontName.family + '|' + ts.fontName.style)) fail('text style font not loaded'); st.fontName = ts.fontName; st.fontSize = ts.fontSize; st.lineHeight = ts.lineHeight; st.textStyleId = sid; relayout(); },
    async setEffectStyleIdAsync(sid) { st.effectStyleId = sid; },
    __setParent(p) { st.parent = p; }, __relayout: relayout, __state: st,
  };
  const proxy = new Proxy(api, {
    get(t, k) { if (k in t) return t[k]; if (k === 'absoluteTransform') { let x = st.x, y = st.y, p = st.parent; while (p && p.__state.type !== 'PAGE') { x += p.__state.x; y += p.__state.y; p = p.__state.parent; } return [[1, 0, x], [0, 1, y]]; } return st[k]; },
    set(t, k, v) {
      if (!ALLOWED[st.type].includes(k)) fail(`${st.type} node has no writable '${String(k)}' property (${st.name})`);
      if (ENUM[k] && !ENUM[k].includes(v)) fail(`${k}='${v}' is invalid`);
      if (k === 'fills' || k === 'strokes') checkPaints(v, st.name + '.' + k);
      if (k === 'effects') checkEffects(v, st.name);
      if (k === 'opacity' && !isUnit(v)) fail(`opacity ${v}`);
      if ((k === 'lineHeight' || k === 'letterSpacing') && (typeof v !== 'object' || !v.unit)) fail(`${k} must be a {unit, value} object`);
      if (k === 'fontName' && !loaded.has(v.family + '|' + v.style)) fail(`fontName: font not loaded ${v.family} ${v.style}`);
      if (k === 'characters' && !loaded.has(st.fontName.family + '|' + st.fontName.style)) fail(`characters: font not loaded ${st.fontName.family} ${st.fontName.style}`);
      if (k === 'relativeTransform' && !(v.length === 2 && v.every(r => r.length === 3 && r.every(Number.isFinite)))) fail('relativeTransform must be 2x3 numbers');
      if (k === 'relativeTransform') { st.x = v[0][2]; st.y = v[1][2]; }
      st[k] = v; if (['characters', 'fontSize', 'lineHeight', 'textAutoResize', 'paddingLeft', 'paddingTop'].includes(k)) relayout();
      return true;
    },
  });
  return proxy;
}

// ---------------------------------------------------------------- figma global
const doc = { children: [] };
const DB = { collections: [], variables: [], textStyles: [], effectStyles: [] };
let vid = 1;
function mkCollection(name) { const c = { id: 'VariableCollectionId:' + vid++, name, modes: [{ modeId: 'm1', name: 'Mode 1' }] }; c.renameMode = (id, nm) => { const m = c.modes.find(x => x.modeId === id); if (!m) fail('renameMode: mode not found'); m.name = nm; }; DB.collections.push(c); return c; }
function mkVariable(name, col, type, init) {
  const v = init ?? { id: 'VariableID:' + vid++, name, variableCollectionId: typeof col === 'string' ? col : col.id, resolvedType: type, valuesByMode: {}, scopes: ['ALL_SCOPES'] };
  v.setValueForMode = (m, val) => { if (val && val.type === 'VARIABLE_ALIAS') { if (!DB.variables.find(x => x.id === val.id)) fail('alias target not found'); }
    else for (const k of ['r', 'g', 'b', 'a']) if (!isUnit(val?.[k])) fail(`variable ${name} color ${k} invalid (0-1, including a)`); v.valuesByMode[m] = val; };
  DB.variables.push(v); return v;
}
let current = null;
function addPage(name) { const p = makeNode('PAGE', { name }); p.__state.type = 'PAGE'; doc.children.push(p); return p; }
if (statePath && fs.existsSync(statePath)) {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const revive = (s, parent) => { const n = makeNode(s.type, { ...s, children: [] }); for (const c of s.children) n.appendChild(revive(c)); return n; };
  for (const p of saved.pages) { const pg = addPage(p.name); for (const c of p.children) pg.appendChild(revive(c)); }
  for (const f of saved.loaded ?? []) loaded.add(f);
  if (saved.db) { for (const c of saved.db.collections) { c.renameMode = (id, nm) => { c.modes.find(x => x.modeId === id).name = nm; }; DB.collections.push(c); } for (const v of saved.db.variables) mkVariable(v.name, v.variableCollectionId, v.resolvedType, v); DB.textStyles.push(...saved.db.textStyles); DB.effectStyles.push(...saved.db.effectStyles); }
} else addPage('Page 1');
current = doc.children[0];

const figma = {
  root: doc,
  mixed: Symbol('mixed'),
  get currentPage() { return current; },
  set currentPage(_) { fail('figma.currentPage cannot be assigned, use setCurrentPageAsync'); },
  async setCurrentPageAsync(p) { current = p; },
  createPage() { return addPage('Page'); },
  createFrame() { const n = makeNode('FRAME'); current.appendChild(n); return n; },
  createAutoLayout(dir = 'HORIZONTAL') { const n = makeNode('FRAME', { layoutMode: dir }); current.appendChild(n); return n; },
  createRectangle() { const n = makeNode('RECTANGLE'); current.appendChild(n); return n; },
  createEllipse() { const n = makeNode('ELLIPSE'); current.appendChild(n); return n; },
  createText() { const n = makeNode('TEXT'); current.appendChild(n); return n; },
  async loadFontAsync(f) { if (!f || !f.family || !f.style) fail('loadFontAsync requires {family, style}'); if (!AVAILABLE.test(f.family + '|')) throw new Error(`font not found: ${f.family}`); loaded.add(f.family + '|' + f.style); },
  notify() { fail("figma.notify does not exist in Figma MCP"); },
  variables: {
    async getLocalVariableCollectionsAsync() { return DB.collections; },
    async getLocalVariablesAsync(type) { return DB.variables.filter(v => !type || v.resolvedType === type); },
    createVariableCollection(name) { return mkCollection(name); },
    createVariable(name, col, type) { if (!col) fail('createVariable requires a collection'); if (!['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'].includes(type)) fail('variable type'); return mkVariable(name, col, type); },
    createVariableAlias(v) { if (!v || !v.id) fail('createVariableAlias: variable not found'); return { type: 'VARIABLE_ALIAS', id: v.id }; },
    setBoundVariableForPaint(p, field, v) { if (p.type !== 'SOLID' || field !== 'color') fail('setBoundVariableForPaint is SOLID color only'); if (!v || v.resolvedType !== 'COLOR') fail('COLOR variable required'); return { ...p, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } }; },
  },
  async getLocalTextStylesAsync() { return DB.textStyles; },
  async getLocalEffectStylesAsync() { return DB.effectStyles; },
  createTextStyle() { const t = new Proxy({ id: 'S:' + vid++, name: 'Text', fontName: { family: 'Inter', style: 'Regular' }, fontSize: 12, lineHeight: { unit: 'AUTO' } }, { set(o, k, v) {
    if (k === 'fontName' && !loaded.has(v.family + '|' + v.style)) fail('text style font not loaded'); if ((k === 'lineHeight' || k === 'letterSpacing') && !v.unit) fail(k + ' {unit,value}'); o[k] = v; return true; } }); DB.textStyles.push(t); return t; },
  createEffectStyle() { const e = { id: 'S:' + vid++, name: 'Effect', effects: [] }; DB.effectStyles.push(e); return e; },
  createNodeFromSvg(svg) { if (!/^<svg[\s\S]*<\/svg>$/.test(svg.trim())) fail('invalid svg'); const w = +(svg.match(/width="([\d.]+)"/) || [0, 24])[1], h = +(svg.match(/height="([\d.]+)"/) || [0, 24])[1];
    const n = makeNode('FRAME', { width: w, height: h }); current.appendChild(n); return n; },
  createImageAsync() { fail('createImageAsync is not supported inside use_figma, use upload_assets'); },
  closePlugin() { fail('do not call closePlugin, use return'); },
};

const code = fs.readFileSync(file, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let result;
try { result = await new AsyncFunction('figma', code)(figma); }
catch (e) { console.error('DRYRUN ERROR:', e.message); process.exit(2); }
if (result === undefined) { console.error('DRYRUN ERROR: script does not return anything'); process.exit(2); }

const dump = n => { const s = n.__state; return { type: s.type, name: s.name, x: s.x, y: s.y, width: s.width, height: s.height, fills: s.fills, characters: s.characters, fontSize: s.fontSize, fontName: s.fontName, lineHeight: s.lineHeight, textAutoResize: s.textAutoResize, layoutMode: s.layoutMode, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight, paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, ranges: s.ranges, children: s.children.map(dump) }; };
if (statePath) fs.mkdirSync(path.dirname(path.resolve(statePath)), { recursive: true });
if (statePath) fs.writeFileSync(statePath, JSON.stringify({ pages: doc.children.map(p => ({ name: p.__state.name, children: p.__state.children.map(dump) })), loaded: [...loaded],
  db: { collections: DB.collections, variables: DB.variables.map(({ setValueForMode, ...v }) => v), textStyles: DB.textStyles.map(t => ({ ...t })), effectStyles: DB.effectStyles } }));
const count = n => n.__state.children.reduce((a, c) => a + 1 + count(c), 0);
console.log('DRYRUN OK  pages:', doc.children.map(p => `${p.__state.name}(${count(p)} nodes)`).join(', '));
fs.writeFileSync(file.replace(/\.js$/, '') + '.dryrun.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1).slice(0, 2500));
if (result && result.error) { console.error('DRYRUN: script returned an error: ' + result.error); process.exit(3); }
