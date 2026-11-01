#!/usr/bin/env node
// tokens.mjs : an app's brand tokens (W3C DTCG 2025.10 format), color palette, contrast and export to Figma.
//
//   node tokens.mjs init  --code LMN --app Lumen --seed "#FF5A36" [--theme dark|light]
//                         [--display "Inter:Extra Bold:800"] [--body "Inter:Medium:500"] [-o _brand/LMN.tokens.json]
//   node tokens.mjs check _brand/LMN.tokens.json            # contrast of role pairs (WCAG 2.1 + APCA)
//   node tokens.mjs figma _brand/LMN.tokens.json [--update] # use_figma JS: Variables + text styles + effect style
//   node tokens.mjs read  _brand/LMN.tokens.json            # use_figma JS: read the values back from Figma
//   node tokens.mjs merge _brand/LMN.tokens.json <read.result.json>   # write color changes made in Figma into the tokens
//   node tokens.mjs export _brand/LMN.tokens.json            # Style Dictionary: CSS variables + Swift + JSON (for developers)
//
// Palette: color.js HCT space (Material's tone logic); a 0-100 tone ramp from one seed color.
// Contrast: color.js (WCAG 2.1 thresholds, APCA for information).
import fs from 'node:fs';
import path from 'node:path';
import Color from './vendor/color.js';

export const TONES = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 98, 100];
const FIGMA_EXT = 'store-screenshot-agent.figma';

// ---------------------------------------------------------------- color helpers
const hex6 = c => c.to('srgb').toString({ format: 'hex', collapse: false });
export function toneHex(hue, chroma, t) {
  return hex6(new Color('hct', [hue, chroma, t]).toGamut({ space: 'srgb', method: 'hct.c' }));
}
export function dtcgColor(hex) {
  const c = new Color(hex).to('srgb');
  return { colorSpace: 'srgb', components: c.coords.map(v => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000), hex: hex.toLowerCase() };
}
export const wcag = (a, b) => new Color(a).contrast(new Color(b), 'WCAG21');
export const apca = (text, bg) => new Color(bg).contrast(new Color(text), 'APCA');   // Lc, signed

// ---------------------------------------------------------------- DTCG reading (aliases + $type inheritance)
export function loadTokens(file) {
  const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
  const flat = {};
  (function walk(node, p, type) {
    const t = node.$type ?? type;
    if ('$value' in node) { flat[p.join('.')] = { type: t, value: node.$value, ext: node.$extensions ?? {} }; return; }
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$') && v && typeof v === 'object') walk(v, [...p, k], t);
  })(tree, [], undefined);
  const resolve = (v, seen = new Set()) => {
    if (typeof v === 'string' && /^\{[^}]+\}$/.test(v)) {
      const ref = v.slice(1, -1);
      if (seen.has(ref)) throw new Error(`Circular token reference: ${ref}`);
      if (!flat[ref]) throw new Error(`Token not found: ${ref}`);
      seen.add(ref); return resolve(flat[ref].value, seen);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, new Set(seen))]));
    return v;
  };
  for (const t of Object.values(flat)) { t.raw = t.value; t.value = resolve(t.value); }
  return { tree, flat };
}
export const colorHex = v => typeof v === 'string' ? v : v.hex ?? hex6(new Color(v.colorSpace === 'srgb' ? 'srgb' : v.colorSpace, v.components));
const px = d => typeof d === 'number' ? d : d.unit === 'px' ? d.value : d.value * 16;
const figmaVarName = p => p.replace(/^color\./, '').replaceAll('.', '/');

