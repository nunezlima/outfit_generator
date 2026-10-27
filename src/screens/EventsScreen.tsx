// Eventos y perfumes.
//
// · Eventos: cada uno es un botón en Generar. Sus ocasiones deciden qué
//   estilos de ropa se permiten y qué perfume se sugiere en calor, templado y
//   frío (el primero de cada lista es el principal; los demás, secundarios).
// · Perfumes: tu colección. Archivar = ya no se sugiere.

import { ArrowDown, ArrowUp, ChevronRight, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePerfumes } from '../data/hooks';
import { createEvent, createOccasion, createPerfume, deleteEvent, deleteOccasion, deletePerfume, renameEvent, reorder, saveOccasion, updatePerfume } from '../data/repo';
import { PERFUME_CLIMATES, perfumeColumn, perfumeIdsFor, perfumeUseCount } from '../domain/perfumes';
import { PERFUME_CLIMATE_LABELS, type Occasion, type OutfitEvent, type Perfume, type PerfumeClimate, type UUID } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { CheckBox, Chip, EmptyState, Page, Tabs } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { PerfumeIcon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';

type Tab = 'events' | 'perfumes';

export function EventsScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('t') as Tab) ?? 'events';
  return (
    <Page title="Eventos y perfumes" back="/ajustes">
      <div className="stack">
        <Tabs
          value={tab}
          onChange={(t) => setParams({ t }, { replace: true })}
          tabs={[
            { value: 'events', label: 'Eventos' },
            { value: 'perfumes', label: 'Perfumes' },
          ]}
        />
        {tab === 'events' && <EventsTab />}
        {tab === 'perfumes' && <PerfumesTab />}
      </div>
    </Page>
  );
}

function MoveButtons<T>({ list, i, onMove, label = '' }: { list: T[]; i: number; onMove: (list: T[]) => void; label?: string }) {
  const move = (d: -1 | 1) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onMove(next);
  };
  return (
    <>
      <button type="button" className="icon-btn sm" aria-label={`Subir ${label}`.trim()} disabled={i === 0} onClick={() => move(-1)}>
        <ArrowUp />
      </button>
      <button type="button" className="icon-btn sm" aria-label={`Bajar ${label}`.trim()} disabled={i === list.length - 1} onClick={() => move(1)}>
        <ArrowDown />
      </button>
    </>
  );
}

// ─── Eventos ───────────────────────────────────────────────────────────────

type OccasionEdit = { occasion: Occasion } | { eventId: UUID };

