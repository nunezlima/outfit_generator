// Fechas en hora LOCAL del dispositivo (el "hoy" del usuario, no el de UTC).

import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** 'YYYY-MM-DD' → Date a medianoche local. */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Días completos entre dos fechas (b − a), por calendario local. */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? (a.length <= 10 ? parseISODate(a) : new Date(a)) : a;
  const db = typeof b === 'string' ? (b.length <= 10 ? parseISODate(b) : new Date(b)) : b;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex] ?? '';
}

/** "12 de marzo de 2026" */
export function formatLongDate(s: ISODate | Date): string {
  const d = typeof s === 'string' ? parseISODate(s) : s;
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "hoy", "ayer", "hace 5 días", "hace 3 meses"… */
export function relativeDays(days: number | null): string {
  if (days === null) return 'nunca';
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}