/** tokens -> values added to the spec (used by layout.mjs) */
export function brandForSpec(tokensFile) {
  const { tree, flat } = loadTokens(tokensFile);
  const code = tree.$extensions?.[FIGMA_EXT]?.code ?? '';
  const colors = {}, colorTokens = {}, fonts = {}, textStyles = {};
  for (const [p, t] of Object.entries(flat)) {
    if (t.type === 'color') {
      const hex = colorHex(t.value);
      if (p.startsWith('color.role.')) { const k = p.slice(11); colors[k] = hex; colorTokens[k] = figmaVarName(p); }
      colorTokens[`{${p}}`] = figmaVarName(p); colors[`{${p}}`] = hex;
    }
    if (t.type === 'typography') {
      const v = t.value, key = p.split('.').pop(), size = px(v.fontSize);
      const fam = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      const style = t.ext?.[FIGMA_EXT]?.fontStyle ?? 'Regular';
      textStyles[key] = { font: { family: fam, style, weight: v.fontWeight }, size, lineHeight: v.lineHeight,
        letterSpacing: Math.round(px(v.letterSpacing ?? 0) / size * 10000) / 10000, figmaStyle: `${code}/${key}` };
      fonts[key] ??= { family: fam, style, weight: v.fontWeight };
    }
  }
  if (textStyles.headline) fonts.display ??= textStyles.headline.font;
  if (textStyles.sub) fonts.body ??= textStyles.sub.font;
  const shadow = flat['shadow.device']?.value;
  const shColor = shadow && (colorHex(shadow.color) + (shadow.color.alpha != null && shadow.color.alpha < 1 ? Math.round(shadow.color.alpha * 255).toString(16).padStart(2, '0') : ''));
  return { code, colors, colorTokens, fonts, textStyles, collection: `${code} Brand`,
    deviceShadow: shadow ? { x: px(shadow.offsetX), y: px(shadow.offsetY), blur: px(shadow.blur), spread: px(shadow.spread ?? 0), color: shColor } : null };
}

// ---------------------------------------------------------------- init: brand from a seed color
function rolesFor(theme, P, N) {
  const pick = (cands, bg, min) => cands.find(t => wcag(P[t], bg) >= min) ?? cands[cands.length - 1];
  if (theme === 'light') {
    const bg = N[98];
    const a = pick([40, 50, 30, 20], bg, 3);
    return { bg: 'neutral.98', surface: 'neutral.95', ink: 'neutral.10', muted: 'neutral.40', accent: `primary.${a}`,
      onAccent: wcag(P[a], N[100]) >= wcag(P[a], N[0]) ? 'neutral.100' : 'neutral.0' };
  }
  const bg = N[5];
  const a = pick([60, 70, 50, 80], bg, 3);
  return { bg: 'neutral.5', surface: 'neutral.15', ink: 'neutral.100', muted: 'neutral.80', accent: `primary.${a}`,
    onAccent: wcag(P[a], N[100]) >= wcag(P[a], N[0]) ? 'neutral.100' : 'neutral.0' };
}
const parseFont = (s, d) => { const [family, style, weight] = (s ?? d).split(':'); return { family, style, weight: Number(weight) }; };

function init(o) {
  if (!o.code || !o.seed) throw new Error('--code and --seed are required');
  const seed = new Color(o.seed).to('hct'), [h, c] = seed.coords;
  const P = Object.fromEntries(TONES.map(t => [t, toneHex(h, c, t)]));
  const N = Object.fromEntries(TONES.map(t => [t, toneHex(h, Math.min(c, 6), t)]));
  const theme = o.theme ?? 'dark', roles = rolesFor(theme, P, N);
  const display = parseFont(o.display, 'Inter:Extra Bold:800'), body = parseFont(o.body, 'Inter:Medium:500');
  const ramp = pal => Object.fromEntries(TONES.map(t => [t, { $value: dtcgColor(pal[t]) }]));
  const typo = (f, size, lh, lsEm) => ({ $value: { fontFamily: f.family, fontWeight: f.weight, fontSize: { value: size, unit: 'px' }, lineHeight: lh,
    letterSpacing: { value: Math.round(lsEm * size * 100) / 100, unit: 'px' } }, $extensions: { [FIGMA_EXT]: { fontStyle: f.style } } });
  const tree = {
    $description: `${o.app ?? o.code} brand tokens. Format: W3C DTCG 2025.10. Generated by: tokens.mjs init (seed ${o.seed}, theme ${theme}).`,
    $extensions: { [FIGMA_EXT]: { code: o.code, app: o.app ?? o.code, seed: o.seed, theme } },
    color: {
      $type: 'color',
      seed: { $value: dtcgColor(hex6(new Color(o.seed))) },
      palette: { primary: ramp(P), neutral: ramp(N) },
      role: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { $value: `{color.palette.${v}}` }])),
    },
    typography: {
      $type: 'typography',
      headline: typo(display, 132, 1.02, -0.025),
      sub: typo(body, 54, 1.25, 0),
      badge: typo(body, 46, 1.2, 0),
    },
    space: { $type: 'dimension', margin: { $value: { value: 110, unit: 'px' } }, gap: { $value: { value: 40, unit: 'px' } } },
    radius: { $type: 'dimension', card: { $value: { value: 48, unit: 'px' } }, badge: { $value: { value: 999, unit: 'px' } } },
    shadow: { $type: 'shadow', device: { $value: { color: dtcgColor('#000000'), offsetX: { value: 0, unit: 'px' }, offsetY: { value: 40, unit: 'px' },
      blur: { value: 120, unit: 'px' }, spread: { value: 0, unit: 'px' } } } },
  };
  tree.shadow.device.$value.color.alpha = 0.35;
  const out = o.o ?? `_brand/${o.code}.tokens.json`;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(tree, null, 2));
  console.log(`-> ${out}  (theme ${theme}, accent ${roles.accent})`);
  return out;
}

