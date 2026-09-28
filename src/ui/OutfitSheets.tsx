// Hojas compartidas: "Guardar outfit" y "Lo usé".

import { CalendarCheck, Save } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOutfit, markWorn } from '../data/repo';
import { formatLongDate, todayISO } from '../domain/dates';
import type { UUID } from '../domain/types';
import { CheckBox } from './common';
import { useFeedback } from './feedback';
import { Sheet } from './Sheet';

export function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text
      .split(',')
      .map((t) => t.trim().toLocaleLowerCase('es'))
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText('');
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <input
          className="input grow"
          placeholder="p. ej. oficina, verano"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          aria-label="Agregar etiqueta"
        />
      </div>
      {value.length > 0 && (
        <div className="chips">
          {value.map((t) => (
            <button key={t} type="button" className="chip on" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Quitar etiqueta ${t}`}>
              #{t} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaveOutfitSheet({ garmentIds, defaultName, onClose }: { garmentIds: UUID[]; defaultName: string; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [tags, setTags] = useState<string[]>([]);
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const save = async () => {
    const o = await createOutfit(name, garmentIds, tags);
    onClose();
    toast('Outfit guardado', { label: 'Ver', run: () => navigate(`/outfits/${o.id}`) });
  };
  return (
    <Sheet
      title="Guardar outfit"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={() => void save()} disabled={!name.trim()}>
          <Save /> Guardar
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="outfit-name">Nombre</label>
          <input id="outfit-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <span className="label">Etiquetas</span>
          <TagsInput value={tags} onChange={setTags} />
        </div>
      </div>
    </Sheet>
  );
}

/**
 * "Lo usé": registra el día, suma usos y manda al cesto lo que llegue a su
 * límite. Opcionalmente guarda el outfit si aún no estaba guardado.
 */
export function WearSheet({
  garmentIds,
  outfitId,
  defaultName,
  onClose,
  onDone,
}: {
  garmentIds: UUID[];
  outfitId: UUID | null;
  defaultName?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [alsoSave, setAlsoSave] = useState(false);
  const [name, setName] = useState(defaultName ?? '');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  const confirm = async () => {
    setBusy(true);
    let oid = outfitId;
    if (!oid && alsoSave && name.trim()) oid = (await createOutfit(name, garmentIds)).id;
    const moved = await markWorn(garmentIds, date, oid);
    onClose();
    onDone?.();
    const when = date === todayISO() ? 'hoy' : `el ${formatLongDate(date)}`;
    toast(moved.length ? `Registrado ${when}. Al cesto: ${moved.map((g) => g.name).join(', ')}.` : `Registrado ${when}.`, undefined, 5000);
  };

  return (
    <Sheet
      title="Lo usé"
      onClose={onClose}
      footer={
        <button className="btn primary" disabled={busy} onClick={() => void confirm()}>
          <CalendarCheck /> Confirmar
        </button>
      }
    >
      <div className="stack">
        <p className="muted small">Se suma un uso a cada prenda. Las que lleguen a su límite de usos pasan solas al cesto.</p>
        <div className="field">
          <label htmlFor="wear-date">¿Cuándo?</label>
          <input id="wear-date" className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </div>
        {!outfitId && (
          <>
            <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => setAlsoSave((v) => !v)}>
              <CheckBox on={alsoSave} />
              <span>Guardar también como outfit</span>
            </button>
            {alsoSave && <input className="input" value={name} placeholder="Nombre del outfit" onChange={(e) => setName(e.target.value)} aria-label="Nombre del outfit" />}
          </>
        )}
      </div>
    </Sheet>
  );
}
