#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Importa un inventario de prendas (CSV) a tu cuenta de Supabase.
//
// Uso (desde la carpeta del proyecto, con tu .env configurado):
//
//   node scripts/importar-inventario.mjs ruta/al/inventario.csv            ← solo muestra el plan
//   node scripts/importar-inventario.mjs ruta/al/inventario.csv --aplicar  ← escribe en Supabase
//
// Pide tu correo y contraseña de la app: entra como TÚ, con la clave pública,
// así que Row Level Security aplica igual que en la app. Nunca uses aquí la
// clave service_role.
//
// El CSV es personal: guárdalo FUERA del repo o en la carpeta datos-privados/
// (ignorada por Git).
//
// Columnas esperadas:
//   nombre, tipo, capa, subtipo, clima, estilos, color, cantidad, acento, notas
//   · tipo:    pantalon | short | camisa | polo | playera | playera oversized |
//              sobrecamisa | sueter delgado | sueter grueso | sudadera |
//              chamarra | calzado | accesorio
//   · capa:    ligero | medio | abrigador (solo torso; vacío = según el tipo)
//   · subtipo: para accesorios: cadena | reloj | gorra | anillo
//   · clima:   sol | templado | frio          (templado = todo el año; "calor" = sol)
//   · estilos: separados por "|", p. ej. "Semiformal|Minimalista"
//   · color:   clave de la paleta de la app (negro, azul_marino, …) o vacío
//
// Es seguro volver a correrlo: no duplica prendas que ya existen con el mismo
// nombre, ni tipos, estilos o posiciones que ya existen.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// ─── Catálogo que usa el inventario ────────────────────────────────────────

/** Posiciones necesarias (se buscan por rol; se crean si faltan). */
const POSITIONS = {
  top: { name: 'Parte superior', sort_order: 10, max_items: 1 },
  mid: { name: 'Capa intermedia', sort_order: 15, max_items: 1 },
  outer: { name: 'Capa exterior', sort_order: 20, max_items: 1 },
  bottom: { name: 'Parte inferior', sort_order: 30, max_items: 1 },
  footwear: { name: 'Calzado', sort_order: 50, max_items: 1 },
  accessory: { name: 'Accesorios', sort_order: 60, max_items: 3 },
};

/** Tipos: posición, usos antes de lavar y abrigo por defecto. */
const TYPES = {
  'Playera': { role: 'top', wash: 1, warmth: 'light' },
  'Playera oversized': { role: 'top', wash: 1, warmth: 'light' },
  'Camisa': { role: 'top', wash: 2, warmth: 'light' },
  'Polo': { role: 'top', wash: 2, warmth: 'light' },
  'Sobrecamisa': { role: 'mid', wash: 3, warmth: 'medium' },
  'Suéter delgado': { role: 'mid', wash: 4, warmth: 'medium' },
  'Sudadera': { role: 'mid', wash: 3, warmth: 'medium' },
  'Suéter grueso': { role: 'outer', wash: 6, warmth: 'warm' },
  'Chamarra': { role: 'outer', wash: 10, warmth: 'warm' },
  'Jeans': { role: 'bottom', wash: 4, warmth: 'medium' },
  'Pantalón de vestir': { role: 'bottom', wash: 3, warmth: 'medium' },
  'Pantalón casual': { role: 'bottom', wash: 3, warmth: 'medium' },
  'Pants deportivos': { role: 'bottom', wash: 2, warmth: 'medium' },
  'Shorts': { role: 'bottom', wash: 2, warmth: 'light' },
  'Tenis': { role: 'footwear', wash: 0, warmth: 'medium' },
  'Zapatos de vestir': { role: 'footwear', wash: 0, warmth: 'medium' },
  'Botas': { role: 'footwear', wash: 0, warmth: 'warm' },
  'Sandalias': { role: 'footwear', wash: 0, warmth: 'light' },
  'Cadena': { role: 'accessory', wash: 0, warmth: 'medium' },
  'Reloj': { role: 'accessory', wash: 0, warmth: 'medium' },
  'Anillo': { role: 'accessory', wash: 0, warmth: 'medium' },
  'Gorra': { role: 'accessory', wash: 5, warmth: 'medium' },
  'Gorro': { role: 'accessory', wash: 5, warmth: 'warm' },
};

