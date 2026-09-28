// ═══════════════════════════════════════════════════════════════════════════
// Respaldo: exportar / importar TODO (datos + fotos) en un archivo .zip.
//
//   guardarropa-respaldo-AAAA-MM-DD.zip
//   ├── data.json        todas las tablas (sin filas borradas)
//   └── photos/...       fotos, con la ruta sin la carpeta del usuario
//
// Al importar se reescribe user_id y la carpeta de las fotos al usuario
// actual, así el respaldo sirve también para mudarte a otro proyecto.
// ═══════════════════════════════════════════════════════════════════════════

import JSZip from 'jszip';
import { orderedPair } from '../domain/compat';
import { SYNC_TABLES, getDB, getUserId, type RowByTable, type TableName } from './db';
import { getPhotoBlob, removePhoto, storeRawPhoto, thumbPathOf } from './photos';
import { saveRows, softDelete } from './repo';
import { scheduleSync, syncNow } from './sync';

const FORMAT = 'guardarropa-backup';
const VERSION = 1;

type Progress = (message: string) => void;

interface BackupData {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
  photos: string[];
}

/** Quita la carpeta del usuario: "uid/garments/x.webp" → "garments/x.webp". */
const relative = (path: string) => path.split('/').slice(1).join('/');

function allPhotoPaths(tables: BackupData['tables']): string[] {
  const out = new Set<string>();
  for (const g of (tables.garments ?? []) as { photo_path?: string | null }[]) {
    if (g.photo_path) out.add(g.photo_path).add(thumbPathOf(g.photo_path));
  }
  for (const o of (tables.outfits ?? []) as { photo_paths?: string[] }[]) {
    for (const p of o.photo_paths ?? []) out.add(p).add(thumbPathOf(p));
  }
  return [...out];
}

