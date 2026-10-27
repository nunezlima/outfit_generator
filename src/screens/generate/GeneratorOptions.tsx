// Opciones antes de generar: evento (y ocasión), estilo objetivo, clima de la
// ropa, prendas participantes y prendas fijadas.

import { ChevronDown, ChevronUp, CloudRain, Pin, Settings, SlidersHorizontal, Snowflake, Sun, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGeneratorState } from '../../app/generatorState';
import { activeOccasion, countParticipants } from '../../domain/generator';
import { WEATHER_LABELS, type Garment, type Occasion, type UUID } from '../../domain/types';
import { useCatalogIndex } from '../../ui/CatalogContext';
import { CheckBox, Chip, Segmented, Tabs } from '../../ui/common';
import { GarmentPicker } from '../../ui/GarmentPicker';
import { GarmentCard, GarmentPhoto } from '../../ui/GarmentViews';
import { Sheet } from '../../ui/Sheet';

const WEATHER_ICON = { sun: Sun, rain: CloudRain, cold: Snowflake };

export function GeneratorOptions({ garments }: { garments: Garment[] }) {
  const idx = useCatalogIndex();
  const gen = useGeneratorState();
  const [open, setOpen] = useState(false);
  const [participants, setParticipants] = useState(false);
  const [pinPicker, setPinPicker] = useState(false);
  const f = gen.filters;

  const counts = useMemo(() => countParticipants({ garments, catalog: idx.catalog, filters: f }), [garments, idx.catalog, f]);
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const pinned = gen.pinned.map((id) => byId.get(id)).filter((g): g is Garment => !!g);
  const available = garments.filter((g) => g.status === 'available');

  const { events, occasions, styles } = idx.catalog;
  const occasion = activeOccasion(idx.catalog, f);
  const eventsWithOccasions = events.filter((e) => occasions.some((o) => o.event_id === e.id));
  const activeEvent = occasion ? events.find((e) => e.id === occasion.event_id) : undefined;
  const siblings = occasion ? occasions.filter((o) => o.event_id === occasion.event_id) : [];
  const allowedIds = occasion && occasion.style_ids.length > 0 ? new Set(occasion.style_ids) : null;
  const styleOptions = allowedIds ? styles.filter((s) => allowedIds.has(s.id)) : styles;

  const update = (patch: Partial<typeof f>) => gen.setFilters({ ...f, ...patch });
  const chooseOccasion = (o: Occasion | null) => {
    // El estilo objetivo solo se conserva si la nueva ocasión lo permite.
    const keepTarget = !o || !f.targetStyleId || o.style_ids.length === 0 || o.style_ids.includes(f.targetStyleId);
    update({ occasionId: o?.id ?? null, targetStyleId: keepTarget ? f.targetStyleId : null });
  };
  const chooseEvent = (eventId: UUID) => {
    const first = occasions.find((o) => o.event_id === eventId);
    if (first) chooseOccasion(first);
  };

  const summary: string[] = [];
  if (f.targetStyleId) summary.push(idx.styleById.get(f.targetStyleId)?.name ?? '');
  if (f.weather) summary.push(WEATHER_LABELS[f.weather]);
  summary.push(`${counts.eligible} de ${counts.available} prendas`);

  return (
    <div className="card stack">
      {eventsWithOccasions.length === 0 ? (
        <p className="hint row" style={{ gap: 6 }}>
          <Settings width={14} />
          <span>
            Crea tus eventos en <Link to="/ajustes/eventos">Ajustes → Eventos y perfumes</Link> para elegir estilos y perfume según la ocasión.
          </span>
        </p>
      ) : (
        <div className="chips scroll" role="group" aria-label="Evento">
          <Chip on={!occasion} onClick={() => chooseOccasion(null)}>
            Todo
          </Chip>
          {eventsWithOccasions.map((e) => (
            <Chip key={e.id} on={activeEvent?.id === e.id} onClick={() => chooseEvent(e.id)}>
              {e.name}
            </Chip>
          ))}
        </div>
      )}

      {siblings.length > 1 && (
        <div className="chips" role="group" aria-label="Ocasión">
          {siblings.map((o) => (
            <Chip key={o.id} on={o.id === occasion?.id} onClick={() => chooseOccasion(o)}>
              {o.name}
            </Chip>
          ))}
        </div>
      )}
      {occasion && (
        <p className="hint">
          {siblings.length > 1 ? '' : `${occasion.name} · `}
          {allowedIds ? `Estilos: ${idx.styleNames(occasion.style_ids).join(', ')}` : 'Cualquier estilo'}
        </p>
      )}

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
              <option value="">{occasion && allowedIds ? 'Cualquiera de los del evento' : 'Cualquiera (según las reglas)'}</option>
              {styleOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  Solo {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Clima (ropa)</span>
            <Segmented
              label="Clima de la ropa"
              value={f.weather}
              onChange={(weather) => update({ weather })}
              options={[
                { value: null, label: 'Cualquiera' },
                { value: 'sun', label: 'Sol' },
                { value: 'rain', label: 'Lluvia' },
                { value: 'cold', label: 'Frío' },
              ]}
            />
            <span className="hint row" style={{ gap: 6 }}>
              {f.weather && (() => {
                const Icon = WEATHER_ICON[f.weather];
                return <Icon width={14} />;
              })()}
              {f.weather === 'sun' && 'Prendas de sol y de todo el año; sin capas encima.'}
              {f.weather === 'rain' && 'Prendas de todo el año; siempre lleva capa exterior (la que tú prefieras).'}
              {f.weather === 'cold' && 'Prendas de frío y de todo el año; se agregan capas.'}
              {!f.weather && 'No filtra por clima.'}
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
    gen.setFilters({ ...f, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };
  const setAll = (key: 'excludedTypeIds' | 'excludedStyleIds' | 'excludedGarmentIds', ids: UUID[], include: boolean) => {
    const set = new Set(f[key]);
    for (const id of ids) {
      if (include) set.delete(id);
      else set.add(id);
    }
    gen.setFilters({ ...f, [key]: [...set] });
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
