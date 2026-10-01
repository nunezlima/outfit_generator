// Crear / editar prenda. Al crear, "Guardar y agregar otra" deja el tipo,
// los estilos y el abrigo listos para cargar muchas prendas seguidas.

import { Ban, Check, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { wardrobePath } from '../app/wardrobeView';
import { useGarment } from '../data/hooks';
import { createGarment, setGarmentPhoto, updateGarment, type GarmentDraft } from '../data/repo';
import { PALETTE } from '../domain/colors';
import { CLIMATE_LABELS, STATUS_LABELS, WARMTH_LABELS, type Climate, type Garment, type GarmentStatus, type Warmth } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { Chip, Loading, NumberStepper, Page, Segmented } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto } from '../ui/GarmentViews';
import { PhotoInput } from '../ui/PhotoInput';

const EMPTY: GarmentDraft = { name: '', type_id: '', style_ids: [], color: null, warmth: 'medium', climate: 'all', wash_after_uses: 1, status: 'available', notes: null };

function pickDraft(g: Garment): GarmentDraft {
  const { name, type_id, style_ids, color, warmth, wash_after_uses, status, notes } = g;
  return { name, type_id, style_ids, color, warmth, climate: g.climate ?? 'all', wash_after_uses, status, notes };
}

export function GarmentFormScreen() {
  const { id } = useParams();
  const existing = useGarment(id);
  if (id && existing === undefined) return <Loading />;
  if (id && existing === null) return <Page title="Prenda" back={wardrobePath()}><p className="muted">Esta prenda ya no existe.</p></Page>;
  return <GarmentForm key={id ?? 'new'} existing={existing ?? null} />;
}

