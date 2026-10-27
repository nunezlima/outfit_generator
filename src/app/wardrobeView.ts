// Recuerda cómo dejaste el Guardarropa (búsqueda, filtros y posición de
// scroll) para que al volver de una prenda, o desde la barra de navegación,
// todo siga igual. Vive en memoria y en sessionStorage: dura mientras la app
// esté abierta, no entre sesiones.

const KEY = 'guardarropa:vista';

interface WardrobeView {
  /** Query string sin "?" (p. ej. "estilo=…&q=…"). */
  search: string;
  scrollY: number;
}

let view: WardrobeView = load();

function load(): WardrobeView {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<WardrobeView>;
      return { search: typeof v.search === 'string' ? v.search : '', scrollY: Number(v.scrollY) || 0 };
    }
  } catch {
    /* sin almacenamiento: solo memoria */
  }
  return { search: '', scrollY: 0 };
}

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* sin almacenamiento: solo memoria */
  }
}

export function getWardrobeView(): WardrobeView {
  return view;
}

export function rememberWardrobeSearch(search: string) {
  if (view.search === search) return;
  view = { ...view, search };
  persist();
}

export function rememberWardrobeScroll(scrollY: number) {
  view = { ...view, scrollY };
  persist();
}

/** Ruta del Guardarropa con los últimos filtros aplicados. */
export function wardrobePath(): string {
  return view.search ? `/guardarropa?${view.search}` : '/guardarropa';
}

/** Al cerrar sesión: quien entre después no hereda la búsqueda anterior. */
export function forgetWardrobeView(): void {
  view = { search: '', scrollY: 0 };
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: solo memoria */
  }
}
