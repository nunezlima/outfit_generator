#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Carga tus eventos, ocasiones y perfumes (JSON) a tu cuenta de Supabase.
//
// Uso (desde la carpeta del proyecto, con tu .env configurado):
//
//   node scripts/importar-eventos.mjs ruta/al/eventos.json            ← solo muestra el plan
//   node scripts/importar-eventos.mjs ruta/al/eventos.json --aplicar  ← escribe en Supabase
//
// Igual que importar-inventario.mjs: entra como TÚ con la clave pública (RLS
// aplica) y el JSON es personal: guárdalo FUERA del repo o en datos-privados/.
//
// Formato (ver scripts/eventos-ejemplo.json):
//   {
//     "renombrarEstilos": { "Running": "Correr" },          ← opcional
//     "perfumes": [ { "nombre": "…", "notas": "…" } ],       ← opcional (notas)
//     "eventos": [
//       { "nombre": "Pulcro", "ocasiones": [
//         { "nombre": "Oficina", "estilos": ["Formal", "Semiformal"],
//           "calor": ["D&G Pour Homme"], "templado": ["Prada L'Homme"], "frio": ["Prada Amber"] }
//       ] }
//     ]
//   }
//   · En cada clima, el primer perfume es el principal; los demás, secundarios.
//   · "todos": [...] en una ocasión = la misma lista en los tres climas.
//   · Los perfumes que aparecen en las listas se crean si no existen.
//   · Los estilos deben existir (después de renombrar).
//
// Es seguro volver a correrlo: busca por nombre (sin importar mayúsculas ni
// acentos) y actualiza en lugar de duplicar. Lo que ya tienes en la app y no
// está en el JSON no se toca.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").trim().toLowerCase();

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
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

// ─── 1. Leer y validar el JSON (antes de pedir credenciales) ───────────────

const args = process.argv.slice(2);
const apply = args.includes('--aplicar');
const jsonPath = args.find((a) => !a.startsWith('--'));
if (!jsonPath) fail('Indica la ruta del JSON: node scripts/importar-eventos.mjs eventos.json [--aplicar]');
if (!existsSync(jsonPath)) fail(`No encuentro el archivo ${jsonPath}`);

