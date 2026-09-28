// Generador de números aleatorios con semilla (para pruebas reproducibles) y
// utilidades de azar ponderado.

/** Devuelve un número en [0, 1). */
export type Rng = () => number;

/** mulberry32: RNG pequeño y rápido con semilla. Suficiente para esta app. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;

/**
 * Ordena los elementos al azar, pero favoreciendo a los de mayor peso
 * (algoritmo de Efraimidis–Spirakis): a cada elemento se le da la clave
 * u^(1/peso) con u uniforme en (0,1) y se ordena de mayor a menor.
 *
 * Propiedad clave: el primer elemento sale con probabilidad
 * peso_i / Σ pesos, y el resto del orden sigue la misma lógica sin
 * reemplazo. Así el generador prueba primero lo "más recomendable" pero
 * cualquier prenda con peso > 0 puede salir.
 */
export function weightedShuffle<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng = defaultRng): T[] {
  return items
    .map((item) => {
      const w = Math.max(weightOf(item), 1e-6);
      const u = Math.max(rng(), 1e-12);
      return { item, key: Math.pow(u, 1 / w) };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/** Elige un elemento con probabilidad proporcional a su peso. */
export function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng = defaultRng): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((i) => Math.max(weightOf(i), 0));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
