// Las cabeceras de seguridad de vercel.json no deben aflojarse por accidente.
// La CSP estricta se comprobó recorriendo la app en un navegador sin ninguna
// violación; si una librería nueva la rompe, ajusta la librería antes que la CSP.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
const csp = Object.fromEntries(
  headers['Content-Security-Policy']
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .map(([name, ...values]) => [name, values]),
);

describe('vercel.json: cabeceras de seguridad', () => {
  it('la CSP no permite código en línea, eval ni orígenes comodín', () => {
    for (const [directive, values] of Object.entries(csp)) {
      expect(values, directive).not.toContain("'unsafe-inline'");
      expect(values, directive).not.toContain("'unsafe-eval'");
      expect(values, directive).not.toContain('*');
    }
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('la app solo se conecta a sí misma y a servicios cifrados', () => {
    for (const origin of csp['connect-src']) expect(origin, origin).toMatch(/^('self'|https:\/\/\S+|wss:\/\/\S+)$/);
  });

  it('mantiene el resto de cabeceras', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8,}/);
  });
});
