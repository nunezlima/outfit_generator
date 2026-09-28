// Ajustes: cuenta y sincronización, tema, categorías, reglas, presets,
// parámetros del análisis, respaldo, datos de ejemplo y caché.

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  HardDrive,
  Link2,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  RefreshCw,
  Shapes,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useSession } from '../app/auth';
import { useTheme, type ThemeChoice } from '../app/theme';
import { useFailedOps, useGarments, useOutboxCounts, usePrefs, usePresets } from '../data/hooks';
import { clearPhotoCache } from '../data/photos';
import { discardFailed, reorder, retryFailed, savePreset, softDelete, updatePrefs } from '../data/repo';
import { loadSampleData, removeSampleData } from '../data/sample';
import { syncNow, useSyncStatus } from '../data/sync';
import { EMPTY_FILTERS, type Preset } from '../domain/types';
import { CheckBox, NumberStepper, Page, Segmented } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { Sheet } from '../ui/Sheet';

export function SettingsScreen() {
  return (
    <Page title="Ajustes" back="/">
      <div className="stack-lg">
        <AccountSection />
        <AppearanceSection />
        <section className="stack" style={{ gap: 8 }}>
          <h2>Personalizar</h2>
          <div className="card-list">
            <Link to="/ajustes/categorias" className="list-item">
              <Shapes width={20} />
              <span className="grow">
                Categorías
                <span className="small muted" style={{ display: 'block' }}>
                  Posiciones, tipos y estilos
                </span>
              </span>
              <ChevronRight width={18} />
            </Link>
            <Link to="/ajustes/reglas" className="list-item">
              <Link2 width={20} />
              <span className="grow">
                Reglas de compatibilidad
                <span className="small muted" style={{ display: 'block' }}>
                  Matriz de estilos, tipos y excepciones
                </span>
              </span>
              <ChevronRight width={18} />
            </Link>
          </div>
        </section>
        <PresetsSection />
        <AnalysisPrefsSection />
        <BackupSection />
        <SampleSection />
        <StorageSection />
        <p className="hint center">Guardarropa v{__APP_VERSION__}</p>
      </div>
    </Page>
  );
}

