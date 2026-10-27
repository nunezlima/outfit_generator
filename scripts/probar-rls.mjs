#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Prueba las migraciones y las políticas RLS en un Postgres DESECHABLE.
//
// Uso (necesita Docker):
//
//   npm run test:rls
//
// 1. Levanta un contenedor postgres:17 sin red (no publica puertos y no
//    puede conectarse a nada, tampoco a tu proyecto de Supabase).
// 2. Carga supabase/rls-tests/supabase-stub.sql (roles, auth.uid(),
//    storage y permisos por defecto de Supabase).
// 3. Aplica TODAS las migraciones de supabase/migrations, en orden y cada
//    una en su transacción, igual que `supabase db push`.
// 4. Ejecuta supabase/rls-tests/rls.test.sql: un usuario intenta leer y
//    modificar los datos de otro.
// 5. Borra el contenedor, pase lo que pase.
//
// Si creas una tabla nueva y olvidas RLS o sus políticas, esta prueba falla.
// ═══════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Imagen fijada por digest: la prueba no cambia si alguien publica otra "17".
const IMAGE = process.env.RLS_PG_IMAGE || 'postgres:17@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const TESTS = join(ROOT, 'supabase', 'rls-tests');
const name = `guardarropa-rls-${randomUUID().slice(0, 8)}`;

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exitCode = 1;
}

/** Ejecuta un archivo SQL dentro del contenedor y muestra su salida. */
function runSql(label, sql, { singleTransaction = false, show = false } = {}) {
  const args = ['exec', '-i', name, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  if (singleTransaction) args.push('--single-transaction');
  const r = docker(args, sql);
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    .split(/\r?\n/)
    .map((l) => l.replace(/^psql:[^:]+:\d+: /, '').replace(/^NOTICE:\s{0,2}/, ''))
    .filter((l) => l.trim() !== '');
  if (r.status !== 0) {
    console.error(out.join('\n'));
    throw new Error(`Falló ${label}`);
  }
  if (show) console.log(out.join('\n'));
  else console.log(`✔ ${label}`);
}

const check = docker(['version', '--format', '{{.Server.Version}}']);
if (check.status !== 0) {
  fail('Docker no está disponible. Abre Docker Desktop (o instala Docker) y vuelve a intentar.');
  process.exit();
}

try {
  const started = docker(['run', '-d', '--rm', '--name', name, '--network', 'none', '-e', `POSTGRES_PASSWORD=${randomUUID()}`, IMAGE]);
  if (started.status !== 0) throw new Error(`No se pudo iniciar Postgres: ${started.stderr.trim()}`);

  // El servidor definitivo es el único que escucha por TCP (el de inicialización no).
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    ready = docker(['exec', name, 'pg_isready', '-q', '-h', '127.0.0.1', '-U', 'postgres']).status === 0;
    if (!ready) await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Postgres no arrancó en 60 s');

  runSql('Imitación de Supabase', readFileSync(join(TESTS, 'supabase-stub.sql'), 'utf8'));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    runSql(`Migración ${file}`, readFileSync(join(MIGRATIONS, file), 'utf8'), { singleTransaction: true });
  }
  console.log('');
  runSql('Pruebas de RLS', readFileSync(join(TESTS, 'rls.test.sql'), 'utf8'), { show: true });
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  docker(['rm', '-f', name]);
}
