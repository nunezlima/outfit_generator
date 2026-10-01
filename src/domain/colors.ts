// Paleta de colores y sugerencias de armonía. Es solo una SUGERENCIA: nunca
// bloquea una combinación; en el generador baja un poco la probabilidad de
// colores que chocan.

export interface PaletteColor {
  key: string;
  label: string;
  hex: string;
  /** Los neutros combinan con todo. */
  neutral: boolean;
  /** Tono en el círculo cromático (0–359) para colores no neutros. */
  hue?: number;
}

export const PALETTE: PaletteColor[] = [
  // ── Neutros ──
  { key: 'negro', label: 'Negro', hex: '#1f1f1f', neutral: true },
  { key: 'blanco', label: 'Blanco', hex: '#f7f7f2', neutral: true },
  { key: 'gris', label: 'Gris claro', hex: '#c4c8ce', neutral: true },
  { key: 'plateado', label: 'Plateado', hex: 'linear-gradient(135deg, #f1f3f5, #9aa1aa 50%, #e2e5e9)', neutral: true },
  { key: 'gris_oscuro', label: 'Gris oscuro', hex: '#4b5563', neutral: true },
  { key: 'beige', label: 'Beige / arena', hex: '#d8c6a5', neutral: true },
  { key: 'caqui', label: 'Caqui', hex: '#b3a36b', neutral: true },
  { key: 'cafe_claro', label: 'Café claro', hex: '#a47551', neutral: true },
  { key: 'cafe', label: 'Café oscuro', hex: '#5a3a22', neutral: true },
  { key: 'azul_marino', label: 'Azul marino', hex: '#1e2a4a', neutral: true },
  { key: 'mezclilla', label: 'Mezclilla', hex: '#4a6fa5', neutral: true },
  { key: 'verde_olivo', label: 'Verde olivo', hex: '#6b7c3a', neutral: true },
  // ── Colores ──
  { key: 'rojo', label: 'Rojo', hex: '#dc2626', neutral: false, hue: 0 },
  { key: 'ladrillo', label: 'Ladrillo', hex: '#a9442f', neutral: false, hue: 10 },
  { key: 'vino', label: 'Vino', hex: '#7f1d1d', neutral: false, hue: 350 },
  { key: 'rosa', label: 'Rosa', hex: '#f472b6', neutral: false, hue: 330 },
  { key: 'lila', label: 'Lila', hex: '#c4a6e8', neutral: false, hue: 280 },
  { key: 'morado', label: 'Morado', hex: '#7c3aed', neutral: false, hue: 270 },
  { key: 'azul', label: 'Azul', hex: '#2563eb', neutral: false, hue: 222 },
  { key: 'celeste', label: 'Celeste', hex: '#7dd3fc', neutral: false, hue: 200 },
  { key: 'turquesa', label: 'Turquesa (azul verdoso)', hex: '#14a9b8', neutral: false, hue: 186 },
  { key: 'menta', label: 'Menta (verde azulado)', hex: '#7fd8b0', neutral: false, hue: 153 },
  { key: 'verde', label: 'Verde', hex: '#16a34a', neutral: false, hue: 140 },
  { key: 'verde_bandera', label: 'Verde bandera', hex: '#0b6b3a', neutral: false, hue: 148 },
  { key: 'amarillo', label: 'Amarillo', hex: '#facc15', neutral: false, hue: 52 },
  { key: 'mostaza', label: 'Mostaza', hex: '#ca8a04', neutral: false, hue: 44 },
  { key: 'naranja', label: 'Naranja', hex: '#f97316', neutral: false, hue: 25 },
  { key: 'multicolor', label: 'Multicolor / estampado', hex: 'conic-gradient(#dc2626, #facc15, #16a34a, #2563eb, #7c3aed, #dc2626)', neutral: false },
];

const BY_KEY = new Map(PALETTE.map((c) => [c.key, c]));

export function getColor(key: string | null | undefined): PaletteColor | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Relación entre dos colores no neutros. */
function relation(a: PaletteColor, b: PaletteColor): 'same' | 'analogous' | 'complementary' | 'clash' {
  if (a.key === b.key) return 'same';
  if (a.hue === undefined || b.hue === undefined) return 'clash'; // estampado + color
  const d = hueDistance(a.hue, b.hue);
  if (d <= 45) return 'analogous';
  if (d >= 135) return 'complementary';
  return 'clash';
}

/** ¿Estos dos colores "pelean"? (Neutros o sin color nunca pelean.) */
export function colorsClash(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = getColor(a);
  const cb = getColor(b);
  if (!ca || !cb || ca.neutral || cb.neutral) return false;
  return relation(ca, cb) === 'clash';
}

export interface ColorAdvice {
  tone: 'good' | 'warn' | 'none';
  message: string;
}

/** Sugerencia de color para un conjunto de prendas (lista de claves). */
export function colorAdvice(keys: (string | null | undefined)[]): ColorAdvice {
  const colors = keys.map(getColor).filter((c): c is PaletteColor => !!c);
  if (colors.length === 0) return { tone: 'none', message: '' };
  const accents = [...new Map(colors.filter((c) => !c.neutral).map((c) => [c.key, c])).values()];

  if (accents.length === 0) return { tone: 'good', message: 'Paleta neutra: combina con todo.' };
  if (accents.length === 1) {
    return accents[0].key === 'multicolor'
      ? { tone: 'good', message: 'Estampado con neutros: buena elección.' }
      : { tone: 'good', message: `${accents[0].label} como único color de acento: equilibrado.` };
  }
  if (accents.length === 2) {
    const rel = relation(accents[0], accents[1]);
    if (rel === 'analogous') return { tone: 'good', message: `${accents[0].label} y ${accents[1].label} son colores vecinos: combinan bien.` };
    if (rel === 'complementary') return { tone: 'good', message: `${accents[0].label} y ${accents[1].label} contrastan (complementarios): atrevido pero funciona.` };
    return { tone: 'warn', message: `${accents[0].label} y ${accents[1].label} pueden chocar; prueba cambiar uno por un neutro.` };
  }
  return { tone: 'warn', message: `Hay ${accents.length} colores de acento; quizá sea mucho. Prueba con más neutros.` };
}