/** Estilos en el orden en que se muestran. */
const STYLES = ['Formal', 'Oficina', 'Semiformal', 'Minimalista', 'Rockero', 'Urbano', 'Vacacional', 'Senderismo', 'Running', 'Gym'];

/**
 * Pares de estilos que NO combinan (matriz nivel 1). Lo que no aparece aquí
 * combina. Recuerda: dos prendas combinan si ALGUNO de sus estilos combina,
 * así que las prendas con varios estilos siguen siendo flexibles.
 * Todo se puede ajustar después en la app (Reglas).
 */
const INCOMPATIBLE = [
  ...['Rockero', 'Urbano', 'Vacacional', 'Senderismo', 'Running', 'Gym'].flatMap((s) => [['Formal', s], ['Oficina', s]]),
  ['Semiformal', 'Senderismo'], ['Semiformal', 'Running'], ['Semiformal', 'Gym'],
  ['Minimalista', 'Running'], ['Minimalista', 'Gym'],
  ['Rockero', 'Running'], ['Rockero', 'Gym'],
  ['Vacacional', 'Running'], ['Vacacional', 'Gym'],
];

const CLIMATE = { sol: 'hot', calor: 'hot', templado: 'all', frio: 'cold', 'frío': 'cold' };
const WARMTH = { ligero: 'light', medio: 'medium', abrigador: 'warm' };
const COLORS = new Set(['negro', 'blanco', 'gris', 'plateado', 'gris_oscuro', 'beige', 'cafe', 'cafe_claro', 'caqui', 'azul_marino', 'mezclilla', 'verde_olivo', 'rojo', 'ladrillo', 'vino', 'rosa', 'lila', 'morado', 'azul', 'celeste', 'turquesa', 'menta', 'verde', 'verde_bandera', 'amarillo', 'mostaza', 'naranja', 'multicolor']);

// ─── Utilidades ────────────────────────────────────────────────────────────

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/** CSV sencillo con soporte de comillas dobles. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  const [header, ...data] = rows;
  const keys = header.map((h) => norm(h.replace(/^﻿/, '')));
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY del entorno o del .env. */
function loadEnv() {
  const env = { ...process.env };
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) fail('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ponlas en tu .env).');
  if (key.startsWith('sb_secret_') || key.includes('service_role')) fail('Esa es una clave SECRETA. Usa la clave pública (anon / publishable).');
  return { url, key };
}

/** Tipo del catálogo para una fila del CSV. */
function typeFor(row) {
  const name = norm(row.nombre);
  const notes = norm(row.notas ?? '');
  switch (norm(row.tipo)) {
    case 'pantalon':
      if (notes.includes('pants')) return 'Pants deportivos';
      if (name.startsWith('de vestir')) return 'Pantalón de vestir';
      if (name.includes('mezclilla')) return 'Jeans';
      return 'Pantalón casual';
    case 'short': return 'Shorts';
    case 'camisa': return 'Camisa';
    case 'polo': return 'Polo';
    case 'playera': return 'Playera';
    case 'playera oversized': return 'Playera oversized';
    case 'sobrecamisa': return 'Sobrecamisa';
    case 'sueter delgado': return 'Suéter delgado';
    case 'sueter grueso': return 'Suéter grueso';
    case 'sudadera': return 'Sudadera';
    case 'chamarra': return 'Chamarra';
    case 'calzado':
      if (name.startsWith('botas')) return 'Botas';
      if (name.includes('florsheim') || name.includes('monkstrap') || name.includes('monk strap')) return 'Zapatos de vestir';
      if (name.includes('brikenlefties') || name.includes('birken') || name.includes('sandalia')) return 'Sandalias';
      return 'Tenis';
    case 'accesorio': {
      const sub = norm(row.subtipo ?? '');
      if (sub === 'gorra') return name.startsWith('gorro') ? 'Gorro' : 'Gorra';
      if (sub === 'cadena') return 'Cadena';
      if (sub === 'reloj') return 'Reloj';
      if (sub === 'anillo') return 'Anillo';
      return null;
    }
    default:
      return null;
  }
}

