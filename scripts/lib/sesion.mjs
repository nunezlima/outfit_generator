// ═══════════════════════════════════════════════════════════════════════════
// Lo que comparten los scripts de importación: leer la configuración, pedir
// tus credenciales e iniciar sesión COMO TÚ, con la clave pública. Así Row
// Level Security aplica igual que en la app.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/**
 * ¿Es una clave que salta RLS? La "secret" nueva se reconoce por su prefijo;
 * la service_role antigua es un JWT con role = service_role en su contenido
 * (va en base64, así que hay que decodificarlo: igual que src/lib/supabase.ts).
 */
export function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.role === 'service_role';
  } catch {
    return false;
  }
}

/** Lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY del entorno o del .env. */
export function loadEnv() {
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
  if (isSecretKey(key)) fail('Esa es una clave SECRETA. Usa la clave pública (anon / publishable) y rota la secreta (README, paso 7).');
  return { url, key };
}

/** Pide un texto en la terminal sin mostrarlo (la contraseña). */
function askHidden(question) {
  return new Promise((resolve) => {
    let value = '';
    const done = (exitCode) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (exitCode !== undefined) process.exit(exitCode);
      resolve(value);
    };
    const onData = (chunk) => {
      if (chunk.startsWith('\u001b')) return; // flechas y otras teclas especiales
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Correo y contraseña: de GUARDARROPA_EMAIL / GUARDARROPA_PASSWORD o preguntando. */
async function askCredentials() {
  let email = process.env.GUARDARROPA_EMAIL;
  let password = process.env.GUARDARROPA_PASSWORD;
  if (email && password) return { email, password };
  if (!stdin.isTTY) {
    // Entrada redirigida (sin terminal): nada que ocultar en pantalla. El
    // iterador guarda las líneas que llegan antes de preguntar (rl.question las perdería).
    const rl = createInterface({ input: stdin, terminal: false });
    const lines = rl[Symbol.asyncIterator]();
    const next = async (label) => {
      stdout.write(label);
      const { value, done } = await lines.next();
      if (done) fail('La entrada terminó antes del correo y la contraseña. También puedes usar GUARDARROPA_EMAIL y GUARDARROPA_PASSWORD.');
      stdout.write('\n');
      return value;
    };
    email ||= await next('Correo: ');
    password ||= await next('Contraseña: ');
    rl.close();
    return { email, password };
  }
  if (!email) {
    const rl = createInterface({ input: stdin, output: stdout });
    email = await rl.question('Correo: ');
    rl.close();
  }
  password ||= await askHidden('Contraseña (no se muestra): ');
  return { email, password };
}

/** Inicia sesión como tú. Devuelve el cliente ya autenticado y tu id. */
export async function signInAsYou() {
  const { url, key } = loadEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { email, password } = await askCredentials();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) fail(`No se pudo iniciar sesión: ${error.message}`);
  console.log(`✔ Sesión iniciada como ${data.user.email}\n`);
  return { supabase, uid: data.user.id };
}
