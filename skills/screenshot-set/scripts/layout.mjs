// layout.mjs : spec.json -> list of resolved "boards" (absolute px geometry).
// render.mjs (HTML/PNG) and figma_js.mjs (Figma Plugin API) use the SAME output;
// geometry is computed in one place, so the two sides never drift apart.
import fs from 'node:fs';
import path from 'node:path';
import { brandForSpec } from './tokens.mjs';

// ---------------------------------------------------------------- canvas and device
export const CANVAS = {
  'iphone-6.9': { w: 1320, h: 2868, device: 'iphone' },
  'ipad-13':    { w: 2064, h: 2752, device: 'ipad' },
  'play-phone': { w: 1080, h: 1920, device: 'android' },
};

// Device geometry, relative to the outer width w. Screen aspect ratio comes from the real device.
export const DEVICES = {
  iphone:  { screenAspect: 2868 / 1320, bezel: 0.034, radius: 0.165, island: { w: 0.30, h: 0.088, top: 0.032 }, body: '#0B0B0E', edge: '#3A3A40' },
  ipad:    { screenAspect: 2752 / 2064, bezel: 0.034, radius: 0.060, camera: { d: 0.012, top: 0.012 },        body: '#0B0B0E', edge: '#3A3A40' },
  android: { screenAspect: 2400 / 1080, bezel: 0.030, radius: 0.120, camera: { d: 0.040, top: 0.028 },        body: '#0B0B0E', edge: '#3A3A40' },
};

// ---------------------------------------------------------------- helpers
export function hexToRgba(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = (i) => parseInt(full.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: full.length >= 8 ? n(6) : 1 };
}

function color(spec, v, fallback) {
  const val = v ?? fallback;
  if (val == null) return null;
  const hex = spec.colors?.[val] ?? spec._brand?.colors?.[val] ?? val;
  if (typeof hex !== 'string' || !hex.startsWith('#')) throw new Error(`Could not parse color: ${JSON.stringify(val)}`);
  // a brand color not overridden in spec.colors gets bound to that Variable in Figma
  const token = spec.colors?.[val] == null ? spec._brand?.colorTokens?.[val] : undefined;
  return { hex, ...hexToRgba(hex), ...(token ? { token } : {}) };
}

const own = (v, locale) => v != null && typeof v === 'object' && !Array.isArray(v) && locale in v;   // locale-specific? (did not fall back to the base locale)

function pick(v, locale, base) {
  if (v == null) return v;
  if (typeof v === 'object' && !Array.isArray(v)) {
    if (locale in v) return v[locale];
    if (base in v) return v[base];
    throw new Error(`No value for locale: ${locale} (keys: ${Object.keys(v).join(', ')})`);
  }
  return v;
}

/** "Fix *any* photo" -> [{text:'Fix ', accent:false}, {text:'any', accent:true}, ...] */
export function parseRuns(str) {
  const runs = []; let cur = ''; let acc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\' && str[i + 1] === '*') { cur += '*'; i++; continue; }
    if (c === '*') { if (cur) runs.push({ text: cur, accent: acc }); cur = ''; acc = !acc; continue; }
    cur += c;
  }
  if (cur) runs.push({ text: cur, accent: acc });
  return runs;
}

/** CSS angle (0 = up, clockwise) -> Figma gradientTransform (in the node's unit space). */
export function linearTransform(angleDeg, W, H) {
  const a = angleDeg * Math.PI / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const L = Math.abs(W * dx) + Math.abs(H * dy);
  const p0x = W / 2 - dx * L / 2, p0y = H / 2 - dy * L / 2;
  const row1 = [W * dx / L, H * dy / L, -(p0x * dx + p0y * dy) / L];
  const r2a = -dy * W / L, r2b = dx * H / L;
  const row2 = [r2a, r2b, 0.5 - (r2a + r2b) * 0.5];
  return [row1, row2];
}

function gradient(spec, g, W, H) {
  const stops = g.stops.map((s, i, arr) => {
    const [c, p] = Array.isArray(s) ? s : [s, arr.length === 1 ? 0 : i / (arr.length - 1)];
    return { color: color(spec, c), position: p };
  });
  return { kind: 'linear', angle: g.angle ?? 180, stops, transform: linearTransform(g.angle ?? 180, W, H) };
}

function fillOf(spec, f, W, H) {
  if (f == null) return null;
  if (typeof f === 'string') return { kind: 'solid', color: color(spec, f) };
  if (f.type === 'linear') return gradient(spec, f, W, H);
  if (f.type === 'solid') return { kind: 'solid', color: color(spec, f.color) };
  throw new Error(`Unknown fill: ${JSON.stringify(f)}`);
}

