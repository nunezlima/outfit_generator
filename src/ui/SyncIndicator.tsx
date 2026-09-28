// Pastilla en el encabezado con el estado de sincronización.

import { Cloud, CloudOff, CloudUpload, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutboxCounts } from '../data/hooks';
import { syncNow, useSyncStatus } from '../data/sync';

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function SyncIndicator() {
  const status = useSyncStatus();
  const { pending, failed } = useOutboxCounts();
  const online = useOnline();

  let cls = 'sync-pill';
  let icon = <Cloud />;
  let text = '';
  let title = 'Todo sincronizado';

  if (!online || status.phase === 'offline') {
    cls += ' warn';
    icon = <CloudOff />;
    text = pending > 0 ? `${pending}` : 'Sin red';
    title = status.message ?? 'Sin conexión: todo se guarda en este dispositivo y se sincroniza al volver internet.';
  } else if (status.phase === 'syncing') {
    icon = <LoaderCircle className="spin" />;
    title = 'Sincronizando…';
  } else if (status.phase === 'error' || failed > 0) {
    cls += ' error';
    icon = <TriangleAlert />;
    text = failed > 0 ? `${failed}` : '';
    title = status.message ?? `${failed} cambio(s) no se pudieron guardar en el servidor. Revisa Ajustes.`;
  } else if (pending > 0) {
    icon = <CloudUpload />;
    text = `${pending}`;
    title = `${pending} cambio(s) por enviar`;
  } else if (status.phase === 'disabled') {
    icon = <CloudOff />;
    title = 'Sin sesión activa: trabajando solo con datos locales.';
  }

  return (
    <button className={cls} onClick={() => void syncNow()} title={title} aria-label={title}>
      {icon}
      {text && <span>{text}</span>}
    </button>
  );
}