export async function exportBackup(progress: Progress = () => {}): Promise<Blob> {
  progress('Sincronizando…');
  if (navigator.onLine) await syncNow().catch(() => {});
  const db = getDB();
  const tables: BackupData['tables'] = {};
  for (const t of SYNC_TABLES) tables[t] = (await db.table(t).toArray()) as Record<string, unknown>[];

  const zip = new JSZip();
  const paths = allPhotoPaths(tables);
  const included: string[] = [];
  let i = 0;
  for (const p of paths) {
    progress(`Fotos ${++i} de ${paths.length}…`);
    const blob = await getPhotoBlob(p);
    if (blob) {
      zip.file(`photos/${relative(p)}`, blob);
      included.push(relative(p));
    }
  }
  const data: BackupData = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), tables, photos: included };
  zip.file('data.json', JSON.stringify(data, null, 1));
  progress('Comprimiendo…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

type Tables = BackupData['tables'];

/** Tablas cuya clave primaria es un id propio (las de reglas usan el par). */
const ID_TABLES: TableName[] = ['positions', 'garment_types', 'styles', 'garments', 'presets', 'outfits', 'wear_log', 'garment_events'];

/**
 * Da id NUEVOS a todas las filas y reescribe cada referencia. Se usa al
 * "reemplazar todo": así el respaldo se puede restaurar en cualquier cuenta,
 * incluso en el mismo proyecto donde esos id ya pertenecen a otro usuario
 * (RLS impediría sobrescribirlos, con razón).
 */
export function remapIds(tables: Tables, newId: () => string = () => crypto.randomUUID()): Tables {
  const map = new Map<string, string>();
  for (const t of ID_TABLES) for (const r of tables[t] ?? []) map.set(String(r.id), newId());
  const m = (id: unknown) => (typeof id === 'string' ? (map.get(id) ?? id) : id);
  const ms = (ids: unknown) => (Array.isArray(ids) ? ids.map(m) : ids);
  const pair = (a: unknown, b: unknown) => orderedPair(String(m(a)), String(m(b)));
  const out: Tables = {};
  for (const t of SYNC_TABLES) {
    out[t] = (tables[t] ?? []).map((r) => {
      const row: Record<string, unknown> = { ...r };
      if (ID_TABLES.includes(t)) row.id = m(r.id);
      switch (t) {
        case 'garment_types':
          row.position_id = m(r.position_id);
          break;
        case 'garments':
          row.type_id = m(r.type_id);
          row.style_ids = ms(r.style_ids);
          break;
        case 'style_compat':
          [row.style_a, row.style_b] = pair(r.style_a, r.style_b);
          break;
        case 'type_rules':
          [row.type_a, row.type_b] = pair(r.type_a, r.type_b);
          break;
        case 'garment_rules':
          [row.garment_a, row.garment_b] = pair(r.garment_a, r.garment_b);
          break;
        case 'presets': {
          const c: Record<string, unknown> = { ...(r.config as Record<string, unknown> | undefined) };
          for (const k of ['excludedGarmentIds', 'excludedTypeIds', 'excludedStyleIds']) c[k] = ms(c[k] ?? []);
          c.targetStyleId = c.targetStyleId ? m(c.targetStyleId) : null;
          row.config = c;
          break;
        }
        case 'outfits':
        case 'garment_events':
          row.garment_ids = ms(r.garment_ids);
          break;
        case 'wear_log':
          row.garment_ids = ms(r.garment_ids);
          row.outfit_id = r.outfit_id ? m(r.outfit_id) : null;
          break;
      }
      return row;
    });
  }
  return out;
}

export interface ImportResult {
  rows: number;
  photos: number;
  missingPhotos: number;
}

/**
 * Importa un respaldo.
 * · `replace = true`: borra todo lo actual y restaura una copia con id nuevos
 *   (sirve para cualquier cuenta o proyecto).
 * · `replace = false`: combina conservando los id (para la MISMA cuenta: las
 *   filas con el mismo id se sobrescriben).
 */
export async function importBackup(file: Blob, replace: boolean, progress: Progress = () => {}): Promise<ImportResult> {
  progress('Leyendo archivo…');
  const zip = await JSZip.loadAsync(file);
  const json = zip.file('data.json');
  if (!json) throw new Error('El archivo no es un respaldo válido (falta data.json).');
  const data = JSON.parse(await json.async('string')) as BackupData;
  if (data.format !== FORMAT) throw new Error('El archivo no es un respaldo de Guardarropa.');
  if (data.version > VERSION) throw new Error('El respaldo es de una versión más nueva de la app.');

  const uid = getUserId();
  const toMine = (path: string) => `${uid}/${relative(path)}`;
  const db = getDB();

  if (replace) {
    progress('Borrando datos actuales…');
    const keep = new Set(allPhotoPaths(data.tables).map(relative));
    for (const t of [...SYNC_TABLES].reverse()) {
      if (t === 'user_settings') continue;
      const rows = (await db.table(t).toArray()) as RowByTable[typeof t][];
      if (t === 'garments') for (const g of rows as RowByTable['garments'][]) if (g.photo_path && !keep.has(relative(g.photo_path))) await removePhoto(g.photo_path);
      if (t === 'outfits') for (const o of rows as RowByTable['outfits'][]) for (const p of o.photo_paths) if (!keep.has(relative(p))) await removePhoto(p);
      await softDelete(t, rows as never);
    }
  }

  const tables = replace ? remapIds(data.tables) : data.tables;
  let count = 0;
  for (const t of SYNC_TABLES) {
    const rows = tables[t] ?? [];
    if (rows.length === 0) continue;
    progress(`Importando ${t}… (${rows.length})`);
    const fixed = rows.map((r) => {
      const row: Record<string, unknown> = { ...r, user_id: uid, deleted_at: null };
      if (t === 'garments' && typeof row.photo_path === 'string') row.photo_path = toMine(row.photo_path);
      if (t === 'outfits' && Array.isArray(row.photo_paths)) row.photo_paths = (row.photo_paths as string[]).map(toMine);
      return row;
    });
    for (let i = 0; i < fixed.length; i += 500) await saveRows(t, fixed.slice(i, i + 500) as never);
    count += fixed.length;
  }

  let photos = 0;
  let missing = 0;
  const entries = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('photos/'));
  for (const entry of entries) {
    progress(`Fotos ${photos + missing + 1} de ${entries.length}…`);
    const rel = entry.name.slice('photos/'.length);
    const type = rel.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    try {
      const blob = new Blob([await entry.async('arraybuffer')], { type });
      await storeRawPhoto(`${uid}/${rel}`, blob);
      photos++;
    } catch {
      missing++;
    }
  }
  scheduleSync(200);
  return { rows: count, photos, missingPhotos: missing };
}