function GarmentForm({ existing }: { existing: Garment | null }) {
  const idx = useCatalogIndex();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<GarmentDraft>(() => (existing ? pickDraft(existing) : { ...EMPTY }));
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const set = <K extends keyof GarmentDraft>(k: K, v: GarmentDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const chooseType = (typeId: string) => {
    const t = idx.typeById.get(typeId);
    setDraft((d) => ({
      ...d,
      type_id: typeId,
      // Al crear, proponemos los valores del tipo (se pueden cambiar).
      ...(existing || !t ? {} : { wash_after_uses: t.default_wash_uses, warmth: t.default_warmth }),
    }));
  };

  const errors = {
    name: !draft.name.trim() ? 'Ponle un nombre.' : null,
    type: !draft.type_id ? 'Elige el tipo.' : null,
    styles: draft.style_ids.length === 0 ? 'Elige al menos un estilo.' : null,
  };
  const valid = !errors.name && !errors.type && !errors.styles;

  const save = async (andContinue: boolean) => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (existing) {
        let g = await updateGarment(existing, draft);
        if (photo) g = await setGarmentPhoto(g, photo);
        else if (removePhoto && g.photo_path) g = await setGarmentPhoto(g, null);
        toast('Cambios guardados');
        navigate(`/guardarropa/${g.id}`, { replace: true });
        return;
      }
      const g = await createGarment(draft, photo);
      if (andContinue) {
        toast(`“${g.name}” guardada. Sigue con la siguiente.`);
        setSavedCount((n) => n + 1);
        setDraft((d) => ({ ...d, name: '', color: null, notes: null }));
        setPhoto(null);
        setTouched(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => nameRef.current?.focus(), 50);
      } else {
        toast(`“${g.name}” guardada`);
        navigate(`/guardarropa/${g.id}`, { replace: true });
      }
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const showCurrent = existing && !photo && !removePhoto && existing.photo_path;

  return (
    <Page title={existing ? 'Editar prenda' : savedCount ? `Nueva prenda (${savedCount} guardadas)` : 'Nueva prenda'} back>
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="photo-editor">
          {previewUrl ? (
            <div className="photo">
              <img src={previewUrl} alt="Vista previa" />
            </div>
          ) : showCurrent ? (
            <GarmentPhoto garment={existing} />
          ) : (
            <GarmentPhoto garment={{ ...draft, photo_path: null, type_id: draft.type_id }} />
          )}
          <div className="stack" style={{ gap: 8 }}>
            <PhotoInput
              compact
              onFile={(f) => {
                setPhoto(f);
                setRemovePhoto(false);
              }}
            />
            {(photo || showCurrent) && (
              <button
                type="button"
                className="btn sm ghost danger"
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                }}
              >
                <Trash2 /> Quitar foto
              </button>
            )}
            <span className="hint">Se reduce a máx. 1200 px antes de subirse.</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="g-name">Nombre *</label>
          <input
            id="g-name"
            ref={nameRef}
            className={`input${touched && errors.name ? ' invalid' : ''}`}
            value={draft.name}
            maxLength={80}
            placeholder="p. ej. Camisa blanca de lino"
            onChange={(e) => set('name', e.target.value)}
            autoFocus={!existing}
          />
          {touched && errors.name && <span className="error-text">{errors.name}</span>}
        </div>

        <div className="field">
          <label htmlFor="g-type">Tipo *</label>
          <select id="g-type" className="select" value={draft.type_id} onChange={(e) => chooseType(e.target.value)}>
            <option value="">Elige…</option>
            {idx.catalog.positions.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {idx.catalog.types
                  .filter((t) => t.position_id === p.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {touched && errors.type && <span className="error-text">{errors.type}</span>}
        </div>

        <div className="field">
          <span className="label">Estilos * (uno o varios)</span>
          <div className="chips">
            {idx.catalog.styles.map((s) => {
              const on = draft.style_ids.includes(s.id);
              return (
                <Chip key={s.id} on={on} onClick={() => set('style_ids', on ? draft.style_ids.filter((x) => x !== s.id) : [...draft.style_ids, s.id])}>
                  {on && <Check />} {s.name}
                </Chip>
              );
            })}
          </div>
          {touched && errors.styles && <span className="error-text">{errors.styles}</span>}
        </div>

        <div className="field">
          <span className="label">Color principal (opcional)</span>
          <div className="swatch-picker">
            <button type="button" className={`swatch-btn none${draft.color === null ? ' on' : ''}`} onClick={() => set('color', null)} title="Sin color" aria-label="Sin color">
              <Ban width={18} />
            </button>
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c.key}
                className={`swatch-btn${draft.color === c.key ? ' on' : ''}`}
                style={{ background: c.hex }}
                title={c.label}
                aria-label={c.label}
                aria-pressed={draft.color === c.key}
                onClick={() => set('color', c.key)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Nivel de abrigo</span>
          <Segmented<Warmth>
            label="Nivel de abrigo"
            value={draft.warmth}
            onChange={(v) => set('warmth', v)}
            options={(Object.keys(WARMTH_LABELS) as Warmth[]).map((w) => ({ value: w, label: WARMTH_LABELS[w] }))}
          />
        </div>

        <div className="field">
          <span className="label">Clima</span>
          <Segmented<Climate>
            label="Clima"
            value={draft.climate}
            onChange={(v) => set('climate', v)}
            options={(Object.keys(CLIMATE_LABELS) as Climate[]).map((c) => ({ value: c, label: CLIMATE_LABELS[c] }))}
          />
          <span className="hint">“Todo el año” sale con cualquier clima; “Calor” y “Frío” solo en esos días.</span>
        </div>

        <div className="spread">
          <div>
            <div className="label">Usos antes de lavar</div>
            <div className="hint">{draft.wash_after_uses === 0 ? 'Nunca va al cesto sola' : `Pasa al cesto después de ${draft.wash_after_uses} ${draft.wash_after_uses === 1 ? 'uso' : 'usos'}`}</div>
          </div>
          <NumberStepper label="usos antes de lavar" value={draft.wash_after_uses} onChange={(v) => set('wash_after_uses', v)} />
        </div>

        {existing && (
          <div className="field">
            <span className="label">Estado</span>
            <Segmented<GarmentStatus>
              label="Estado"
              value={draft.status}
              onChange={(v) => set('status', v)}
              options={(Object.keys(STATUS_LABELS) as GarmentStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="g-notes">Notas (opcional)</label>
          <textarea id="g-notes" className="textarea" maxLength={1000} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="stack">
          {!existing && (
            <button type="button" className="btn primary big block" disabled={busy} onClick={() => void save(true)}>
              <Plus /> Guardar y agregar otra
            </button>
          )}
          <button type="submit" className={`btn big block ${existing ? 'primary' : ''}`} disabled={busy}>
            <Save /> {existing ? 'Guardar cambios' : 'Guardar y terminar'}
          </button>
        </div>
      </form>
    </Page>
  );
}