function shadowOf(spec, s, scale = 1) {
  if (!s) return null;
  const d = s === true ? {} : s;
  return { x: (d.x ?? 0) * scale, y: (d.y ?? 40) * scale, blur: (d.blur ?? 120) * scale, spread: d.spread ?? 0,
           color: color(spec, d.color ?? '#00000059') };
}

function resolveFile(specDir, p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(specDir, p);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  return abs;
}

/** Reads the PNG/JPEG/WebP header and returns the pixel size (used to compute the contain box). */
export function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = b.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (fmt === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`Could not read image size (must be png/jpg/webp): ${file}`);
}

/** Font key -> font; byLocale gives a locale-specific font (for example ja: Noto Sans JP). */
export function fontFor(spec, key, locale) {
  const f = spec.fonts?.[key] ?? spec._brand?.fonts?.[key];
  if (!f) throw new Error(`No font defined: ${key}`);
  const o = f.byLocale?.[locale] ?? f.byLocale?.[locale?.split('-')[0]];
  const { byLocale, ...rest } = f;
  return o ? { ...rest, file: undefined, ...o } : rest;
}

/** Lucide icon (ISC license, vendor/lucide) -> SVG text. In Figma, createNodeFromSvg turns it into an editable vector. */
let LUCIDE = null;
export function lucideSvg(name, size, stroke, width) {
  LUCIDE ??= JSON.parse(fs.readFileSync(new URL('./vendor/lucide/icon-nodes.json', import.meta.url), 'utf8'));
  const nodes = LUCIDE[name];
  if (!nodes) throw new Error(`No such Lucide icon: ${name} (search vendor/lucide/tags.json instead of node tokens...)`);
  const attrs = o => Object.entries(o).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke.slice(0, 7)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${nodes.map(([t, a]) => `<${t} ${attrs(a)}/>`).join('')}</svg>`;
}

// ---------------------------------------------------------------- layer resolution
function resolveLayer(spec, specDir, L, locale, base, ox, tag = '') {
  const common = { id: L.id, opacity: L.opacity ?? 1, rotate: L.rotate ?? 0 };
  const nm = (kind, suffix = '') => `${kind}:${L.id}${suffix}${tag}`;   // @<shot> suffix in a panorama keeps the name unique
  const x = (L.x ?? 0) + ox, y = L.y ?? 0;

  if (L.type === 'text' || L.type === 'badge') {
    const ts = L.textStyle ? spec._brand?.textStyles?.[L.textStyle] : null;
    if (L.textStyle && !ts) throw new Error(`textStyle '${L.textStyle}' not found in brand tokens (spec.brand?)`);
    if (ts) L = { size: ts.size, lineHeight: ts.lineHeight, letterSpacing: ts.letterSpacing, ...L, _ts: ts };
  }
  if (L.type === 'text') {
    const font = L.font ? fontFor(spec, L.font, locale) : L._ts ? fontFor({ ...spec, fonts: { _ts: L._ts.font, ...spec.fonts } }, '_ts', locale) : fontFor(spec, 'display', locale);
    if (!(L.w > 0) || !(L.size > 0)) throw new Error(`Text layer requires w and size (id: ${L.id})`);
    const str = String(pick(L.text, locale, base));
    const ink = color(spec, L.color, 'ink'), acc = color(spec, L.accent, (spec.colors?.accent ?? spec._brand?.colors?.accent) ? 'accent' : L.color ?? 'ink');
    return { ...common, kind: 'text', name: nm('text'), x, y, w: L.w, size: L.size,
      lineHeight: L.lineHeight ?? 1.08, letterSpacing: L.letterSpacing ?? 0, align: L.align ?? 'left',
      maxLines: L.maxLines ?? null, fit: L.fit ?? true, minSize: L.minSize ?? null, font, role: L.role ?? L.id,
      textStyle: L._ts?.figmaStyle ?? null,
      runs: parseRuns(str).map(r => ({ text: r.text, color: r.accent ? acc : ink })), raw: str };
  }

  if (L.type === 'device') {
    const model = L.model ?? 'iphone';
    const D = DEVICES[model]; if (!D) throw new Error(`Unknown device model: ${model}`);
    const w = L.w, b = Math.round(w * D.bezel), sw = w - 2 * b, sh = Math.round(sw * D.screenAspect);
    const h = sh + 2 * b, R = Math.round(w * D.radius), r = Math.max(R - b, 0);
    const screenFile = resolveFile(specDir, pick(L.screen, locale, base));
    const children = [
      { kind: 'rect', name: nm('img', '.screen'), x: b, y: b, w: sw, h: sh, radius: r, image: { file: screenFile, fit: 'cover', localized: own(L.screen, locale) && locale !== base } },
    ];
    if (D.island) {
      const iw = Math.round(sw * D.island.w), ih = Math.round(sw * D.island.h);
      children.push({ kind: 'rect', name: 'island', x: Math.round((w - iw) / 2), y: b + Math.round(sw * D.island.top), w: iw, h: ih, radius: ih / 2, fill: { kind: 'solid', color: hexToRgba('#000000') } });
    }
    if (D.camera) {
      const d = Math.round(sw * D.camera.d);
      children.push({ kind: 'ellipse', name: 'camera', x: Math.round((w - d) / 2), y: b + Math.round(sw * D.camera.top), w: d, h: d, fill: { kind: 'solid', color: hexToRgba('#000000') } });
    }
    return { ...common, kind: 'frame', name: nm('device'), x, y, w, h, radius: R,
      fill: { kind: 'solid', color: color(spec, L.body ?? D.body) },
      stroke: { color: color(spec, L.edge ?? D.edge), width: Math.max(2, Math.round(w * 0.004)) },
      shadow: shadowOf(spec, L.shadow ?? spec._brand?.deviceShadow ?? true, w / 900), children };
  }

  if (L.type === 'image') {
    const file = resolveFile(specDir, pick(L.src, locale, base));
    let bx = x, by = y, bw = L.w, bh = L.h;
    const fit = L.fit ?? 'contain';
    if (fit === 'contain') {           // shrink the box to the image's aspect ratio: in Figma, FILL == FIT
      const { w: iw, h: ih } = imageSize(file);
      const boxH = L.h ?? L.w * ih / iw;
      const s = Math.min(L.w / iw, boxH / ih);
      bw = Math.round(iw * s); bh = Math.round(ih * s);
      bx = x + Math.round((L.w - bw) / 2); by = y + Math.round((boxH - bh) / 2);
    }
    return { ...common, kind: 'rect', name: nm('img'), x: bx, y: by, w: bw, h: bh, radius: L.radius ?? 0,
      image: { file, fit: 'cover', localized: own(L.src, locale) && locale !== base }, shadow: shadowOf(spec, L.shadow) };
  }

  if (L.type === 'shape') {
    return { ...common, kind: L.shape === 'ellipse' ? 'ellipse' : 'rect', name: nm('shape'), x, y, w: L.w, h: L.h,
      radius: L.radius ?? 0, fill: fillOf(spec, L.fill ?? 'accent', L.w, L.h), blur: L.blur ?? 0,
      stroke: L.stroke ? { color: color(spec, L.stroke.color), width: L.stroke.width ?? 2 } : null, shadow: shadowOf(spec, L.shadow) };
  }

  if (L.type === 'badge') {
    const font = L.font ? fontFor(spec, L.font, locale) : L._ts ? fontFor({ ...spec, fonts: { _ts: L._ts.font, ...spec.fonts } }, '_ts', locale) : fontFor(spec, 'body', locale);
    return { ...common, kind: 'badge', name: nm('badge'), x, y, anchor: L.anchor ?? 'left',
      text: String(pick(L.text, locale, base)), font, size: L.size ?? 44, letterSpacing: L.letterSpacing ?? 0,
      color: color(spec, L.color, 'ink'), fill: fillOf(spec, L.fill ?? '#FFFFFF26', 100, 100),
      padX: L.padX ?? Math.round((L.size ?? 44) * 0.7), padY: L.padY ?? Math.round((L.size ?? 44) * 0.38),
      radius: L.radius ?? 999, stroke: L.stroke ? { color: color(spec, L.stroke.color), width: L.stroke.width ?? 2 } : null };
  }
  if (L.type === 'icon') {
    const size = L.size ?? 96, stroke = color(spec, L.color, 'accent');
    return { ...common, kind: 'svg', name: nm('icon'), x, y, w: size, h: size, color: stroke,
      svg: lucideSvg(L.name, size, stroke.hex, L.strokeWidth ?? 2) };
  }
  throw new Error(`Unknown layer type: ${L.type} (id: ${L.id})`);
}

function resolveBackground(spec, specDir, bg, W, H, locale, base) {
  const nodes = []; let fill = null;
  if (!bg) return { fill: { kind: 'solid', color: color(spec, 'bg', '#000000') }, nodes };
  if (bg.type === 'image') {
    fill = { kind: 'solid', color: color(spec, bg.under ?? 'bg', '#000000') };
    nodes.push({ kind: 'rect', name: 'img:bg', x: 0, y: 0, w: W, h: H, radius: 0, opacity: 1, rotate: 0,
      image: { file: resolveFile(specDir, pick(bg.src, locale, base)), fit: 'cover', localized: own(bg.src, locale) && locale !== base } });
  } else {
    fill = fillOf(spec, bg.type === 'solid' ? bg.color : bg, W, H);
  }
  return { fill, nodes };
}

// ---------------------------------------------------------------- main entry
export function boardPrefix(spec) { return `${spec.code}${spec.set}`; }

export function loadSpec(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  for (const k of ['code', 'set', 'canvas', 'locales', 'shots']) if (spec[k] == null) throw new Error(`spec.${k} is missing`);
  if (!CANVAS[spec.canvas]) throw new Error(`Unknown canvas: ${spec.canvas} (${Object.keys(CANVAS).join(', ')})`);
  if (spec.shots.length > 10) throw new Error(`App Store accepts at most 10 screenshots, the spec has ${spec.shots.length}`);
  if (spec.brand) {   // brand tokens: color roles, fonts, text styles, device shadow
    const bf = path.resolve(path.dirname(path.resolve(specPath)), spec.brand);
    if (!fs.existsSync(bf)) throw new Error(`spec.brand file not found: ${bf}`);
    spec._brand = brandForSpec(bf); spec._brandFile = bf;
  }
  const ids = new Set();
  for (const s of spec.shots) for (const L of s.layers ?? []) {
    if (!L.id) throw new Error(`Layer has no id (shot ${s.id}, type ${L.type})`);
    if (ids.has(`${s.id}/${L.id}`)) throw new Error(`Duplicate id: ${s.id}/${L.id}`);
    ids.add(`${s.id}/${L.id}`);
  }
  return { spec, specDir: path.dirname(path.resolve(specPath)) };
}

/** Board list for one locale. A panorama gives one wide board plus slices. */
export function resolveBoards(spec, specDir, locale) {
  const { w: W, h: H } = CANVAS[spec.canvas];
  const base = spec.baseLocale ?? spec.locales[0];
  const pre = boardPrefix(spec);
  if (spec.panorama) {
    const N = spec.shots.length, BW = W * N;
    const bg = resolveBackground(spec, specDir, spec.background, BW, H, locale, base);
    const nodes = [...bg.nodes];
    for (const L of spec.layers ?? []) nodes.push(resolveLayer(spec, specDir, L, locale, base, 0));
    spec.shots.forEach((s, i) => { for (const L of s.layers ?? []) nodes.push(resolveLayer(spec, specDir, L, locale, base, i * W, `@${s.id}`)); });
    return [{ name: `${pre}_${locale}_pano`, width: BW, height: H, fill: bg.fill, nodes,
      slices: spec.shots.map((s, i) => ({ shot: s.id, keyword: s.keyword, x: i * W, w: W })) }];
  }
  return spec.shots.map(s => {
    const bg = resolveBackground(spec, specDir, s.background ?? spec.background, W, H, locale, base);
    return { name: `${pre}_${locale}_${s.id}`, width: W, height: H, fill: bg.fill,
      nodes: [...bg.nodes, ...(s.layers ?? []).map(L => resolveLayer(spec, specDir, L, locale, base, 0))],
      slices: [{ shot: s.id, keyword: s.keyword, x: 0, w: W }] };
  });
}

/** Font list (the ones to load in Figma). */
/** All fonts in use (spec.fonts + brand fonts + text style fonts), per locale. */
export function fontList(spec, locale) {
  const keys = new Set([...Object.keys(spec.fonts ?? {}), ...Object.keys(spec._brand?.fonts ?? {})]);
  const list = [...keys].map(k => fontFor(spec, k, locale));
  for (const ts of Object.values(spec._brand?.textStyles ?? {})) list.push(ts.font);
  const seen = new Map();
  for (const f of list) seen.set(`${f.family}|${f.style}`, f);
  return [...seen.values()];
}
export function fontsOf(spec, locale) {
  return fontList(spec, locale).map(f => ({ family: f.family, style: f.style, weight: f.weight ?? 400 }));
}