function EventsTab() {
  const idx = useCatalogIndex();
  const perfumes = usePerfumes() ?? [];
  const { confirm, toast } = useFeedback();
  const [editingEvent, setEditingEvent] = useState<OutfitEvent | 'new' | null>(null);
  const [editingOccasion, setEditingOccasion] = useState<OccasionEdit | null>(null);
  const { events, occasions } = idx.catalog;
  const nameOf = new Map(perfumes.map((p) => [p.id, p.name]));

  const perfumeSummary = (o: Occasion) =>
    PERFUME_CLIMATES.map((c) => {
      const ids = perfumeIdsFor(o, c);
      const first = ids.length ? (nameOf.get(ids[0]) ?? '¿?') : '—';
      return `${PERFUME_CLIMATE_LABELS[c]}: ${first}${ids.length > 1 ? ` +${ids.length - 1}` : ''}`;
    }).join(' · ');

  const remove = async (e: OutfitEvent, count: number) => {
    const ok = await confirm({
      title: `¿Eliminar el evento “${e.name}”?`,
      message: count > 0 ? `También se borran sus ${count === 1 ? 'ocasión' : `${count} ocasiones`}. Tus perfumes no se tocan.` : undefined,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deleteEvent(e);
    toast('Evento eliminado');
  };

  return (
    <>
      <p className="hint">
        Cada evento es un botón en <b>Generar</b>. Sus ocasiones deciden qué estilos de ropa se permiten y qué perfume se sugiere en calor, templado y frío. El primero de cada lista es el
        principal; los demás, secundarios.
      </p>
      {events.length === 0 && <EmptyState icon={<PerfumeIcon />} title="Aún no tienes eventos" text="Crea uno, p. ej. “Pulcro” con la ocasión “Oficina”." />}
      {events.map((e, i) => {
        const list = occasions.filter((o) => o.event_id === e.id);
        return (
          <section key={e.id} className="stack" style={{ gap: 6 }}>
            <div className="spread">
              <h3 className="grow ellipsis">{e.name}</h3>
              <MoveButtons list={events} i={i} label={e.name} onMove={(l) => void reorder('outfit_events', l)} />
              <button type="button" className="icon-btn sm" aria-label={`Renombrar ${e.name}`} onClick={() => setEditingEvent(e)}>
                <Pencil />
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Eliminar ${e.name}`} onClick={() => void remove(e, list.length)}>
                <Trash2 />
              </button>
            </div>
            <div className="card-list">
              {list.map((o) => (
                <button key={o.id} type="button" className="list-item" onClick={() => setEditingOccasion({ occasion: o })}>
                  <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{o.name}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {o.style_ids.length ? idx.styleNames(o.style_ids).join(', ') : 'Cualquier estilo'}
                    </span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {perfumeSummary(o)}
                    </span>
                  </span>
                  <ChevronRight width={18} />
                </button>
              ))}
              <button type="button" className="list-item" onClick={() => setEditingOccasion({ eventId: e.id })}>
                <Plus width={18} />
                <span className="grow" style={{ textAlign: 'left' }}>
                  Agregar ocasión
                </span>
              </button>
            </div>
          </section>
        );
      })}
      <button type="button" className="btn block" onClick={() => setEditingEvent('new')}>
        <Plus /> Nuevo evento
      </button>
      {editingEvent && (
        <EventSheet
          event={editingEvent === 'new' ? null : editingEvent}
          onClose={() => setEditingEvent(null)}
          onCreated={(o) => {
            setEditingEvent(null);
            setEditingOccasion({ occasion: o });
          }}
        />
      )}
      {editingOccasion && <OccasionSheet edit={editingOccasion} onClose={() => setEditingOccasion(null)} />}
    </>
  );
}

function EventSheet({ event, onClose, onCreated }: { event: OutfitEvent | null; onClose: () => void; onCreated: (first: Occasion) => void }) {
  const [name, setName] = useState(event?.name ?? '');
  const save = async () => {
    if (event) {
      await renameEvent(event, name);
      onClose();
    } else {
      const { occasion } = await createEvent(name);
      onCreated(occasion);
    }
  };
  return (
    <Sheet
      title={event ? 'Renombrar evento' : 'Nuevo evento'}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
          {event ? 'Guardar' : 'Crear'}
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="event-name">Nombre</label>
          <input id="event-name" className="input" value={name} maxLength={60} placeholder="p. ej. Pulcro" onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {!event && <p className="hint">Se crea con una primera ocasión del mismo nombre; después eliges sus estilos y perfumes.</p>}
      </div>
    </Sheet>
  );
}

type Lists = Record<PerfumeClimate, UUID[]>;

function OccasionSheet({ edit, onClose }: { edit: OccasionEdit; onClose: () => void }) {
  const idx = useCatalogIndex();
  const perfumes = usePerfumes() ?? [];
  const { confirm, toast } = useFeedback();
  const existing = 'occasion' in edit ? edit.occasion : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [eventId, setEventId] = useState<UUID>(existing?.event_id ?? ('eventId' in edit ? edit.eventId : ''));
  const [styleIds, setStyleIds] = useState<UUID[]>(existing?.style_ids ?? []);
  const [lists, setLists] = useState<Lists>(() => ({
    hot: existing ? perfumeIdsFor(existing, 'hot') : [],
    mild: existing ? perfumeIdsFor(existing, 'mild') : [],
    cold: existing ? perfumeIdsFor(existing, 'cold') : [],
  }));

  const toggleStyle = (id: UUID) => setStyleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const setList = (c: PerfumeClimate, ids: UUID[]) => setLists((l) => ({ ...l, [c]: ids }));
  const copyToAll = (c: PerfumeClimate) => setLists((l) => ({ hot: [...l[c]], mild: [...l[c]], cold: [...l[c]] }));

  const save = async () => {
    // Estilos en el orden del catálogo, sin estilos borrados.
    const styles = idx.catalog.styles.filter((s) => styleIds.includes(s.id)).map((s) => s.id);
    const base = existing ?? (await createOccasion(eventId, name));
    const next: Occasion = { ...base, name, event_id: eventId, style_ids: styles };
    for (const c of PERFUME_CLIMATES) next[perfumeColumn(c)] = lists[c];
    await saveOccasion(next);
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm({ title: `¿Eliminar la ocasión “${existing.name}”?`, confirmText: 'Eliminar', danger: true }))) return;
    await deleteOccasion(existing);
    toast('Ocasión eliminada');
    onClose();
  };

  return (
    <Sheet
      title={existing ? 'Editar ocasión' : 'Nueva ocasión'}
      onClose={onClose}
      footer={
        <div className="btn-row">
          {existing && (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Trash2 /> Eliminar
            </button>
          )}
          <button type="button" className="btn primary" disabled={!name.trim() || !eventId} onClick={() => void save()}>
            Guardar
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="occ-name">Nombre</label>
          <input id="occ-name" className="input" value={name} maxLength={60} placeholder="p. ej. Oficina" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="occ-event">Evento</label>
          <select id="occ-event" className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {idx.catalog.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Estilos de ropa permitidos</span>
          <div className="chips">
            {idx.catalog.styles.map((s) => (
              <Chip key={s.id} on={styleIds.includes(s.id)} onClick={() => toggleStyle(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
          <span className="hint">Sin ninguno marcado, se permite cualquier estilo.</span>
        </div>
        <h3>Perfumes</h3>
        <p className="hint">El primero de cada clima es el principal; “otro perfume” en Generar pasa a los siguientes, en orden.</p>
        {PERFUME_CLIMATES.map((c) => (
          <PerfumeListEditor key={c} climate={c} ids={lists[c]} perfumes={perfumes} onChange={(ids) => setList(c, ids)} onCopyToAll={() => copyToAll(c)} />
        ))}
      </div>
    </Sheet>
  );
}

function PerfumeListEditor({
  climate,
  ids,
  perfumes,
  onChange,
  onCopyToAll,
}: {
  climate: PerfumeClimate;
  ids: UUID[];
  perfumes: Perfume[];
  onChange: (ids: UUID[]) => void;
  onCopyToAll: () => void;
}) {
  const byId = new Map(perfumes.map((p) => [p.id, p]));
  const label = PERFUME_CLIMATE_LABELS[climate];
  const addable = perfumes.filter((p) => p.status === 'available' && !ids.includes(p.id));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="spread">
        <span className="label">{label}</span>
        {ids.length > 0 && (
          <button type="button" className="btn sm ghost" onClick={onCopyToAll} title={`Usar esta lista en calor, templado y frío`}>
            <Copy /> Usar en los 3 climas
          </button>
        )}
      </div>
      {ids.length > 0 && (
        <div className="card-list">
          {ids.map((id, i) => {
            const p = byId.get(id);
            return (
              <div key={id} className="list-item">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block', fontWeight: i === 0 ? 650 : 400 }}>
                    {p?.name ?? 'Perfume borrado'}
                  </span>
                  <span className="tiny muted">
                    {i === 0 ? 'Principal' : 'Secundario'}
                    {p?.status === 'archived' ? ' · archivado (no se sugiere)' : ''}
                  </span>
                </span>
                <MoveButtons list={ids} i={i} label={p?.name} onMove={onChange} />
                <button type="button" className="icon-btn sm" aria-label={`Quitar ${p?.name ?? 'perfume'} de ${label}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
                  <X />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <select
        className="select"
        value=""
        aria-label={`Agregar perfume para ${label.toLowerCase()}`}
        onChange={(e) => {
          if (e.target.value) onChange([...ids, e.target.value]);
        }}
        disabled={addable.length === 0}
      >
        <option value="">{addable.length === 0 ? (perfumes.length === 0 ? 'Primero agrega perfumes en la pestaña Perfumes' : 'No hay más perfumes') : '+ Agregar perfume…'}</option>
        {addable.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Perfumes ──────────────────────────────────────────────────────────────

function PerfumesTab() {
  const idx = useCatalogIndex();
  const perfumes = usePerfumes();
  const [editing, setEditing] = useState<Perfume | 'new' | null>(null);
  if (!perfumes) return null;
  const active = perfumes.filter((p) => p.status === 'available');
  const archived = perfumes.filter((p) => p.status === 'archived');
  const uses = (p: Perfume) => {
    const n = perfumeUseCount(idx.catalog.occasions, p.id);
    return n === 0 ? 'Sin asignar a ningún evento' : `En ${n} ${n === 1 ? 'lista' : 'listas'} (ocasión × clima)`;
  };
  const row = (p: Perfume) => (
    <button key={p.id} type="button" className="list-item" onClick={() => setEditing(p)}>
      <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
        <span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>
          {p.name}
        </span>
        {p.notes && (
          <span className="small muted ellipsis" style={{ display: 'block' }}>
            {p.notes}
          </span>
        )}
        <span className="tiny muted" style={{ display: 'block' }}>
          {uses(p)}
        </span>
      </span>
      <ChevronRight width={18} />
    </button>
  );
  return (
    <>
      {perfumes.length === 0 ? (
        <EmptyState icon={<PerfumeIcon />} title="Aún no tienes perfumes" text="Agrégalos aquí y luego asígnalos a las ocasiones de tus eventos." />
      ) : (
        <div className="card-list">{active.map(row)}</div>
      )}
      <button type="button" className="btn block" onClick={() => setEditing('new')}>
        <Plus /> Nuevo perfume
      </button>
      {archived.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <h3>Archivados</h3>
          <p className="hint">No se sugieren en Generar, aunque sigan en alguna lista.</p>
          <div className="card-list">{archived.map(row)}</div>
        </section>
      )}
      {editing && <PerfumeSheet perfume={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PerfumeSheet({ perfume, onClose }: { perfume: Perfume | null; onClose: () => void }) {
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState(perfume?.name ?? '');
  const [notes, setNotes] = useState(perfume?.notes ?? '');
  const [archived, setArchived] = useState(perfume?.status === 'archived');

  const save = async () => {
    const draft = { name, notes, status: archived ? ('archived' as const) : ('available' as const) };
    if (perfume) await updatePerfume(perfume, draft);
    else await createPerfume(draft);
    onClose();
  };
  const remove = async () => {
    if (!perfume) return;
    const ok = await confirm({
      title: `¿Eliminar “${perfume.name}”?`,
      message: 'Se quita de todos los eventos. Si solo ya no lo usas, mejor archívalo.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deletePerfume(perfume);
    toast('Perfume eliminado');
    onClose();
  };

  return (
    <Sheet
      title={perfume ? 'Editar perfume' : 'Nuevo perfume'}
      onClose={onClose}
      footer={
        <div className="btn-row">
          {perfume && (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Trash2 /> Eliminar
            </button>
          )}
          <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
            Guardar
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="perfume-name">Nombre</label>
          <input id="perfume-name" className="input" value={name} maxLength={80} placeholder="p. ej. Prada L'Homme" onChange={(e) => setName(e.target.value)} autoFocus={!perfume} />
        </div>
        <div className="field">
          <label htmlFor="perfume-notes">Notas (opcional)</label>
          <textarea id="perfume-notes" className="textarea" maxLength={1000} value={notes} placeholder="A qué huele, a qué se parece…" onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => setArchived((v) => !v)}>
          <CheckBox on={archived} />
          <span className="grow">
            Archivado
            <span className="small muted" style={{ display: 'block' }}>
              Ya no lo tienes o no quieres que se sugiera.
            </span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}