// ---------------------------------------------------------------- check
const PAIRS = [['ink', 'bg', 4.5], ['muted', 'bg', 4.5], ['accent', 'bg', 3], ['ink', 'surface', 4.5], ['onAccent', 'accent', 4.5]];
export function check(file, quiet = false) {
  const b = brandForSpec(file); let bad = 0; const rows = [];
  for (const [fg, bg, min] of PAIRS) {
    if (!b.colors[fg] || !b.colors[bg]) continue;
    const r = wcag(b.colors[fg], b.colors[bg]), lc = apca(b.colors[fg], b.colors[bg]);
    const ok = r >= min; if (!ok) bad++;
    rows.push(`${ok ? 'OK   ' : 'ERROR'} ${fg.padEnd(9)} / ${bg.padEnd(8)} ${b.colors[fg]} on ${b.colors[bg]}  WCAG ${r.toFixed(2)} (threshold ${min})  APCA Lc ${lc.toFixed(1)}`);
  }
  if (!quiet) { rows.forEach(r => console.log(r)); console.log(bad ? `${bad} pairs below the threshold` : 'all role pairs pass the threshold'); }
  return bad;
}

// ---------------------------------------------------------------- figma: Variables + text styles + effect style
const FIGMA_BRAND = String.raw`
const W2S = {100:'Thin',200:'Extra Light',300:'Light',400:'Regular',500:'Medium',600:'Semi Bold',700:'Bold',800:'Extra Bold',900:'Black'};
const created = [], updated = [], conflicts = [], warnings = [];
const cols = await figma.variables.getLocalVariableCollectionsAsync();
let col = cols.find(c => c.name === P.collection);
if (!col) { col = figma.variables.createVariableCollection(P.collection); col.renameMode(col.modes[0].modeId, 'Default'); created.push('collection:' + P.collection); }
const modeId = col.modes[0].modeId;
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
const all = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(v => v.variableCollectionId === col.id);
const byName = Object.fromEntries(all.map(v => [v.name, v]));
const near = (a, b) => ['r', 'g', 'b', 'a'].every(k => Math.abs((a[k] ?? 1) - (b[k] ?? 1)) < 0.002);
for (const c of P.colors) {
  let v = byName[c.name];
  const target = c.alias ? figma.variables.createVariableAlias(byName[c.alias]) : c.rgba;
  if (!v) {
    v = figma.variables.createVariable(c.name, col, 'COLOR');
    v.scopes = c.scopes; v.setValueForMode(modeId, target); byName[c.name] = v; created.push(c.name); continue;
  }
  const cur = v.valuesByMode[modeId];
  const same = c.alias ? (cur && cur.type === 'VARIABLE_ALIAS' && cur.id === byName[c.alias].id) : (cur && !cur.type && near(cur, c.rgba));
  if (same) continue;
  if (!P.update) { conflicts.push({ name: c.name, figma: cur && cur.type === 'VARIABLE_ALIAS' ? 'alias' : cur, tokens: c.alias || c.hex }); continue; }
  v.setValueForMode(modeId, target); updated.push(c.name);
}
const styles = await figma.getLocalTextStylesAsync();
const textStyles = [];
for (const t of P.text) {
  let font = { family: t.family, style: t.style };
  try { await figma.loadFontAsync(font); } catch (e) { font = { family: 'Inter', style: W2S[t.weight] || 'Regular' }; await figma.loadFontAsync(font); warnings.push('Font not available in the Figma account: ' + t.family + ' ' + t.style + ' -> Inter'); }
  let s = styles.find(x => x.name === t.name);
  if (s && !P.update) { textStyles.push({ name: t.name, id: s.id, status: 'exists, left untouched' }); continue; }
  if (!s) { s = figma.createTextStyle(); s.name = t.name; created.push(t.name); } else { await figma.loadFontAsync(s.fontName); updated.push(t.name); }
  s.fontName = font; s.fontSize = t.size;
  s.lineHeight = { value: t.lineHeight * 100, unit: 'PERCENT' };
  s.letterSpacing = { value: t.letterSpacing * 100, unit: 'PERCENT' };
  textStyles.push({ name: t.name, id: s.id });
}
if (P.shadow) {
  const es = (await figma.getLocalEffectStylesAsync()).find(x => x.name === P.shadow.name);
  if (!es || P.update) {
    const e = es || figma.createEffectStyle(); e.name = P.shadow.name;
    e.effects = [{ type: 'DROP_SHADOW', color: P.shadow.color, offset: { x: P.shadow.x, y: P.shadow.y }, radius: P.shadow.blur, spread: 0, visible: true, blendMode: 'NORMAL' }];
    (es ? updated : created).push(P.shadow.name);
  }
}
return { collection: col.id, created, updated, conflicts, textStyles, warnings,
  next: conflicts.length ? 'Figma and tokens differ: the designer may have changed them in Figma. Either take Figma as the source with tokens.mjs read/merge, or use --update with the user\'s approval.' : 'done' };
`;

