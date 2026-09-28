// Opciones antes de generar: preset, estilo objetivo, clima, prendas
// participantes y prendas fijadas.

import { Bookmark, ChevronDown, ChevronUp, CloudSun, Flame, Pin, Plus, Snowflake, SlidersHorizontal, X } from 'lucide-react';

const WEATHER_ICON = { hot: Flame, mild: CloudSun, cold: Snowflake };
import { useMemo, useState } from 'react';
import { useGeneratorState } from '../../app/generatorState';
import { usePresets } from '../../data/hooks';
import { savePreset } from '../../data/repo';
import { countParticipants } from '../../domain/generator';
import { EMPTY_FILTERS, type Garment, type GeneratorFilters, type Preset, type UUID } from '../../domain/types';
import { useCatalogIndex } from '../../ui/CatalogContext';
import { CheckBox, Chip, Segmented, Tabs } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { GarmentPicker } from '../../ui/GarmentPicker';
import { GarmentCard, GarmentPhoto } from '../../ui/GarmentViews';
import { Sheet } from '../../ui/Sheet';

const sameFilters = (a: Partial<GeneratorFilters>, b: GeneratorFilters) => JSON.stringify({ ...EMPTY_FILTERS, ...a }) === JSON.stringify(b);

export function GeneratorOptions({ garments }: { garments: Garment[] }) {
  const idx = useCatalogIndex();
  const gen = useGeneratorState();
  const presets = usePresets() ?? [];
  const [open, setOpen] = useState(false);
  const [participants, setParticipants] = useState(false);
  const [pinPicker, setPinPicker] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const f = gen.filters;

  const counts = useMemo(() => countParticipants({ garments, catalog: idx.catalog, filters: f }), [garments, idx.catalog, f]);
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const pinned = gen.pinned.map((id) => byId.get(id)).filter((g): g is Garment => !!g);
  const available = garments.filter((g) => g.status === 'available');
  const activePreset = presets.find((p) => p.id === gen.presetId && sameFilters(p.config, f));

  const update = (patch: Partial<GeneratorFilters>) => gen.setFilters({ ...f, ...patch }, null);
  const applyPreset = (p: Preset | null) => (p ? gen.setFilters({ ...EMPTY_FILTERS, ...p.config }, p.id) : gen.setFilters(EMPTY_FILTERS, null));

  const summary: string[] = [];
  if (f.targetStyleId) summary.push(idx.styleById.get(f.targetStyleId)?.name ?? '');
  if (f.weather) summary.push({ hot: 'Calor', mild: 'Templado', cold: 'Frío' }[f.weather]);
  summary.push(`${counts.eligible} de ${counts.available} prendas`);

  return (
    <div className="card stack">
      <div className="chips scroll">
        <Chip on={!activePreset && sameFilters(EMPTY_FILTERS, f)} onClick={() => applyPreset(null)}>
          Todo
        </Chip>
        {presets.map((p) => (
          <Chip key={p.id} on={activePreset?.id === p.id} onClick={() => applyPreset(p)}>
            <Bookmark /> {p.name}
          </Chip>
        ))}
        <Chip onClick={() => setSavingPreset(true)} title="Guardar la selección actual como preset">
          <Plus /> Guardar preset
        </Chip>
      </div>

      <button type="button" className="spread" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="row small">
          <SlidersHorizontal width={18} height={18} />
          <span className="muted">{summary.filter(Boolean).join(' · ')}</span>
        </span>
        {open ? <ChevronUp width={20} /> : <ChevronDown width={20} />}
      </button>

      {open && (
        <div className="stack">
          <div className="field">
            <label htmlFor="target-style">Estilo objetivo</label>
            <select id="target-style" className="select" value={f.targetStyleId ?? ''} onChange={(e) => update({ targetStyleId: e.target.value || null })}>
              <option value="">Cualquiera (según las reglas)</option>
              {idx.catalog.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  Solo {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Clima</span>
            <Segmented
              label="Clima"
              value={f.weather}
              onChange={(weather) => update({ weather })}
              options={[
                { value: null, label: 'Cualquiera' },
                { value: 'hot', label: 'Calor' },
                { value: 'mild', label: 'Templado' },
                { value: 'cold', label: 'Frío' },
              ]}
            />
            <span className="hint row" style={{ gap: 6 }}>
              {f.weather && (() => {
                const Icon = WEATHER_ICON[f.weather];
                return <Icon width={14} />;
              })()}
              {f.weather === 'hot' && 'Sin prendas abrigadoras ni capa exterior.'}
              {f.weather === 'mild' && 'Sin prendas abrigadoras; capa exterior opcional.'}
              {f.weather === 'cold' && 'Nada ligero abajo ni en los pies; se agrega capa exterior.'}
              {!f.weather && 'No filtra por nivel de abrigo.'}
            </span>
          </div>
          <button type="button" className="btn block" onClick={() => setParticipants(true)}>
            <SlidersHorizontal /> Prendas participantes ({counts.eligible})
          </button>
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <div className="spread">
          <span className="label">Prendas fijadas</span>
          <button type="button" className="btn sm soft" onClick={() => setPinPicker(true)}>
            <Pin /> Fijar
          </button>
        </div>
        {pinned.length === 0 ? (
          <p className="hint">Fija una prenda (“quiero usar esta camisa”) y el resto se genera alrededor.</p>
        ) : (
          <div className="chips">
            {pinned.map((g) => (
              <span key={g.id} className="chip on" style={{ paddingLeft: 4 }}>
                <GarmentPhoto garment={g} className="thumb sm" />
                <span className="ellipsis" style={{ maxWidth: 140 }}>
                  {g.name}
                </span>
                <button type="button" className="icon-btn sm" aria-label={`Desfijar ${g.name}`} onClick={() => gen.setPinned(gen.pinned.filter((x) => x !== g.id))}>
                  <X />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {participants && <ParticipantsSheet garments={available} onClose={() => setParticipants(false)} />}
      {pinPicker && (
        <GarmentPicker
          title="Fijar prendas"
          garments={available}
          multiple
          initial={gen.pinned}
          confirmText="Fijar"
          onClose={() => setPinPicker(false)}
          onDone={(ids) => {
            gen.setPinned(ids);
            setPinPicker(false);
          }}
        />
      )}
      {savingPreset && <SavePresetSheet current={presets.find((p) => p.id === gen.presetId)} onClose={() => setSavingPreset(false)} />}
    </div>
  );
}

function ParticipantsSheet({ garments, onClose }: { garments: Garment[]; onClose: () => void }) {
  const idx = useCatalogIndex();
  const gen = useGeneratorState();
  const [tab, setTab] = useState<'types' | 'styles' | 'garments'>('types');
  const f = gen.filters;
  const toggle = (key: 'excludedTypeIds' | 'excludedStyleIds' | 'excludedGarmentIds', id: UUID) => {
    const list = f[key];
    gen.setFilters({ ...f, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }, null);
  };
  const setAll = (key: 'excludedTypeIds' | 'excludedStyleIds' | 'excludedGarmentIds', ids: UUID[], include: boolean) => {
    const set = new Set(f[key]);
    for (const id of ids) {
      if (include) set.delete(id);
      else set.add(id);
    }
    gen.setFilters({ ...f, [key]: [...set] }, null);
  };

  return (
    <Sheet
      title="Prendas participantes"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Listo
        </button>
      }
    >
      <div className="stack">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'types', label: 'Tipos' },
            { value: 'styles', label: 'Estilos' },
            { value: 'garments', label: 'Prendas' },
          ]}
        />
        {tab === 'types' &&
          idx.catalog.positions.map((p) => {
            const types = idx.catalog.types.filter((t) => t.position_id === p.id);
            if (types.length === 0) return null;
            return (
              <div key={p.id} className="stack" style={{ gap: 6 }}>
                <div className="spread">
                  <h3>{p.name}</h3>
                  <div className="row">
                    <button className="btn sm ghost" onClick={() => setAll('excludedTypeIds', types.map((t) => t.id), true)}>
                      Todos
                    </button>
                    <button className="btn sm ghost" onClick={() => setAll('excludedTypeIds', types.map((t) => t.id), false)}>
                      Ninguno
                    </button>
                  </div>
                </div>
                <div className="chips">
                  {types.map((t) => (
                    <Chip key={t.id} on={!f.excludedTypeIds.includes(t.id)} onClick={() => toggle('excludedTypeIds', t.id)}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        {tab === 'styles' && (
          <>
            <p className="hint">Una prenda con varios estilos sigue participando mientras le quede alguno seleccionado.</p>
            <div className="card-list">
              {idx.catalog.styles.map((s) => (
                <button key={s.id} className="list-item" onClick={() => toggle('excludedStyleIds', s.id)}>
                  <CheckBox on={!f.excludedStyleIds.includes(s.id)} />
                  <span className="grow">{s.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'garments' && (
          <>
            <p className="hint">Toca una prenda para quitarla o volver a incluirla. (Solo se muestran las disponibles.)</p>
            <div className="garment-grid">
              {garments.map((g) => {
                const on = !f.excludedGarmentIds.includes(g.id);
                return <GarmentCard key={g.id} garment={g} dim={!on} selected={on} onClick={() => toggle('excludedGarmentIds', g.id)} corner={on ? null : <span className="badge">Fuera</span>} />;
              })}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SavePresetSheet({ current, onClose }: { current?: Preset; onClose: () => void }) {
  const gen = useGeneratorState();
  const { toast } = useFeedback();
  const [name, setName] = useState(current?.name ?? '');
  const [overwrite, setOverwrite] = useState(!!current);
  const save = async () => {
    const p = await savePreset(name, gen.filters, overwrite ? current : undefined);
    gen.setFilters(gen.filters, p.id);
    toast(`Preset “${p.name}” guardado`);
    onClose();
  };
  return (
    <Sheet
      title="Guardar preset"
      onClose={onClose}
      footer={
        <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
          <Bookmark /> Guardar
        </button>
      }
    >
      <div className="stack">
        <p className="muted small">Guarda el estilo objetivo, el clima y las prendas, tipos y estilos deseleccionados.</p>
        <div className="field">
          <label htmlFor="preset-name">Nombre</label>
          <input id="preset-name" className="input" value={name} maxLength={60} placeholder="p. ej. Verano, Oficina" onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {current && (
          <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => setOverwrite((v) => !v)}>
            <CheckBox on={overwrite} />
            <span>Reemplazar “{current.name}” (si no, se crea uno nuevo)</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