function AccountSection() {
  const { email, offline } = useSession();
  const { signOut } = useAuth();
  const status = useSyncStatus();
  const { pending, failed } = useOutboxCounts();
  const failedOps = useFailedOps() ?? [];
  const { confirm, toast } = useFeedback();

  const logout = async () => {
    const ok = await confirm({
      title: 'Cerrar sesión',
      message:
        pending > 0
          ? `⚠️ Hay ${pending} cambio(s) que aún no llegan al servidor y se perderán. Conéctate a internet y espera a que se sincronicen antes de salir.`
          : 'Se borrará la copia local de este dispositivo. Tus datos siguen en la nube.',
      confirmText: 'Cerrar sesión',
      danger: pending > 0,
    });
    if (ok) await signOut();
  };

  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Cuenta</h2>
      <div className="card stack">
        <div className="spread">
          <div className="grow">
            <div className="ellipsis" style={{ fontWeight: 600 }}>
              {email}
            </div>
            <div className="small muted">
              {offline
                ? 'Modo sin conexión'
                : status.phase === 'syncing'
                  ? 'Sincronizando…'
                  : status.lastSyncAt
                    ? `Sincronizado ${new Date(status.lastSyncAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Aún no sincroniza'}
              {pending > 0 && ` · ${pending} por enviar`}
            </div>
          </div>
          <button className="btn sm" onClick={() => void syncNow().then(() => toast('Sincronización terminada'))}>
            <RefreshCw /> Sincronizar
          </button>
        </div>
        {status.message && <p className="small muted">{status.message}</p>}
        {failed > 0 && (
          <div className="callout danger">
            <TriangleAlert />
            <div className="grow stack" style={{ gap: 6 }}>
              <span>
                <b>{failed} cambio(s) fueron rechazados por el servidor.</b> Normalmente pasa si se borró algo en otro dispositivo.
              </span>
              <ul className="tiny">
                {failedOps.slice(0, 5).map((f) => (
                  <li key={f.seq}>
                    {f.kind === 'upsert' ? f.table : f.kind}: {f.error}
                  </li>
                ))}
              </ul>
              <div className="row">
                <button className="btn sm" onClick={() => void retryFailed()}>
                  Reintentar
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: 'Descartar cambios rechazados', message: 'Esos cambios no se guardarán en la nube.', confirmText: 'Descartar', danger: true })) await discardFailed();
                  }}
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}
        <button className="btn block" onClick={() => void logout()}>
          <LogOut /> Cerrar sesión
        </button>
      </div>
    </section>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Apariencia</h2>
      <Segmented<ThemeChoice>
        label="Tema"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: <span className="row" style={{ justifyContent: 'center', gap: 4 }}><Monitor width={15} /> Sistema</span> },
          { value: 'light', label: <span className="row" style={{ justifyContent: 'center', gap: 4 }}><Sun width={15} /> Claro</span> },
          { value: 'dark', label: <span className="row" style={{ justifyContent: 'center', gap: 4 }}><Moon width={15} /> Oscuro</span> },
        ]}
      />
    </section>
  );
}

function PresetsSection() {
  const presets = usePresets() ?? [];
  const { confirm, toast } = useFeedback();
  const [renaming, setRenaming] = useState<Preset | null>(null);
  const move = (i: number, d: -1 | 1) => {
    const list = [...presets];
    const [p] = list.splice(i, 1);
    list.splice(i + d, 0, p);
    void reorder('presets', list);
  };
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Presets del generador</h2>
      {presets.length === 0 ? (
        <p className="hint">Crea presets desde Generar con “Guardar preset”.</p>
      ) : (
        <div className="card-list">
          {presets.map((p, i) => (
            <div key={p.id} className="list-item">
              <span className="grow ellipsis">{p.name}</span>
              <button className="icon-btn sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </button>
              <button className="icon-btn sm" aria-label="Bajar" disabled={i === presets.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </button>
              <button className="icon-btn sm" aria-label={`Renombrar ${p.name}`} onClick={() => setRenaming(p)}>
                <Pencil />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`Eliminar ${p.name}`}
                onClick={async () => {
                  if (await confirm({ title: `¿Eliminar el preset “${p.name}”?`, confirmText: 'Eliminar', danger: true })) {
                    await softDelete('presets', [p]);
                    toast('Preset eliminado');
                  }
                }}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      {renaming && <RenameSheet preset={renaming} onClose={() => setRenaming(null)} />}
    </section>
  );
}

function RenameSheet({ preset, onClose }: { preset: Preset; onClose: () => void }) {
  const [name, setName] = useState(preset.name);
  return (
    <Sheet
      title="Renombrar preset"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={async () => {
            await savePreset(name, { ...EMPTY_FILTERS, ...preset.config }, preset);
            onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Nombre del preset" autoFocus />
    </Sheet>
  );
}

function AnalysisPrefsSection() {
  const prefs = usePrefs();
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Análisis</h2>
      <div className="card stack">
        <div className="spread">
          <div>
            <div>Mínimo de apariciones</div>
            <div className="hint">Antes de marcar una prenda como evitada</div>
          </div>
          <NumberStepper label="apariciones mínimas" value={prefs.minAppearances} min={1} max={100} onChange={(v) => void updatePrefs({ minAppearances: v })} />
        </div>
        <div className="divider" />
        <div className="spread">
          <div>
            <div>“Sin usar” después de</div>
            <div className="hint">Días sin ponértela</div>
          </div>
          <NumberStepper label="días sin usar" value={prefs.unusedDays} min={1} max={730} onChange={(v) => void updatePrefs({ unusedDays: v })} />
        </div>
        <div className="divider" />
        <div className="field">
          <label htmlFor="weak">Peso del rechazo débil (regenerar todo)</label>
          <select id="weak" className="select" value={String(prefs.weakRejectWeight)} onChange={(e) => void updatePrefs({ weakRejectWeight: Number(e.target.value) })}>
            <option value="0.1">0.1 — casi no cuenta</option>
            <option value="0.25">0.25 — recomendado</option>
            <option value="0.5">0.5 — cuenta la mitad</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="thr">Considerar “evitada” desde una tasa de</label>
          <select id="thr" className="select" value={String(prefs.avoidThreshold)} onChange={(e) => void updatePrefs({ avoidThreshold: Number(e.target.value) })}>
            {[0.3, 0.4, 0.5, 0.6, 0.7].map((v) => (
              <option key={v} value={v}>
                {Math.round(v * 100)} %
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function BackupSection() {
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);

  const doExport = async () => {
    try {
      setProgress('Preparando…');
      const { exportBackup } = await import('../data/backup');
      const blob = await exportBackup(setProgress);
      download(blob, `guardarropa-respaldo-${new Date().toISOString().slice(0, 10)}.zip`);
      toast('Respaldo descargado');
    } catch (e) {
      toast(`Error al exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  };

  const doImport = async () => {
    const file = pendingFile;
    if (!file) return;
    if (replace && !(await confirm({ title: '¿Reemplazar todo?', message: 'Se borrarán tus prendas, outfits, reglas y categorías actuales antes de importar.', confirmText: 'Reemplazar', danger: true }))) return;
    setPendingFile(null);
    try {
      setProgress('Importando…');
      const { importBackup } = await import('../data/backup');
      const r = await importBackup(file, replace, setProgress);
      toast(`Importado: ${r.rows} registros y ${r.photos} fotos${r.missingPhotos ? ` (${r.missingPhotos} fotos con error)` : ''}`, undefined, 6000);
    } catch (e) {
      toast(`Error al importar: ${e instanceof Error ? e.message : String(e)}`, undefined, 6000);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Respaldo</h2>
      <div className="card stack">
        <p className="small muted">Descarga todo (datos y fotos) en un .zip, o restáuralo. Guárdalo en un lugar privado: incluye tus fotos.</p>
        {progress ? (
          <p className="small">
            <RefreshCw className="spin" width={14} style={{ verticalAlign: -2 }} /> {progress}
          </p>
        ) : (
          <div className="btn-row">
            <button className="btn" onClick={() => void doExport()}>
              <Download /> Exportar
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload /> Importar
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {pendingFile && (
        <Sheet
          title="Importar respaldo"
          onClose={() => setPendingFile(null)}
          footer={
            <button className="btn primary" onClick={() => void doImport()}>
              <Upload /> Importar
            </button>
          }
        >
          <div className="stack">
            <p className="small">
              Archivo: <b>{pendingFile.name}</b>
            </p>
            <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => setReplace((v) => !v)}>
              <CheckBox on={replace} />
              <span className="grow">
                <b>Reemplazar todo</b>
                <span className="small muted" style={{ display: 'block' }}>
                  Recomendado para restaurar en una cuenta o proyecto nuevo (evita categorías duplicadas). Si no, se combinan.
                </span>
              </span>
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SampleSection() {
  const garments = useGarments() ?? [];
  const samples = garments.filter((g) => g.is_sample).length;
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Datos de ejemplo</h2>
      <div className="card stack">
        <p className="small muted">Prendas, outfits e historial ficticios para probar la app.</p>
        {samples > 0 ? (
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              if (!(await confirm({ title: 'Borrar datos de ejemplo', message: `Se eliminarán ${samples} prendas de ejemplo y lo que dependa solo de ellas. Tus prendas no se tocan.`, confirmText: 'Borrar', danger: true }))) return;
              setBusy(true);
              const n = await removeSampleData();
              setBusy(false);
              toast(`${n} prendas de ejemplo borradas`);
            }}
          >
            <Trash2 /> Borrar {samples} prendas de ejemplo
          </button>
        ) : (
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const n = await loadSampleData();
              setBusy(false);
              toast(`${n} prendas de ejemplo cargadas`);
            }}
          >
            <Sparkles /> Cargar datos de ejemplo
          </button>
        )}
      </div>
    </section>
  );
}

function StorageSection() {
  const { toast } = useFeedback();
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB usados en este dispositivo`))
      .catch(() => {});
  }, []);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>Almacenamiento</h2>
      <div className="card stack">
        {usage && <p className="small muted">{usage}</p>}
        <button className="btn" onClick={() => void clearPhotoCache().then((n) => toast(`${n} fotos borradas de la caché (se vuelven a descargar al verlas)`))}>
          <HardDrive /> Borrar caché de fotos
        </button>
      </div>
    </section>
  );
}
