// Outfits guardados + calendario de lo que te pusiste cada día.

import { CalendarDays, ChevronLeft, ChevronRight, Heart, LayoutGrid, Star, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGarmentMap, useGarments, useOutfits, useWearLog } from '../data/hooks';
import { usePhotoUrl } from '../data/photos';
import { deleteWearEntry } from '../data/repo';
import { formatLongDate, monthName, parseISODate, relativeDays, toISODate, todayISO, daysBetween } from '../domain/dates';
import { MISSING_LABEL, outfitAvailability } from '../domain/outfits';
import type { Garment, Outfit, UUID, WearLogEntry } from '../domain/types';
import { Chip, EmptyState, Loading, Page, SearchInput, Tabs, normalize } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto } from '../ui/GarmentViews';

type Tab = 'saved' | 'calendar';
type Filter = 'all' | 'favorites' | 'available';

export function OutfitsScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('vista') as Tab) ?? 'saved';
  return (
    <Page title="Outfits">
      <div className="stack">
        <Tabs
          value={tab}
          onChange={(v) => setParams(v === 'saved' ? {} : { vista: v }, { replace: true })}
          tabs={[
            { value: 'saved', label: 'Guardados' },
            { value: 'calendar', label: 'Calendario' },
          ]}
        />
        {tab === 'saved' ? <SavedOutfits /> : <WearCalendar />}
      </div>
    </Page>
  );
}

/** Veces usado y última fecha, por outfit. */
function useOutfitUsage(): Map<UUID, { count: number; last: string | null }> {
  const log = useWearLog();
  return useMemo(() => {
    const m = new Map<UUID, { count: number; last: string | null }>();
    for (const w of log ?? []) {
      if (!w.outfit_id) continue;
      const cur = m.get(w.outfit_id) ?? { count: 0, last: null };
      cur.count++;
      if (!cur.last || w.worn_on > cur.last) cur.last = w.worn_on;
      m.set(w.outfit_id, cur);
    }
    return m;
  }, [log]);
}

function SavedOutfits() {
  const outfits = useOutfits();
  const garments = useGarments();
  const byId = useGarmentMap(garments);
  const usage = useOutfitUsage();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const nq = normalize(q.trim());
    return (outfits ?? []).filter((o) => {
      if (filter === 'favorites' && !o.favorite) return false;
      if (filter === 'available' && !outfitAvailability(o, byId).available) return false;
      return !nq || normalize(`${o.name} ${o.tags.join(' ')}`).includes(nq);
    });
  }, [outfits, q, filter, byId]);

  if (!outfits || !garments) return <Loading />;
  if (outfits.length === 0)
    return (
      <EmptyState icon={<LayoutGrid />} title="Aún no guardas outfits" text="Genera uno y toca “Guardar”, o marca “Lo usé hoy” y elige guardarlo.">
        <Link to="/" className="btn primary">
          Ir a Generar
        </Link>
      </EmptyState>
    );

  return (
    <div className="stack">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o etiqueta…" />
      <div className="chips scroll">
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>
          Todos
        </Chip>
        <Chip on={filter === 'favorites'} onClick={() => setFilter('favorites')}>
          <Star /> Favoritos
        </Chip>
        <Chip on={filter === 'available'} onClick={() => setFilter('available')}>
          Disponibles
        </Chip>
      </div>
      {shown.length === 0 && <p className="muted center">Nada coincide con el filtro.</p>}
      <div className="garment-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {shown.map((o) => (
          <OutfitCard key={o.id} outfit={o} byId={byId} usage={usage.get(o.id)} />
        ))}
      </div>
    </div>
  );
}

function OutfitCover({ outfit, byId }: { outfit: Outfit; byId: Map<UUID, Garment> }) {
  const selfie = usePhotoUrl(outfit.photo_paths[0] ?? null, 'thumb');
  const items = outfit.garment_ids.map((id) => byId.get(id)).filter((g): g is Garment => !!g).slice(0, 3);
  if (selfie)
    return (
      <div className="outfit-cover one">
        <div className="photo">
          <img src={selfie} alt={outfit.name} />
        </div>
      </div>
    );
  return (
    <div className={`outfit-cover${items.length === 1 ? ' one' : items.length === 2 ? ' two' : ''}`}>
      {items.map((g) => (
        <GarmentPhoto key={g.id} garment={g} />
      ))}
    </div>
  );
}

