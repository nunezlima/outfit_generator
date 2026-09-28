// Piezas pequeñas reutilizables de la interfaz.

import { Check, ChevronLeft, Minus, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SyncIndicator } from './SyncIndicator';

export function Page({ title, back, actions, children }: { title: string; back?: boolean | string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <>
      <header className="header">
        {back && (
          <button
            className="icon-btn back"
            aria-label="Volver"
            onClick={() => (typeof back === 'string' ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            <ChevronLeft />
          </button>
        )}
        <h1>{title}</h1>
        <SyncIndicator />
        {actions}
      </header>
      <main className="main">{children}</main>
    </>
  );
}

export function Chip({ on, onClick, children, title }: { on?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on} title={title}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | null>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function CheckBox({ on }: { on: boolean }) {
  return <span className={`check${on ? ' on' : ''}`}>{on && <Check strokeWidth={3} />}</span>;
}

export function NumberStepper({ value, onChange, min = 0, max = 999, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min));
  return (
    <div className="number-stepper">
      <button type="button" className="icon-btn sm" aria-label={`Menos ${label}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
        <Minus />
      </button>
      <input type="number" inputMode="numeric" aria-label={label} value={value} min={min} max={max} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      <button type="button" className="icon-btn sm" aria-label={`Más ${label}`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
        <Plus />
      </button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Search />
      <input className="input" type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} className={t.value === value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: ReactNode; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon}</div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return <div className="loading-screen">{text}</div>;
}

/** Normaliza texto para buscar sin importar mayúsculas ni acentos. */
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
