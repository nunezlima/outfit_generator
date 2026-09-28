// ═══════════════════════════════════════════════════════════════════════════
// Compatibilidad entre prendas — 3 niveles, gana el más específico:
//
//   3. Regla entre estas dos prendas concretas   (garment_rules)
//   2. Regla entre sus tipos                     (type_rules)
//   1. Matriz de estilos                         (style_compat)
//
// Nivel 1 en detalle: dos prendas combinan si EXISTE algún par
// (estilo de A, estilo de B) compatible. Un estilo siempre combina consigo
// mismo y un par que no está en la matriz se considera compatible. Una prenda
// sin estilos es comodín.
// ═══════════════════════════════════════════════════════════════════════════

import type { Catalog, Garment, GarmentType, Style, UUID } from './types';

export type RuleLevel = 'garment' | 'type' | 'style' | 'wildcard';

export interface PairVerdict {
  ok: boolean;
  level: RuleLevel;
  /** Explicación corta en español, lista para mostrar. */
  reason: string;
}

/** Ordena un par de ids para usarlo como clave (a < b), igual que en la BD. */
export function orderedPair(a: UUID, b: UUID): [UUID, UUID] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

const pairKey = (a: UUID, b: UUID) => orderedPair(a, b).join('|');

export interface CompatOptions {
  /** Estilos deseleccionados en el generador: se ignoran al comparar. */
  excludedStyleIds?: Iterable<UUID>;
}

/**
 * Índice precalculado de reglas para responder rápido "¿A combina con B?".
 * Memoriza cada respuesta porque el generador pregunta muchas veces.
 */
export class CompatIndex {
  private styleMatrix = new Map<string, boolean>();
  private typeRules = new Map<string, boolean>();
  private garmentRules = new Map<string, boolean>();
  private types = new Map<UUID, GarmentType>();
  private styles = new Map<UUID, Style>();
  private excludedStyles: Set<UUID>;
  private memo = new Map<string, PairVerdict>();

  constructor(catalog: Catalog, options: CompatOptions = {}) {
    for (const s of catalog.styles) this.styles.set(s.id, s);
    for (const t of catalog.types) this.types.set(t.id, t);
    for (const r of catalog.styleCompat) this.styleMatrix.set(pairKey(r.style_a, r.style_b), r.compatible);
    for (const r of catalog.typeRules) this.typeRules.set(pairKey(r.type_a, r.type_b), r.allowed);
    for (const r of catalog.garmentRules) this.garmentRules.set(pairKey(r.garment_a, r.garment_b), r.allowed);
    this.excludedStyles = new Set(options.excludedStyleIds ?? []);
  }

  /** Estilos de la prenda que siguen existiendo en el catálogo. */
  knownStyles(g: Garment): UUID[] {
    return g.style_ids.filter((id) => this.styles.has(id));
  }

  /** Estilos que cuentan para esta prenda (existentes y no deseleccionados). */
  effectiveStyles(g: Garment): UUID[] {
    return g.style_ids.filter((id) => this.styles.has(id) && !this.excludedStyles.has(id));
  }

  /** ¿Estos dos estilos combinan según la matriz? */
  stylesCompatible(a: UUID, b: UUID): boolean {
    if (a === b) return true;
    return this.styleMatrix.get(pairKey(a, b)) ?? true;
  }

  styleName(id: UUID): string {
    return this.styles.get(id)?.name ?? '¿?';
  }

  typeName(id: UUID): string {
    return this.types.get(id)?.name ?? '¿?';
  }

  /** Veredicto para el par (A, B), con la regla que decide y su motivo. */
  check(a: Garment, b: Garment): PairVerdict {
    if (a.id === b.id) return { ok: true, level: 'wildcard', reason: 'Es la misma prenda.' };
    const key = pairKey(a.id, b.id);
    const cached = this.memo.get(key);
    if (cached) return cached;
    const verdict = this.compute(a, b);
    this.memo.set(key, verdict);
    return verdict;
  }

  private compute(a: Garment, b: Garment): PairVerdict {
    // Nivel 3 — excepción entre prendas
    const g = this.garmentRules.get(pairKey(a.id, b.id));
    if (g !== undefined) {
      return g
        ? { ok: true, level: 'garment', reason: `Excepción: “${a.name}” sí va con “${b.name}”.` }
        : { ok: false, level: 'garment', reason: `Excepción: “${a.name}” nunca con “${b.name}”.` };
    }

    // Nivel 2 — regla de tipos
    if (a.type_id !== b.type_id) {
      const t = this.typeRules.get(pairKey(a.type_id, b.type_id));
      if (t !== undefined) {
        const ta = this.typeName(a.type_id);
        const tb = this.typeName(b.type_id);
        return t
          ? { ok: true, level: 'type', reason: `Regla de tipos: ${ta} + ${tb} sí se combinan.` }
          : { ok: false, level: 'type', reason: `Regla de tipos: ${ta} + ${tb} no se combinan.` };
      }
    }

    // Nivel 1 — matriz de estilos
    const sa = this.effectiveStyles(a);
    const sb = this.effectiveStyles(b);
    if (sa.length === 0 || sb.length === 0) {
      return { ok: true, level: 'wildcard', reason: 'Una de las prendas no tiene estilo: combina con todo.' };
    }
    for (const x of sa) {
      for (const y of sb) {
        if (this.stylesCompatible(x, y)) {
          const reason =
            x === y
              ? `Comparten el estilo ${this.styleName(x)}.`
              : `Estilos compatibles: ${this.styleName(x)} con ${this.styleName(y)}.`;
          return { ok: true, level: 'style', reason };
        }
      }
    }
    const names = (ids: UUID[]) => ids.map((id) => this.styleName(id)).join(', ');
    return {
      ok: false,
      level: 'style',
      reason: `Estilos: ${names(sa)} no combina con ${names(sb)}.`,
    };
  }

  /** Primer par incompatible dentro de un conjunto de prendas (o null). */
  firstConflict(garments: Garment[]): { a: Garment; b: Garment; verdict: PairVerdict } | null {
    for (let i = 0; i < garments.length; i++) {
      for (let j = i + 1; j < garments.length; j++) {
        const verdict = this.check(garments[i], garments[j]);
        if (!verdict.ok) return { a: garments[i], b: garments[j], verdict };
      }
    }
    return null;
  }

  /** Todos los pares incompatibles de un conjunto (para avisos en la interfaz). */
  conflicts(garments: Garment[]): { a: Garment; b: Garment; verdict: PairVerdict }[] {
    const out: { a: Garment; b: Garment; verdict: PairVerdict }[] = [];
    for (let i = 0; i < garments.length; i++) {
      for (let j = i + 1; j < garments.length; j++) {
        const verdict = this.check(garments[i], garments[j]);
        if (!verdict.ok) out.push({ a: garments[i], b: garments[j], verdict });
      }
    }
    return out;
  }
}