function OutfitCard({ outfit, byId, usage }: { outfit: Outfit; byId: Map<UUID, Garment>; usage?: { count: number; last: string | null } }) {
  const av = outfitAvailability(outfit, byId);
  return (
    <Link to={`/outfits/${outfit.id}`} className="garment-card">
      <OutfitCover outfit={outfit} byId={byId} />
      <div className="corner">
        <span>{outfit.favorite && <span className="badge accent"><Heart /> Favorito</span>}</span>
      </div>
      <div className="info stack" style={{ gap: 4 }}>
        <div className="name">{outfit.name}</div>
        <div className="meta">
          {usage?.count ? `Usado ${usage.count} ${usage.count === 1 ? 'vez' : 'veces'} · ${relativeDays(daysBetween(usage.last!, todayISO()))}` : 'Sin usar todavía'}
        </div>
        {outfit.tags.length > 0 && <div className="tiny muted ellipsis">{outfit.tags.map((t) => `#${t}`).join(' ')}</div>}
        {!av.available && (
          <span className="badge warn" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
            <TriangleAlert /> No disponible: {av.missing.map((m) => `${m.name} (${MISSING_LABEL[m.reason]})`).join(', ')}
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Calendario ────────────────────────────────────────────────────────────

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function WearCalendar() {
  const log = useWearLog();
  const garments = useGarments();
  const outfits = useOutfits();
  const byId = useGarmentMap(garments);
  const outfitById = useMemo(() => new Map((outfits ?? []).map((o) => [o.id, o])), [outfits]);
  const { confirm, toast } = useFeedback();
  const today = todayISO();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(today);

  const byDay = useMemo(() => {
    const m = new Map<string, WearLogEntry[]>();
    for (const w of log ?? []) m.set(w.worn_on, [...(m.get(w.worn_on) ?? []), w]);
    return m;
  }, [log]);

  if (!log) return <Loading />;

  // Celdas del mes (semana empieza en lunes).
  const first = month;
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1)))];
  const entries = byDay.get(selected) ?? [];
  const monthCount = cells.filter((c) => c && byDay.has(c)).length;

  const remove = async (w: WearLogEntry) => {
    const ok = await confirm({ title: 'Quitar del historial', message: 'Se borra este registro del calendario. No cambia el estado de las prendas.', confirmText: 'Quitar', danger: true });
    if (!ok) return;
    await deleteWearEntry(w.id);
    toast('Registro quitado');
  };

  return (
    <div className="stack">
      <div className="spread">
        <button className="icon-btn" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft />
        </button>
        <div className="center">
          <h2 style={{ textTransform: 'capitalize' }}>
            {monthName(month.getMonth())} {month.getFullYear()}
          </h2>
          <span className="tiny muted">
            {monthCount} {monthCount === 1 ? 'día registrado' : 'días registrados'}
          </span>
        </div>
        <button className="icon-btn" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight />
        </button>
      </div>
      <div className="calendar">
        {DOW.map((d, i) => (
          <div key={i} className="dow">
            {d}
          </div>
        ))}
        {cells.map((c, i) =>
          c ? (
            <button key={c} className={`day${c === today ? ' today' : ''}${c === selected ? ' sel' : ''}`} onClick={() => setSelected(c)} aria-label={formatLongDate(c)} aria-pressed={c === selected}>
              {parseISODate(c).getDate()}
              <span className="dots">
                {(byDay.get(c) ?? []).slice(0, 3).map((w) => (
                  <i key={w.id} />
                ))}
              </span>
            </button>
          ) : (
            <span key={`x${i}`} className="day other" />
          ),
        )}
      </div>
      <h3 style={{ marginTop: 8 }}>{formatLongDate(selected)}</h3>
      {entries.length === 0 ? (
        <p className="hint">
          <CalendarDays width={14} style={{ verticalAlign: -2 }} /> No hay registro este día. Marca “Lo usé hoy” desde Generar o desde un outfit guardado.
        </p>
      ) : (
        entries.map((w) => {
          const outfit = w.outfit_id ? outfitById.get(w.outfit_id) : undefined;
          return (
            <div key={w.id} className="card tight stack" style={{ gap: 8 }}>
              <div className="spread">
                {outfit ? <Link to={`/outfits/${outfit.id}`}>{outfit.name}</Link> : <b>Outfit del día</b>}
                <button className="icon-btn sm" aria-label="Quitar registro" onClick={() => void remove(w)}>
                  <Trash2 />
                </button>
              </div>
              <div className="thumb-strip">
                {w.garment_ids.map((id) => {
                  const g = byId.get(id);
                  return g ? (
                    <Link key={id} to={`/guardarropa/${id}`} title={g.name}>
                      <GarmentPhoto garment={g} className="thumb" />
                    </Link>
                  ) : (
                    <span key={id} className="photo thumb tiny" title="Prenda eliminada">
                      ?
                    </span>
                  );
                })}
              </div>
              <p className="tiny muted">{w.garment_ids.map((id) => byId.get(id)?.name ?? 'Prenda eliminada').join(' · ')}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
