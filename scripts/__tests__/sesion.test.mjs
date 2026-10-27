import { describe, expect, it } from 'vitest';
import { isSecretKey } from '../lib/sesion.mjs';

// JWT con el formato de las claves antiguas de Supabase (firma falsa: solo importa el contenido).
const jwt = (payload) => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'firma'].join('.');

describe('scripts: detección de claves secretas', () => {
  it('rechaza la secret key nueva y la service_role antigua (JWT)', () => {
    expect(isSecretKey('sb_secret_abc123')).toBe(true);
    expect(isSecretKey(jwt({ iss: 'supabase', role: 'service_role' }))).toBe(true);
  });

  it('acepta las claves públicas', () => {
    expect(isSecretKey('sb_publishable_abc123')).toBe(false);
    expect(isSecretKey(jwt({ iss: 'supabase', role: 'anon' }))).toBe(false);
    expect(isSecretKey('no.es.jwt')).toBe(false);
  });
});