// ─── Programa ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes('--aplicar');
const csvPath = args.find((a) => !a.startsWith('--'));
if (!csvPath) fail('Indica la ruta del CSV: node scripts/importar-inventario.mjs inventario.csv [--aplicar]');
if (!existsSync(csvPath)) fail(`No encuentro el archivo ${csvPath}`);

// 1. Leer y validar el CSV (antes de pedir credenciales).
const rows = parseCSV(readFileSync(csvPath, 'utf8'));
const problems = [];
const parsed = rows.map((row, i) => {
  const line = i + 2;
  const type = typeFor(row);
  if (!row.nombre) problems.push(`Línea ${line}: falta el nombre.`);
  if (!type) problems.push(`Línea ${line} (${row.nombre}): tipo "${row.tipo}" / subtipo "${row.subtipo}" no reconocido.`);
  const climate = CLIMATE[norm(row.clima || 'templado')];
  if (!climate) problems.push(`Línea ${line} (${row.nombre}): clima "${row.clima}" no reconocido.`);
  const warmth = row.capa ? WARMTH[norm(row.capa)] : type ? TYPES[type].warmth : undefined;
  if (!warmth) problems.push(`Línea ${line} (${row.nombre}): capa "${row.capa}" no reconocida.`);
  const styles = (row.estilos ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  const color = row.color ? norm(row.color).replace(/\s+/g, '_') : null;
  if (color && !COLORS.has(color)) problems.push(`Línea ${line} (${row.nombre}): color "${row.color}" no está en la paleta.`);
  const qty = Number.parseInt(row.cantidad || '1', 10) || 1;
  const notes = [row.notas, qty > 1 ? `Tengo ${qty}` : '', norm(row.acento ?? '') === 'si' ? 'Color de acento' : '']
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  return { name: row.nombre.trim(), type, climate, warmth, styles, color, notes: notes || null };
});
const seen = new Map();
for (const g of parsed) {
  const k = norm(g.name);
  if (seen.has(k)) problems.push(`"${g.name}" aparece dos veces en el CSV.`);
  seen.set(k, true);
}
if (problems.length) fail(`El CSV tiene problemas:\n  · ${problems.join('\n  · ')}`);
console.log(`✔ CSV válido: ${parsed.length} prendas.`);

// 2. Iniciar sesión como tú.
const { url, key } = loadEnv();
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const rl = createInterface({ input: stdin, output: stdout });
const email = process.env.GUARDARROPA_EMAIL || (await rl.question('Correo: '));
const password = process.env.GUARDARROPA_PASSWORD || (await rl.question('Contraseña (se verá en pantalla): '));
rl.close();
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
if (authError) fail(`No se pudo iniciar sesión: ${authError.message}`);
const uid = auth.user.id;
console.log(`✔ Sesión iniciada como ${auth.user.email}\n`);

async function load(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').is('deleted_at', null).range(from, from + 999);
    if (error) fail(`No pude leer ${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function write(table, rows, onConflict) {
  if (!apply || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200), onConflict ? { onConflict } : undefined);
    if (error) fail(`Error al escribir en ${table}: ${error.message}`);
  }
}

const now = new Date().toISOString();
const base = () => ({ user_id: uid, created_at: now, updated_at: now, deleted_at: null });

// 3. Posiciones.
const positions = await load('positions');
const positionByRole = {};
const newPositions = [];
for (const [role, def] of Object.entries(POSITIONS)) {
  let p = positions.find((x) => x.role === role);
  if (!p) {
    p = { ...base(), id: randomUUID(), name: def.name, role, max_items: def.max_items, sort_order: def.sort_order };
    newPositions.push(p);
  }
  positionByRole[role] = p;
}

// 4. Tipos (se reutilizan por nombre; si existen en otra posición, se mueven).
const types = await load('garment_types');
const typeByName = {};
const newTypes = [];
const movedTypes = [];
const neededTypes = [...new Set(parsed.map((g) => g.type))];
for (const name of neededTypes) {
  const def = TYPES[name];
  const position = positionByRole[def.role];
  let t = types.find((x) => norm(x.name) === norm(name));
  if (!t) {
    t = { ...base(), id: randomUUID(), name, position_id: position.id, default_wash_uses: def.wash, default_warmth: def.warmth, sort_order: Object.keys(TYPES).indexOf(name) * 10 };
    newTypes.push(t);
  } else if (t.position_id !== position.id) {
    t = { ...t, position_id: position.id };
    movedTypes.push(t);
  }
  typeByName[name] = t;
}

// 5. Estilos.
const styles = await load('styles');
const styleByName = {};
const newStyles = [];
const csvStyles = [...new Set(parsed.flatMap((g) => g.styles))];
const unknown = csvStyles.filter((s) => !STYLES.some((x) => norm(x) === norm(s)));
for (const [i, name] of [...STYLES, ...unknown].entries()) {
  let s = styles.find((x) => norm(x.name) === norm(name));
  if (!s) {
    if (!csvStyles.some((x) => norm(x) === norm(name))) continue; // no lo usa nadie
    s = { ...base(), id: randomUUID(), name, sort_order: (i + 1) * 10 };
    newStyles.push(s);
  }
  styleByName[norm(name)] = s;
}

// 6. Matriz de estilos (solo pares aún sin regla).
const compat = await load('style_compat');
const newCompat = [];
for (const [a, b] of INCOMPATIBLE) {
  const sa = styleByName[norm(a)];
  const sb = styleByName[norm(b)];
  if (!sa || !sb) continue;
  const [style_a, style_b] = [sa.id, sb.id].sort();
  if (compat.some((c) => c.style_a === style_a && c.style_b === style_b)) continue;
  newCompat.push({ ...base(), style_a, style_b, compatible: false });
}

// 7. Prendas (se omiten las que ya existen con el mismo nombre).
const garments = await load('garments');
const existing = new Set(garments.map((g) => norm(g.name)));
const skipped = [];
const newGarments = [];
for (const g of parsed) {
  if (existing.has(norm(g.name))) {
    skipped.push(g.name);
    continue;
  }
  const type = typeByName[g.type];
  newGarments.push({
    ...base(),
    id: randomUUID(),
    name: g.name,
    type_id: type.id,
    style_ids: g.styles.map((s) => styleByName[norm(s)].id),
    color: g.color,
    warmth: g.warmth,
    climate: g.climate,
    wash_after_uses: type.default_wash_uses,
    uses_since_wash: 0,
    status: 'available',
    notes: g.notes,
    photo_path: null,
    stats_reset_at: null,
    is_sample: false,
  });
}

// 8. Plan.
const list = (xs, f = (x) => x.name) => (xs.length ? xs.map(f).join(', ') : '—');
console.log('Plan:');
console.log(`  Posiciones nuevas: ${list(newPositions)}`);
console.log(`  Tipos nuevos:      ${list(newTypes)}`);
console.log(`  Tipos que cambian de posición: ${list(movedTypes, (t) => `${t.name} → ${Object.entries(positionByRole).find(([, p]) => p.id === t.position_id)?.[1].name}`)}`);
console.log(`  Estilos nuevos:    ${list(newStyles)}`);
console.log(`  Reglas "no combinan" nuevas: ${newCompat.length}`);
console.log(`  Prendas nuevas:    ${newGarments.length}`);
if (skipped.length) console.log(`  Ya existían (se omiten): ${skipped.length} — ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}`);
const leftover = styles.filter((s) => !Object.values(styleByName).some((x) => x.id === s.id));
if (leftover.length) console.log(`  Estilos que ya tenías y el inventario no usa (bórralos en la app si quieres): ${list(leftover)}`);

if (!apply) {
  console.log('\nNo se escribió nada. Revisa el plan y vuelve a correrlo con --aplicar.');
  process.exit(0);
}

// 9. Escribir, padres primero.
await write('positions', newPositions);
await write('garment_types', [...newTypes, ...movedTypes]);
await write('styles', newStyles);
await write('style_compat', newCompat, 'user_id,style_a,style_b');
await write('garments', newGarments);
console.log('\n✔ Listo. Abre la app: se sincroniza sola en unos segundos.');
process.exit(0);
