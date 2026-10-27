// ═══════════════════════════════════════════════════════════════════════════
// Sincronización IndexedDB ⇄ Supabase (ver docs/DISENO.md §4)
//
//  PUSH: envía la bandeja de salida en orden FIFO. Operaciones seguidas de la
//        misma tabla se mandan en un solo upsert (quitando duplicados de la
//        misma fila, nos quedamos con la última versión).
//  PULL: por tabla, descarga filas con updated_at > cursor − margen. Filas
//        borradas (deleted_at) se eliminan localmente. Si hay un cambio local
//        pendiente para esa fila, gana el local hasta que se envíe.
//
// Errores de red → se reintenta más tarde. Errores permanentes (p. ej. una
// regla de la base rechaza la fila) → la operación pasa a "failed" y se
// muestra en Ajustes para reintentar o descartar, sin bloquear la cola.
// ═══════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';
import {
  REMOTE_CONFLICT,
  SYNC_TABLES,
  getDB,
  getMeta,
  localKeyOf,
  rowKey,
  setMeta,
  type OutboxOp,
  type TableName,
} from './db';

// ─── Estado observable (para el indicador de la interfaz) ──────────────────

export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'offline' | 'error' | 'disabled';
  lastSyncAt: number | null;
  message: string | null;
}

let status: SyncStatus = { phase: 'idle', lastSyncAt: null, message: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

// ─── Control: cuándo sincronizar ───────────────────────────────────────────

let enabled = false;
let running: Promise<void> | null = null;
let again = false;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let intervalTimer: ReturnType<typeof setInterval> | undefined;

/** Se llama después de cada cambio local: sincroniza 1,5 s después. */
export function scheduleSync(delayMs = 1500): void {
  if (!enabled) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncNow(), delayMs);
}

const onOnline = () => scheduleSync(300);
const onVisible = () => {
  if (document.visibilityState === 'visible') scheduleSync(300);
};

/** Activa la sincronización automática (al iniciar sesión con red). */
export function startSync(): void {
  if (enabled || !supabase) return;
  enabled = true;
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  intervalTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 5 * 60_000);
  void syncNow();
}

export function stopSync(): void {
  enabled = false;
  clearTimeout(debounceTimer);
  clearInterval(intervalTimer);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  setStatus({ phase: 'disabled', message: null });
}

/** Sincroniza ya. Si ya hay una en curso, programa otra al terminar. */
export function syncNow(): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again && enabled);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runOnce(): Promise<void> {
  if (!navigator.onLine) {
    setStatus({ phase: 'offline', message: 'Sin conexión: los cambios se guardan en este dispositivo.' });
    return;
  }
  setStatus({ phase: 'syncing', message: null });
  try {
    await push();
    const missing = await pull();
    await ensureCatalogSeeded();
    if (missing.length > 0) {
      // La app es más nueva que la base: falta aplicar una migración. El resto sí se sincronizó.
      setStatus({ phase: 'error', lastSyncAt: Date.now(), message: `El servidor aún no tiene: ${missing.join(', ')}. Falta aplicar la última migración de Supabase.` });
    } else setStatus({ phase: 'idle', lastSyncAt: Date.now(), message: null });
  } catch (e) {
    const offline = isTransient(e);
    setStatus({
      phase: offline ? 'offline' : 'error',
      message: offline ? 'Sin conexión con el servidor; se reintentará.' : `Error al sincronizar: ${errorText(e)}`,
    });
  }
}

// ─── Errores ───────────────────────────────────────────────────────────────

interface ErrLike {
  message?: string;
  status?: number;
  statusCode?: string | number;
  code?: string;
}

export class SyncError extends Error {
  transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.transient = transient;
  }
}

function classify(err: ErrLike | null | undefined, statusCode?: number): SyncError {
  const msg = err?.message ?? 'Error desconocido';
  const st = statusCode ?? err?.status ?? (err?.statusCode !== undefined ? Number(err.statusCode) : undefined);
  const networkish = /fetch|network|load failed|timeout|aborted/i.test(msg);
  // Sin estado, 0, 401 (token vencido: se renueva solo), 408, 429 y 5xx → reintentar.
  const transient = !navigator.onLine || networkish || st === undefined || Number.isNaN(st) || st === 0 || st === 401 || st === 408 || st === 429 || st >= 500;
  return new SyncError(msg, transient);
}

