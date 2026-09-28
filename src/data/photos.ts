// ═══════════════════════════════════════════════════════════════════════════
// Fotos: compresión antes de subir, cola de subida sin conexión y
// visualización con URL firmadas temporales + caché local.
//
// · Cada foto se guarda en dos tamaños: máx. 1200 px (vista completa) y
//   máx. 360 px (miniatura "_thumb") para que la cuadrícula cargue rápido.
// · Formato WebP si el navegador sabe codificarlo; si no (algunos Safari),
//   JPEG. Así una foto típica pesa ~100–250 KB en lugar de 3–5 MB.
// · Se muestran pidiendo una URL firmada que caduca en 1 h y descargando la
//   imagen a IndexedDB, de modo que después se ve también sin conexión.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';
import { getDB, getUserId } from './db';
import { scheduleSync } from './sync';

export const MAX_PHOTO_SIZE = 1200;
export const THUMB_SIZE = 360;
const SIGNED_URL_SECONDS = 60 * 60;

// ─── Compresión ────────────────────────────────────────────────────────────

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // imageOrientation respeta la rotación EXIF de las fotos del celular.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Redimensiona (lado mayor ≤ maxSize) y comprime a WebP, o JPEG si no hay WebP. */
export async function compressImage(file: Blob, maxSize: number, quality = 0.8): Promise<Blob> {
  const source = await loadBitmap(file);
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new Error('No se pudo comprimir la imagen');
  return jpeg;
}

export function thumbPathOf(path: string): string {
  return path.replace(/(\.[a-z0-9]+)$/i, '_thumb$1');
}

function extensionOf(blob: Blob): string {
  return blob.type === 'image/webp' ? 'webp' : 'jpg';
}

// ─── Guardar / quitar ──────────────────────────────────────────────────────

/**
 * Comprime la foto, la guarda localmente y la deja en la cola de subida.
 * `folder` es relativo a la carpeta del usuario, p. ej. "garments".
 * Devuelve la ruta de la foto completa.
 */
export async function storeNewPhoto(folder: string, baseName: string, file: Blob): Promise<string> {
  const full = await compressImage(file, MAX_PHOTO_SIZE, 0.8);
  const thumb = await compressImage(full, THUMB_SIZE, 0.72);
  const path = `${getUserId()}/${folder}/${baseName}.${extensionOf(full)}`;
  const tpath = thumbPathOf(path);
  const db = getDB();
  const now = Date.now();
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.bulkPut([
      { path, blob: full, pending: 1, cachedAt: now },
      { path: tpath, blob: thumb, pending: 1, cachedAt: now },
    ]);
    await db.outbox.bulkAdd([
      { kind: 'upload', key: `upload:${path}`, path, createdAt: now },
      { kind: 'upload', key: `upload:${tpath}`, path: tpath, createdAt: now },
    ]);
  });
  scheduleSync();
  return path;
}

/** Guarda una foto ya lista (p. ej. al importar un respaldo) y la encola. */
export async function storeRawPhoto(path: string, blob: Blob): Promise<void> {
  const db = getDB();
  const now = Date.now();
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.put({ path, blob, pending: 1, cachedAt: now });
    await db.outbox.add({ kind: 'upload', key: `upload:${path}`, path, createdAt: now });
  });
}

/** Borra la foto (y su miniatura) local y remotamente. */
export async function removePhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const paths = [path, thumbPathOf(path)];
  const db = getDB();
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.bulkDelete(paths);
    await db.outbox.where('key').anyOf(paths.map((p) => `upload:${p}`)).delete();
    await db.outbox.add({ kind: 'remove', key: `remove:${path}`, paths, createdAt: Date.now() });
  });
  paths.forEach(forgetUrl);
  scheduleSync();
}

// ─── Mostrar: URL firmadas + caché ─────────────────────────────────────────

const objectUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let queue: { path: string; resolve: (blob: Blob | null) => void }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function forgetUrl(path: string) {
  const url = objectUrls.get(path);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(path);
}

/** Pide URL firmadas en lote (una sola petición para toda la cuadrícula). */
function requestRemote(path: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    queue.push({ path, resolve });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushQueue, 40);
  });
}

async function flushQueue() {
  const batch = queue;
  queue = [];
  if (!supabase || batch.length === 0) {
    batch.forEach((b) => b.resolve(null));
    return;
  }
  const paths = [...new Set(batch.map((b) => b.path))];
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urls = new Map<string, string>();
  if (!error && data) for (const d of data) if (d.signedUrl && d.path) urls.set(d.path, d.signedUrl);
  await Promise.all(
    paths.map(async (p) => {
      const url = urls.get(p);
      let blob: Blob | null = null;
      if (url) {
        try {
          const res = await fetch(url);
          if (res.ok) blob = await res.blob();
        } catch {
          blob = null;
        }
      }
      if (blob) await getDB().photos.put({ path: p, blob, pending: 0, cachedAt: Date.now() });
      batch.filter((b) => b.path === p).forEach((b) => b.resolve(blob));
    }),
  );
}

/** Blob de una foto: de la caché local o descargándolo con URL firmada. */
export async function getPhotoBlob(path: string): Promise<Blob | null> {
  const local = await getDB().photos.get(path);
  if (local) return local.blob;
  if (!navigator.onLine) return null;
  return requestRemote(path);
}

async function resolveUrl(path: string): Promise<string | null> {
  const known = objectUrls.get(path);
  if (known) return known;
  let p = inflight.get(path);
  if (!p) {
    p = (async () => {
      const blob = await getPhotoBlob(path);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      objectUrls.set(path, url);
      return url;
    })().finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/**
 * Hook: URL local (blob:) lista para <img>. `thumb` usa la miniatura y, si no
 * existe (fotos antiguas o importadas), cae a la foto completa.
 */
export function usePhotoUrl(path: string | null | undefined, variant: 'thumb' | 'full' = 'thumb'): string | null {
  const target = path ? (variant === 'thumb' ? thumbPathOf(path) : path) : null;
  const [url, setUrl] = useState<string | null>(() => (target ? (objectUrls.get(target) ?? null) : null));

  useEffect(() => {
    let alive = true;
    if (!path || !target) {
      setUrl(null);
      return;
    }
    setUrl(objectUrls.get(target) ?? null);
    (async () => {
      let u = await resolveUrl(target);
      if (!u && target !== path) u = await resolveUrl(path);
      if (alive) setUrl(u);
    })();
    return () => {
      alive = false;
    };
  }, [path, target]);

  return url;
}

/** Borra las fotos descargadas (no las pendientes de subir). */
export async function clearPhotoCache(): Promise<number> {
  const db = getDB();
  const cached = await db.photos.where('pending').equals(0).primaryKeys();
  await db.photos.bulkDelete(cached);
  cached.forEach((p) => forgetUrl(p as string));
  return cached.length;
}
