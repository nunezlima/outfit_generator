// Cliente de Supabase. La URL y la clave PÚBLICA vienen de variables de
// entorno (archivo .env en local, "Environment Variables" en Vercel).
// Nunca se escriben en el código.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export type ConfigProblem = 'missing' | 'placeholder' | 'secret_key' | null;

/**
 * Revisa la configuración. Si detecta la clave service_role / secret, la app
 * se NIEGA a arrancar: esa clave salta RLS y jamás debe llegar al navegador.
 */
function detectProblem(): ConfigProblem {
  if (!url || !key) return 'missing';
  if (url.includes('tu-proyecto') || key.startsWith('tu-clave')) return 'placeholder';
  if (key.startsWith('sb_secret_')) return 'secret_key';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload?.role === 'service_role') return 'secret_key';
    } catch {
      /* no es un JWT legible: seguimos */
    }
  }
  return null;
}

export const configProblem: ConfigProblem = detectProblem();

export const supabase: SupabaseClient | null =
  configProblem === null
    ? createClient(url!, key!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'guardarropa-auth',
        },
      })
    : null;

/** Nombre del bucket privado de fotos (ver migración 2). */
export const PHOTO_BUCKET = 'wardrobe';

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}
