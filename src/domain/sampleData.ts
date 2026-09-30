// Datos de EJEMPLO totalmente ficticios para probar la app sin cargar tu ropa.
// Se refieren a tipos y estilos por nombre (los del catálogo inicial); si
// renombraste o borraste alguno, el cargador crea lo que falte.

import type { Climate, PositionRole, Warmth } from './types';

export interface SampleGarment {
  name: string;
  type: string;
  role: PositionRole;
  styles: string[];
  color: string | null;
  warmth: Warmth;
  /** Por defecto 'all' (todo el año). */
  climate?: Climate;
  wash: number;
  status?: 'available' | 'laundry';
  uses?: number;
  notes?: string;
}

export const SAMPLE_GARMENTS: SampleGarment[] = [
  { name: 'Camiseta blanca básica', type: 'Camiseta', role: 'top', styles: ['Casual', 'Smart casual'], color: 'blanco', warmth: 'light', wash: 1 },
  { name: 'Camiseta negra', type: 'Camiseta', role: 'top', styles: ['Casual'], color: 'negro', warmth: 'light', wash: 1, status: 'laundry', uses: 1 },
  { name: 'Camiseta a rayas marineras', type: 'Camiseta', role: 'top', styles: ['Casual', 'Playa'], color: 'azul_marino', warmth: 'light', wash: 1 },
  { name: 'Camisa Oxford celeste', type: 'Camisa', role: 'top', styles: ['Formal', 'Smart casual'], color: 'celeste', warmth: 'light', wash: 2 },
  { name: 'Camisa blanca de vestir', type: 'Camisa', role: 'top', styles: ['Formal', 'Smart casual'], color: 'blanco', warmth: 'light', wash: 2 },
  { name: 'Camisa de lino beige', type: 'Camisa', role: 'top', styles: ['Smart casual', 'Casual', 'Playa'], color: 'beige', warmth: 'light', climate: 'hot', wash: 2 },
  { name: 'Polo verde', type: 'Polo', role: 'top', styles: ['Casual', 'Smart casual'], color: 'verde', warmth: 'light', wash: 2 },
  { name: 'Suéter gris de punto', type: 'Suéter', role: 'top', styles: ['Smart casual', 'Casual'], color: 'gris', warmth: 'medium', wash: 4 },
  { name: 'Hoodie negra', type: 'Hoodie', role: 'top', styles: ['Casual', 'Deportivo'], color: 'negro', warmth: 'medium', wash: 3 },
  { name: 'Sudadera color vino', type: 'Sudadera', role: 'top', styles: ['Casual', 'Deportivo'], color: 'vino', warmth: 'medium', wash: 3, notes: 'Ejemplo de prenda que "no te gusta": tiene muchos rechazos.' },
  { name: 'Chamarra de mezclilla', type: 'Chamarra', role: 'outer', styles: ['Casual', 'Smart casual'], color: 'mezclilla', warmth: 'medium', wash: 10 },
  { name: 'Blazer azul marino', type: 'Saco / Blazer', role: 'outer', styles: ['Formal', 'Smart casual'], color: 'azul_marino', warmth: 'medium', wash: 8 },
  { name: 'Abrigo camel', type: 'Abrigo', role: 'outer', styles: ['Formal', 'Smart casual'], color: 'beige', warmth: 'warm', climate: 'cold', wash: 15 },
  { name: 'Jeans azul oscuro', type: 'Jeans', role: 'bottom', styles: ['Casual', 'Smart casual'], color: 'mezclilla', warmth: 'medium', wash: 4, uses: 2 },
  { name: 'Jeans negros', type: 'Jeans', role: 'bottom', styles: ['Casual', 'Smart casual'], color: 'negro', warmth: 'medium', wash: 4 },
  { name: 'Pantalón de vestir gris', type: 'Pantalón de vestir', role: 'bottom', styles: ['Formal', 'Smart casual'], color: 'gris_oscuro', warmth: 'medium', wash: 3 },
  { name: 'Chinos caqui', type: 'Pantalón casual', role: 'bottom', styles: ['Smart casual', 'Casual'], color: 'caqui', warmth: 'medium', wash: 3 },
  { name: 'Shorts de mezclilla', type: 'Shorts', role: 'bottom', styles: ['Casual', 'Playa'], color: 'mezclilla', warmth: 'light', climate: 'hot', wash: 2 },
  { name: 'Pants deportivos grises', type: 'Pants deportivos', role: 'bottom', styles: ['Deportivo'], color: 'gris', warmth: 'medium', wash: 2 },
  { name: 'Overol de mezclilla', type: 'Overol', role: 'full_body', styles: ['Casual'], color: 'mezclilla', warmth: 'medium', wash: 3 },
  { name: 'Traje de baño azul', type: 'Traje de baño', role: 'full_body', styles: ['Playa'], color: 'azul', warmth: 'light', climate: 'hot', wash: 1 },
  { name: 'Tenis blancos', type: 'Tenis', role: 'footwear', styles: ['Casual', 'Smart casual', 'Deportivo'], color: 'blanco', warmth: 'medium', wash: 0 },
  { name: 'Tenis para correr', type: 'Tenis', role: 'footwear', styles: ['Deportivo'], color: 'gris', warmth: 'medium', wash: 0 },
  { name: 'Zapatos Oxford negros', type: 'Zapatos de vestir', role: 'footwear', styles: ['Formal'], color: 'negro', warmth: 'medium', wash: 0 },
  { name: 'Mocasines café', type: 'Mocasines', role: 'footwear', styles: ['Smart casual', 'Formal'], color: 'cafe', warmth: 'medium', wash: 0 },
  { name: 'Botas café', type: 'Botas', role: 'footwear', styles: ['Casual', 'Smart casual'], color: 'cafe', warmth: 'warm', wash: 0 },
  { name: 'Chanclas negras', type: 'Chanclas', role: 'footwear', styles: ['Playa'], color: 'negro', warmth: 'light', climate: 'hot', wash: 0 },
  { name: 'Reloj plateado', type: 'Reloj', role: 'accessory', styles: ['Formal', 'Smart casual', 'Casual'], color: 'gris', warmth: 'medium', wash: 0 },
  { name: 'Reloj deportivo', type: 'Reloj', role: 'accessory', styles: ['Deportivo', 'Casual'], color: 'negro', warmth: 'medium', wash: 0 },
  { name: 'Cinturón de piel café', type: 'Cinturón', role: 'accessory', styles: ['Formal', 'Smart casual', 'Casual'], color: 'cafe', warmth: 'medium', wash: 0 },
  { name: 'Gorra azul', type: 'Gorra', role: 'accessory', styles: ['Casual', 'Deportivo', 'Playa'], color: 'azul_marino', warmth: 'medium', wash: 5 },
  { name: 'Lentes de sol', type: 'Lentes', role: 'accessory', styles: ['Casual', 'Playa', 'Smart casual'], color: 'negro', warmth: 'medium', wash: 0 },
  { name: 'Anillo plateado', type: 'Anillo', role: 'accessory', styles: ['Formal', 'Smart casual', 'Casual', 'Deportivo', 'Playa'], color: 'gris', warmth: 'medium', wash: 0 },
  { name: 'Bufanda gris', type: 'Bufanda', role: 'accessory', styles: ['Casual', 'Smart casual'], color: 'gris', warmth: 'warm', climate: 'cold', wash: 5 },
];