let data;
try {
  data = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (e) {
  fail(`El JSON no es válido: ${e.message}`);
}

const problems = [];
const renames = Object.entries(data.renombrarEstilos ?? {});
const perfumeNotes = new Map();
const perfumeDisplay = new Map(); // norm → nombre como lo escribiste (la primera vez)
const remember = (name) => {
  if (typeof name !== 'string' || !name.trim()) return null;
  const k = norm(name);
  if (!perfumeDisplay.has(k)) perfumeDisplay.set(k, name.trim());
  return k;
};
for (const p of data.perfumes ?? []) {
  const k = remember(p?.nombre);
  if (!k) problems.push('Hay un perfume sin "nombre" en "perfumes".');
  else if (p.notas) perfumeNotes.set(k, String(p.notas).trim());
}

if (!Array.isArray(data.eventos) || data.eventos.length === 0) problems.push('Falta la lista "eventos".');
const events = (data.eventos ?? []).map((e, i) => {
  if (!e?.nombre) problems.push(`El evento #${i + 1} no tiene "nombre".`);
  if (!Array.isArray(e?.ocasiones) || e.ocasiones.length === 0) problems.push(`El evento "${e?.nombre}" no tiene "ocasiones".`);
  const seen = new Set();
  const occasions = (e?.ocasiones ?? []).map((o, j) => {
    const where = `${e?.nombre} → ${o?.nombre ?? `ocasión #${j + 1}`}`;
    if (!o?.nombre) problems.push(`${where}: falta "nombre".`);
    else if (seen.has(norm(o.nombre))) problems.push(`${where}: nombre repetido en el mismo evento.`);
    seen.add(norm(o?.nombre ?? ''));
    const list = (key) => {
      const v = o?.[key] ?? o?.todos ?? [];
      if (!Array.isArray(v)) {
        problems.push(`${where}: "${key}" debe ser una lista.`);
        return [];
      }
      return [...new Set(v.map(remember).filter(Boolean))];
    };
    return {
      name: String(o?.nombre ?? '').trim(),
      styles: (o?.estilos ?? []).map((s) => String(s).trim()),
      hot: list('calor'),
      mild: list('templado'),
      cold: list(o?.frio === undefined && o?.['frío'] !== undefined ? 'frío' : 'frio'),
    };
  });
  return { name: String(e?.nombre ?? '').trim(), occasions };
});
const dupEvents = events.map((e) => norm(e.name)).filter((n, i, a) => a.indexOf(n) !== i);
if (dupEvents.length) problems.push(`Eventos repetidos: ${[...new Set(dupEvents)].join(', ')}`);
if (problems.length) fail(`El JSON tiene problemas:\n  · ${problems.join('\n  · ')}`);
console.log(`✔ JSON válido: ${events.length} eventos, ${events.reduce((n, e) => n + e.occasions.length, 0)} ocasiones, ${perfumeDisplay.size} perfumes.`);

// ─── 2. Iniciar sesión como tú ─────────────────────────────────────────────

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
    const { data: rows, error } = await supabase.from(table).select('*').is('deleted_at', null).range(from, from + 999);
    if (error) fail(`No pude leer ${table}: ${error.message}${/does not exist|schema cache/i.test(error.message) ? ' (¿ya se aplicó la migración de eventos y perfumes?)' : ''}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function write(table, rows) {
  if (!apply || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200));
    if (error) fail(`Error al escribir en ${table}: ${error.message}`);
  }
}

const now = new Date().toISOString();
const base = () => ({ user_id: uid, created_at: now, updated_at: now, deleted_at: null });
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ─── 3. Estilos: renombrar y resolver ──────────────────────────────────────

const styles = await load('styles');
const renamed = [];
const notes = [];
for (const [from, to] of renames) {
  const s = styles.find((x) => norm(x.name) === norm(from));
  const exists = styles.find((x) => norm(x.name) === norm(to));
  if (!s) {
    if (!exists) notes.push(`No existe el estilo "${from}" para renombrarlo a "${to}".`);
    continue;
  }
  if (exists && exists.id !== s.id) {
    notes.push(`Ya existen "${from}" y "${to}": no se renombra (fusiónalos en la app si quieres).`);
    continue;
  }
  s.name = to;
  renamed.push(s);
}
const styleId = (name) => styles.find((x) => norm(x.name) === norm(name))?.id;
const missingStyles = new Set();
for (const e of events) for (const o of e.occasions) for (const s of o.styles) if (!styleId(s)) missingStyles.add(s);
if (missingStyles.size) fail(`Estos estilos no existen en tu app: ${[...missingStyles].join(', ')}.\n  Créalos en Ajustes → Categorías, corrige el nombre, o usa "renombrarEstilos".`);

// ─── 4. Perfumes ───────────────────────────────────────────────────────────

const perfumes = await load('perfumes');
const perfumeByNorm = new Map(perfumes.map((p) => [norm(p.name), p]));
const newPerfumes = [];
const updatedPerfumes = [];
for (const [k, name] of perfumeDisplay) {
  const existing = perfumeByNorm.get(k);
  const note = perfumeNotes.get(k) ?? null;
  if (!existing) {
    const p = { ...base(), id: randomUUID(), name, notes: note, status: 'available' };
    newPerfumes.push(p);
    perfumeByNorm.set(k, p);
  } else if (note && existing.notes !== note) {
    updatedPerfumes.push({ ...existing, notes: note });
  }
}
const pid = (k) => perfumeByNorm.get(k).id;

// ─── 5. Eventos y ocasiones ────────────────────────────────────────────────

const dbEvents = await load('outfit_events');
const dbOccasions = await load('occasions');
const eventRows = [];
const occasionRows = [];
const plan = [];
let occOrder = 0;
for (const [i, e] of events.entries()) {
  const sort_order = (i + 1) * 10;
  let ev = dbEvents.find((x) => norm(x.name) === norm(e.name));
  if (!ev) {
    ev = { ...base(), id: randomUUID(), name: e.name, sort_order };
    eventRows.push(ev);
    plan.push(`+ Evento ${e.name}`);
  } else if (ev.sort_order !== sort_order || ev.name !== e.name) {
    eventRows.push({ ...ev, name: e.name, sort_order });
  }
  for (const o of e.occasions) {
    occOrder += 10;
    const row = {
      event_id: ev.id,
      name: o.name,
      style_ids: o.styles.map(styleId),
      perfumes_hot: o.hot.map(pid),
      perfumes_mild: o.mild.map(pid),
      perfumes_cold: o.cold.map(pid),
      sort_order: occOrder,
    };
    const existing = dbOccasions.find((x) => x.event_id === ev.id && norm(x.name) === norm(o.name));
    const label = `${e.name} → ${o.name}`;
    const names = (ks) => (ks.length ? ks.map((k) => perfumeDisplay.get(k)).join(', ') : '—');
    const detail = `      estilos: ${o.styles.join(', ') || 'cualquiera'}\n      calor: ${names(o.hot)}\n      templado: ${names(o.mild)}\n      frío: ${names(o.cold)}`;
    if (!existing) {
      occasionRows.push({ ...base(), id: randomUUID(), ...row });
      plan.push(`  + Ocasión ${label}\n${detail}`);
    } else {
      const changed =
        existing.sort_order !== row.sort_order ||
        existing.name !== row.name ||
        !sameList(existing.style_ids, row.style_ids) ||
        !sameList(existing.perfumes_hot, row.perfumes_hot) ||
        !sameList(existing.perfumes_mild, row.perfumes_mild) ||
        !sameList(existing.perfumes_cold, row.perfumes_cold);
      if (changed) {
        occasionRows.push({ ...existing, ...row });
        plan.push(`  ~ Ocasión ${label} (se actualiza)\n${detail}`);
      } else plan.push(`  = Ocasión ${label} (sin cambios)`);
    }
  }
}

// ─── 6. Plan ───────────────────────────────────────────────────────────────

console.log('Plan:');
console.log(`  Estilos renombrados: ${renamed.length ? renamed.map((s) => s.name).join(', ') : '—'}`);
console.log(`  Perfumes nuevos (${newPerfumes.length}): ${newPerfumes.map((p) => p.name).join(', ') || '—'}`);
if (updatedPerfumes.length) console.log(`  Perfumes con notas nuevas: ${updatedPerfumes.map((p) => p.name).join(', ')}`);
console.log(plan.map((l) => `  ${l}`).join('\n'));
for (const n of notes) console.log(`  ⚠ ${n}`);
const leftoverEvents = dbEvents.filter((x) => !events.some((e) => norm(e.name) === norm(x.name)));
if (leftoverEvents.length) console.log(`  Eventos que ya tenías y el JSON no menciona (no se tocan): ${leftoverEvents.map((x) => x.name).join(', ')}`);

if (!apply) {
  console.log('\nNo se escribió nada. Revisa el plan y vuelve a correrlo con --aplicar.');
  process.exit(0);
}

// ─── 7. Escribir, padres primero ───────────────────────────────────────────

await write('styles', renamed);
await write('perfumes', [...newPerfumes, ...updatedPerfumes]);
await write('outfit_events', eventRows);
await write('occasions', occasionRows);
console.log('\n✔ Listo. Abre la app: se sincroniza sola en unos segundos.');
process.exit(0);