function isTransient(e: unknown): boolean {
  return e instanceof SyncError ? e.transient : true;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── PUSH ──────────────────────────────────────────────────────────────────

async function push(): Promise<void> {
  const db = getDB();
  for (;;) {
    const ops = await db.outbox.orderBy('seq').limit(200).toArray();
    if (ops.length === 0) return;
    // Tramo inicial de operaciones del mismo tipo y tabla.
    const first = ops[0];
    const run: OutboxOp[] = [first];
    for (let i = 1; i < ops.length; i++) {
      const op = ops[i];
      if (op.kind !== first.kind) break;
      if (op.kind === 'upsert' && first.kind === 'upsert' && op.table !== first.table) break;
      if (op.kind !== 'upsert') break; // fotos: de una en una
      run.push(op);
    }
    try {
      await execute(run);
      await db.outbox.bulkDelete(run.map((o) => o.seq!));
    } catch (e) {
      if (isTransient(e)) throw e;
      // Error permanente: aislar la operación culpable probando una por una.
      for (const op of run) {
        try {
          await execute([op]);
          await db.outbox.delete(op.seq!);
        } catch (e2) {
          if (isTransient(e2)) throw e2;
          await db.transaction('rw', db.outbox, db.failed, async () => {
            await db.failed.add({ ...op, seq: undefined, error: errorText(e2), failedAt: Date.now() } as never);
            await db.outbox.delete(op.seq!);
          });
        }
      }
    }
  }
}

async function execute(run: OutboxOp[]): Promise<void> {
  const sb = supabase!;
  const first = run[0];
  if (first.kind === 'upsert') {
    // Dentro del tramo, una fila puede aparecer varias veces: gana la última.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const op of run) if (op.kind === 'upsert') byKey.set(op.key, op.row);
    const { error, status: st } = await sb
      .from(first.table)
      .upsert([...byKey.values()], { onConflict: REMOTE_CONFLICT[first.table] });
    if (error) throw classify(error, st);
    return;
  }
  if (first.kind === 'upload') {
    const photo = await getDB().photos.get(first.path);
    if (!photo) return; // ya no existe (se borró antes de subirse)
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(first.path, photo.blob, {
      contentType: photo.blob.type || 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) throw classify(error as ErrLike);
    await getDB().photos.update(first.path, { pending: 0 });
    return;
  }
  if (first.kind === 'remove') {
    const { error } = await sb.storage.from(PHOTO_BUCKET).remove(first.paths);
    if (error) throw classify(error as ErrLike);
  }
}

// ─── PULL ──────────────────────────────────────────────────────────────────

const PAGE = 1000;
const CURSOR_MARGIN_MS = 2 * 60_000;

/** ¿El error es "esa tabla no existe en el servidor"? (migración pendiente) */
function isMissingTable(err: ErrLike | null | undefined): boolean {
  return err?.code === 'PGRST205' || err?.code === '42P01' || /could not find the table|does not exist/i.test(err?.message ?? '');
}

/** Descarga cambios. Devuelve las tablas que el servidor todavía no tiene. */
async function pull(): Promise<TableName[]> {
  const sb = supabase!;
  const missing: TableName[] = [];
  for (const table of SYNC_TABLES) {
    const cursor = (await getMeta<string>(`cursor:${table}`)) ?? null;
    const since = cursor ? new Date(new Date(cursor).getTime() - CURSOR_MARGIN_MS).toISOString() : null;
    let maxSeen = cursor;
    let absent = false;
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select('*').order('updated_at', { ascending: true });
      for (const c of REMOTE_CONFLICT[table].split(',')) q = q.order(c, { ascending: true });
      if (since) q = q.gt('updated_at', since);
      const { data, error, status: st } = await q.range(from, from + PAGE - 1);
      if (error && isMissingTable(error)) {
        absent = true;
        break;
      }
      if (error) throw classify(error, st);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length > 0) {
        await applyRemoteRows(table, rows);
        const last = String(rows[rows.length - 1].updated_at);
        if (!maxSeen || last > maxSeen) maxSeen = last;
      }
      if (rows.length < PAGE) break;
    }
    if (absent) {
      // Sin avanzar el cursor: se descarga completa cuando exista.
      missing.push(table);
      continue;
    }
    if (maxSeen && maxSeen !== cursor) await setMeta(`cursor:${table}`, maxSeen);
  }
  return missing;
}

async function applyRemoteRows(table: TableName, rows: Record<string, unknown>[]): Promise<void> {
  const db = getDB();
  const t = db.table(table);
  await db.transaction('rw', t, db.outbox, async () => {
    // Filas con cambios locales sin enviar: no las pisamos.
    const pendingKeys = new Set((await db.outbox.where('kind').equals('upsert').toArray()).map((o) => o.key));
    const toPut: Record<string, unknown>[] = [];
    const toDelete: (string | string[])[] = [];
    for (const row of rows) {
      if (pendingKeys.has(rowKey(table, row))) continue;
      if (row.deleted_at) toDelete.push(localKeyOf(table, row));
      else toPut.push(row);
    }
    if (toPut.length) await t.bulkPut(toPut);
    if (toDelete.length) await t.bulkDelete(toDelete);
  });
}

// ─── Catálogo inicial ──────────────────────────────────────────────────────

/**
 * La primera vez que un usuario entra no tiene posiciones, tipos ni estilos.
 * La función SQL seed_default_catalog() los crea (una sola vez, es
 * idempotente) y luego los descargamos.
 */
async function ensureCatalogSeeded(): Promise<void> {
  const db = getDB();
  if (await getMeta<boolean>('catalogSeedChecked')) return;
  if ((await db.positions.count()) > 0) {
    await setMeta('catalogSeedChecked', true);
    return;
  }
  const { data, error, status: st } = await supabase!.rpc('seed_default_catalog');
  if (error) throw classify(error, st);
  if (data === true) await pull();
  await setMeta('catalogSeedChecked', true);
}

/** Cambios que aún no llegan al servidor (para el indicador). */
export async function pendingCount(): Promise<number> {
  return getDB().outbox.count();
}