export interface SampleOutfit {
  name: string;
  tags: string[];
  favorite: boolean;
  garments: string[];
}

export const SAMPLE_OUTFITS: SampleOutfit[] = [
  { name: 'Oficina clásica', tags: ['oficina'], favorite: true, garments: ['Camisa Oxford celeste', 'Pantalón de vestir gris', 'Mocasines café', 'Reloj plateado', 'Cinturón de piel café'] },
  { name: 'Fin de semana', tags: ['casual'], favorite: false, garments: ['Camiseta blanca básica', 'Jeans azul oscuro', 'Tenis blancos', 'Gorra azul'] },
  { name: 'Día de playa', tags: ['vacaciones', 'calor'], favorite: false, garments: ['Camiseta a rayas marineras', 'Shorts de mezclilla', 'Chanclas negras', 'Lentes de sol'] },
  { name: 'Cena con amigos', tags: ['noche'], favorite: true, garments: ['Camiseta negra', 'Jeans negros', 'Botas café', 'Chamarra de mezclilla'] },
];

/** Historial ficticio: hace cuántos días y qué prendas. */
export const SAMPLE_WEAR: { daysAgo: number; outfit?: string; garments?: string[] }[] = [
  { daysAgo: 1, outfit: 'Fin de semana' },
  { daysAgo: 2, outfit: 'Cena con amigos' },
  { daysAgo: 4, outfit: 'Oficina clásica' },
  { daysAgo: 6, garments: ['Polo verde', 'Chinos caqui', 'Tenis blancos'] },
  { daysAgo: 9, outfit: 'Oficina clásica' },
  { daysAgo: 12, garments: ['Suéter gris de punto', 'Jeans azul oscuro', 'Botas café', 'Reloj plateado'] },
  { daysAgo: 20, outfit: 'Día de playa' },
  { daysAgo: 95, garments: ['Camisa blanca de vestir', 'Pantalón de vestir gris', 'Zapatos Oxford negros', 'Blazer azul marino'] },
];

/** Eventos ficticios para que el Análisis tenga algo que mostrar. */
export const SAMPLE_EVENTS: { garment: string; shown: number; strong: number; weak: number }[] = [
  { garment: 'Sudadera color vino', shown: 9, strong: 6, weak: 2 },
  { garment: 'Camisa de lino beige', shown: 7, strong: 3, weak: 3 },
  { garment: 'Jeans azul oscuro', shown: 12, strong: 1, weak: 2 },
  { garment: 'Tenis blancos', shown: 15, strong: 0, weak: 3 },
];

/** Excepción de ejemplo (nivel 3). */
export const SAMPLE_GARMENT_RULES: { a: string; b: string; allowed: boolean }[] = [{ a: 'Hoodie negra', b: 'Pantalón de vestir gris', allowed: true }];