const FIGMA_READ = String.raw`
const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === P.collection);
if (!col) return { error: 'NO_COLLECTION', collection: P.collection };
const modeId = col.modes[0].modeId;
const vars = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(v => v.variableCollectionId === col.id);
const idName = Object.fromEntries(vars.map(v => [v.id, v.name]));
const out = {};
for (const v of vars) { const x = v.valuesByMode[modeId]; out[v.name] = x && x.type === 'VARIABLE_ALIAS' ? { alias: idName[x.id] } : x; }
const ts = (await figma.getLocalTextStylesAsync()).filter(s => s.name.startsWith(P.code + '/'))
  .map(s => ({ name: s.name, family: s.fontName.family, style: s.fontName.style, size: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing }));
return { collection: P.collection, colors: out, textStyles: ts };
`;

function figmaPayload(file) {
  const { tree, flat } = loadTokens(file);
  const code = tree.$extensions?.[FIGMA_EXT]?.code; if (!code) throw new Error('tokens $extensions["store-screenshot-agent.figma"].code is missing');
  const colors = [];
  for (const [p, t] of Object.entries(flat)) {
    if (t.type !== 'color' || p === 'color.seed') continue;
    const isAlias = typeof t.raw === 'string' && t.raw.startsWith('{');
    const c = new Color(colorHex(t.value)).to('srgb');
    colors.push({ name: figmaVarName(p), hex: colorHex(t.value), alias: isAlias ? figmaVarName(t.raw.slice(1, -1)) : null,
      rgba: { r: +c.coords[0].toFixed(4), g: +c.coords[1].toFixed(4), b: +c.coords[2].toFixed(4), a: t.value.alpha ?? 1 },
      scopes: p.startsWith('color.role.') ? ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'] : [] });
  }
  colors.sort((a, b) => (a.alias ? 1 : 0) - (b.alias ? 1 : 0));   // primitives first, then aliases
  const b = brandForSpec(file);
  const text = Object.entries(b.textStyles).map(([, s]) => ({ name: s.figmaStyle, family: s.font.family, style: s.font.style, weight: s.font.weight,
    size: s.size, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing }));
  const sh = b.deviceShadow && (() => { const c = new Color(b.deviceShadow.color).to('srgb'); const al = flat['shadow.device'].value.color.alpha ?? 1;
    return { name: `${code}/device-shadow`, x: b.deviceShadow.x, y: b.deviceShadow.y, blur: b.deviceShadow.blur, color: { r: c.coords[0], g: c.coords[1], b: c.coords[2], a: al } }; })();
  return { code, collection: `${code} Brand`, colors, text, shadow: sh };
}

function merge(file, resultFile) {
  const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
  let res = JSON.parse(fs.readFileSync(resultFile, 'utf8')); if (!res.colors) res = Object.values(res).find(v => v && v.colors) ?? res;
  const changes = [];
  for (const [name, val] of Object.entries(res.colors ?? {})) {
    const p = ['color', ...name.split('/')]; let node = tree; for (const k of p) node = node?.[k];
    if (!node || !('$value' in node)) { changes.push(`skipped (not in tokens): ${name}`); continue; }
    if (val.alias) { const ref = `{color.${val.alias.replaceAll('/', '.')}}`; if (node.$value !== ref) { changes.push(`${name}: ${JSON.stringify(node.$value)} -> ${ref}`); node.$value = ref; } continue; }
    const hex = hex6(new Color('srgb', [val.r, val.g, val.b]));
    const cur = typeof node.$value === 'string' ? node.$value : node.$value.hex;
    if (cur?.toLowerCase() !== hex) { changes.push(`${name}: ${cur} -> ${hex}`); node.$value = dtcgColor(hex); if ((val.a ?? 1) < 1) node.$value.alpha = val.a; }
  }
  fs.writeFileSync(file, JSON.stringify(tree, null, 2));
  console.log(changes.length ? changes.join('\n') : 'no changes');
}

async function exportSD(file) {
  let SD;
  try { SD = (await import('style-dictionary')).default; }
  catch {
    const { createRequire } = await import('node:module');
    const dirs = [process.env.SS_DEPS, path.join(process.env.HOME ?? '', '.cache/store-screenshots')].filter(Boolean);
    for (const d of dirs) { try { SD = createRequire(path.join(d, 'noop.js'))('style-dictionary'); SD = SD.default ?? SD; break; } catch {} }
    if (!SD) throw new Error('style-dictionary is not installed: bash setup.sh');
  }
  const { tree } = loadTokens(file), code = tree.$extensions?.[FIGMA_EXT]?.code ?? 'Brand';
  const outDir = path.join(path.dirname(path.resolve(file)), 'dist') + '/';
  const sd = new SD({ source: [path.resolve(file)], usesDtcg: true, log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: {
      css: { transformGroup: 'css', buildPath: outDir, files: [{ destination: `${code}.css`, format: 'css/variables' }] },
      ios: { transformGroup: 'ios-swift', buildPath: outDir, files: [{ destination: `${code}Tokens.swift`, format: 'ios-swift/enum.swift', options: { className: `${code}Tokens` }, filter: t => t.$type === 'color' || t.type === 'color' }] },
      json: { transformGroup: 'js', buildPath: outDir, files: [{ destination: `${code}.flat.json`, format: 'json/flat' }] },
    } });
  await sd.buildAllPlatforms();
  console.log(`-> ${outDir} (${code}.css, ${code}Tokens.swift, ${code}.flat.json)`);
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tokens.mjs')) {
  const argv = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o') { o.o = argv[++i]; continue; }
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; if (v == null || v.startsWith('-')) o[k] = true; else { o[k] = v; i++; } continue; }
    pos.push(argv[i]);
  }
  const [cmd, file, extra] = pos;
  const writeJs = (name, body, P) => {
    const f = path.join(path.dirname(path.resolve(file)), 'figma', `${name}.js`);   // _brand/figma/
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `// auto-generated: tokens.mjs ${cmd}\nconst P = ${JSON.stringify(P)};\n${body}`);
    console.log(`${path.relative(process.cwd(), f)}  -> pass to the use_figma 'code' field`);
  };
  try {
    if (cmd === 'init') { const out = init(o); check(out); }
    else if (cmd === 'check') process.exit(check(file) ? 2 : 0);
    else if (cmd === 'figma') { const P = { ...figmaPayload(file), update: !!o.update }; writeJs(`brand_${P.code}`, FIGMA_BRAND, P); }
    else if (cmd === 'read') { const P = figmaPayload(file); writeJs(`brand_read_${P.code}`, FIGMA_READ, { collection: P.collection, code: P.code }); }
    else if (cmd === 'merge') { merge(file, extra); check(file); }
    else if (cmd === 'export') await exportSD(file);
    else { console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(1); }
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
}
