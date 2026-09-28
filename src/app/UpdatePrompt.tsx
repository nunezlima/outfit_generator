// Aviso de nueva versión de la PWA (el service worker espera a que aceptes,
// así nunca se recarga la app a mitad de algo).

import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Revisa si hay versión nueva cada hora mientras la app esté abierta.
      if (registration) setInterval(() => void registration.update(), 60 * 60_000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="banner" role="status">
      <RefreshCw width={18} height={18} />
      <span className="grow">Hay una versión nueva de la app.</span>
      <button className="btn sm primary" onClick={() => void updateServiceWorker(true)}>
        Actualizar
      </button>
      <button className="icon-btn sm" aria-label="Más tarde" onClick={() => setNeedRefresh(false)}>
        <X />
      </button>
    </div>
  );
}
