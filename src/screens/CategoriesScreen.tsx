// Categorías editables: posiciones, tipos y estilos. Crear, renombrar,
// reordenar y eliminar (si están en uso, se pregunta a dónde mover lo que
// dependía de ellas).

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGarments } from '../data/hooks';
import { createPosition, createStyle, createType, deletePosition, deleteStyle, deleteType, reorder, saveRows } from '../data/repo';
import { ROLE_LABELS, WARMTH_LABELS, type GarmentType, type Position, type PositionRole, type Style, type Warmth } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { NumberStepper, Page, Segmented, Tabs } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { Sheet } from '../ui/Sheet';

type Tab = 'positions' | 'types' | 'styles';

export function CategoriesScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('t') as Tab) ?? 'types';
  return (
    <Page title="Categorías" back="/ajustes">
      <div className="stack">
        <Tabs
          value={tab}
          onChange={(t) => setParams({ t }, { replace: true })}
          tabs={[
            { value: 'types', label: 'Tipos' },
            { value: 'styles', label: 'Estilos' },
            { value: 'positions', label: 'Posiciones' },
          ]}
        />
        {tab === 'positions' && <PositionsTab />}
        {tab === 'types' && <TypesTab />}
        {tab === 'styles' && <StylesTab />}
      </div>
    </Page>
  );
}

function MoveButtons<T>({ list, i, onMove }: { list: T[]; i: number; onMove: (list: T[]) => void }) {
  const move = (d: -1 | 1) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onMove(next);
  };
  return (
    <>
      <button className="icon-btn sm" aria-label="Subir" disabled={i === 0} onClick={() => move(-1)}>
        <ArrowUp />
      </button>
      <button className="icon-btn sm" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(1)}>
        <ArrowDown />
      </button>
    </>
  );
}

// ─── Posiciones ────────────────────────────────────────────────────────────

function PositionsTab() {
  const idx = useCatalogIndex();
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const list = idx.catalog.positions;
  return (
    <>
      <p className="hint">
        Cada tipo de prenda pertenece a una posición del outfit. El <b>comportamiento</b> le dice al generador si es obligatoria, opcional o si admite varias prendas.
      </p>
      <div className="card-list">
        {list.map((p, i) => (
          <div key={p.id} className="list-item">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="small muted">
                {ROLE_LABELS[p.role]}
                {p.role === 'accessory' ? ` · hasta ${p.max_items}` : ''} · {idx.catalog.types.filter((t) => t.position_id === p.id).length} tipos
              </div>
            </div>
            <MoveButtons list={list} i={i} onMove={(l) => void reorder('positions', l)} />
            <button className="icon-btn sm" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}>
              <Pencil />
            </button>
            <button className="icon-btn sm" aria-label={`Eliminar ${p.name}`} onClick={() => setDeleting(p)}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <button className="btn block" onClick={() => setEditing('new')}>
        <Plus /> Nueva posición
      </button>
      {editing && <PositionSheet position={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeletePositionSheet position={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

function PositionSheet({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const [name, setName] = useState(position?.name ?? '');
  const [role, setRole] = useState<PositionRole>(position?.role ?? 'extra');
  const [max, setMax] = useState(position?.max_items ?? 3);
  const save = async () => {
    const max_items = role === 'accessory' ? max : 1;
    if (position) await saveRows('positions', [{ ...position, name: name.trim(), role, max_items }]);
    else await createPosition({ name, role, max_items });
    onClose();
  };
  return (
    <Sheet
      title={position ? 'Editar posición' : 'Nueva posición'}
      onClose={onClose}
      footer={
        <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
          Guardar
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="pos-name">Nombre</label>
          <input id="pos-name" className="input" value={name} maxLength={60} placeholder="p. ej. Capa intermedia" onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pos-role">Comportamiento en el generador</label>
          <select id="pos-role" className="select" value={role} onChange={(e) => setRole(e.target.value as PositionRole)}>
            {(Object.keys(ROLE_LABELS) as PositionRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {role === 'accessory' && (
          <div className="spread">
            <span>Máximo de prendas a la vez</span>
            <NumberStepper label="máximo" value={max} min={1} max={10} onChange={setMax} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DeletePositionSheet({ position, onClose }: { position: Position; onClose: () => void }) {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const types = idx.catalog.types.filter((t) => t.position_id === position.id);
  const others = idx.catalog.positions.filter((p) => p.id !== position.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const run = async () => {
    await deletePosition(position, types.length ? target : null);
    toast('Posición eliminada');
    onClose();
  };
  return (
    <Sheet
      title={`Eliminar “${position.name}”`}
      onClose={onClose}
      footer={
        <button className="btn danger solid" disabled={types.length > 0 && !target} onClick={() => void run()}>
          <Trash2 /> Eliminar
        </button>
      }
    >
      {types.length === 0 ? (
        <p>Esta posición no tiene tipos. Se puede eliminar sin problema.</p>
      ) : (
        <div className="stack">
          <p>
            Tiene {types.length} tipos ({types.map((t) => t.name).join(', ')}). ¿A qué posición los movemos?
          </p>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Mover tipos a">
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Sheet>
  );
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

function TypesTab() {
  const idx = useCatalogIndex();
  const garments = useGarments() ?? [];
  const [editing, setEditing] = useState<GarmentType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GarmentType | null>(null);
  const count = (t: GarmentType) => garments.filter((g) => g.type_id === t.id).length;
  return (
    <>
      {idx.catalog.positions.map((p) => {
        const list = idx.catalog.types.filter((t) => t.position_id === p.id);
        return (
          <div key={p.id} className="stack" style={{ gap: 6 }}>
            <h2>{p.name}</h2>
            {list.length === 0 ? (
              <p className="hint">Sin tipos.</p>
            ) : (
              <div className="card-list">
                {list.map((t, i) => (
                  <div key={t.id} className="list-item">
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div className="small muted">
                        {count(t)} prendas · lavar {t.default_wash_uses === 0 ? 'nunca' : `cada ${t.default_wash_uses}`} · {WARMTH_LABELS[t.default_warmth].toLowerCase()}
                      </div>
                    </div>
                    <MoveButtons list={list} i={i} onMove={(l) => void reorder('garment_types', l)} />
                    <button className="icon-btn sm" aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil />
                    </button>
                    <button className="icon-btn sm" aria-label={`Eliminar ${t.name}`} onClick={() => setDeleting(t)}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button className="btn block" onClick={() => setEditing('new')} disabled={idx.catalog.positions.length === 0}>
        <Plus /> Nuevo tipo
      </button>
      {editing && <TypeSheet type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteTypeSheet type={deleting} inUse={count(deleting)} onClose={() => setDeleting(null)} />}
    </>
  );
}

function TypeSheet({ type, onClose }: { type: GarmentType | null; onClose: () => void }) {
  const idx = useCatalogIndex();
  const [name, setName] = useState(type?.name ?? '');
  const [positionId, setPositionId] = useState(type?.position_id ?? idx.catalog.positions[0]?.id ?? '');
  const [wash, setWash] = useState(type?.default_wash_uses ?? 1);
  const [warmth, setWarmth] = useState<Warmth>(type?.default_warmth ?? 'medium');
  const save = async () => {
    if (type) await saveRows('garment_types', [{ ...type, name: name.trim(), position_id: positionId, default_wash_uses: wash, default_warmth: warmth }]);
    else await createType({ name, position_id: positionId, default_wash_uses: wash, default_warmth: warmth });
    onClose();
  };
  return (
    <Sheet
      title={type ? 'Editar tipo' : 'Nuevo tipo'}
      onClose={onClose}
      footer={
        <button className="btn primary" disabled={!name.trim() || !positionId} onClick={() => void save()}>
          Guardar
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="type-name">Nombre</label>
          <input id="type-name" className="input" value={name} maxLength={60} placeholder="p. ej. Cárdigan" onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="type-pos">Posición en el outfit</label>
          <select id="type-pos" className="select" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            {idx.catalog.positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="spread">
          <div>
            <div>Usos antes de lavar (sugerido)</div>
            <div className="hint">0 = nunca va al cesto</div>
          </div>
          <NumberStepper label="usos antes de lavar" value={wash} onChange={setWash} />
        </div>
        <div className="field">
          <span className="label">Abrigo (sugerido)</span>
          <Segmented<Warmth> label="Abrigo" value={warmth} onChange={setWarmth} options={(Object.keys(WARMTH_LABELS) as Warmth[]).map((w) => ({ value: w, label: WARMTH_LABELS[w] }))} />
        </div>
        {type && <p className="hint">Los valores sugeridos solo se aplican a prendas nuevas.</p>}
      </div>
    </Sheet>
  );
}

function DeleteTypeSheet({ type, inUse, onClose }: { type: GarmentType; inUse: number; onClose: () => void }) {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const others = idx.catalog.types.filter((t) => t.id !== type.id);
  const [target, setTarget] = useState(others.find((t) => t.position_id === type.position_id)?.id ?? others[0]?.id ?? '');
  const run = async () => {
    await deleteType(type, inUse ? target : null);
    toast('Tipo eliminado');
    onClose();
  };
  return (
    <Sheet
      title={`Eliminar “${type.name}”`}
      onClose={onClose}
      footer={
        <button className="btn danger solid" disabled={inUse > 0 && !target} onClick={() => void run()}>
          <Trash2 /> Eliminar
        </button>
      }
    >
      {inUse === 0 ? (
        <p>Ninguna prenda usa este tipo. Sus reglas de tipos también se borrarán.</p>
      ) : (
        <div className="stack">
          <p>
            {inUse} {inUse === 1 ? 'prenda es' : 'prendas son'} de este tipo. ¿A qué tipo las movemos?
          </p>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Mover prendas a">
            {idx.catalog.positions.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {others
                  .filter((t) => t.position_id === p.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="hint">Las reglas de tipos de “{type.name}” se borrarán.</p>
        </div>
      )}
    </Sheet>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────

function StylesTab() {
  const idx = useCatalogIndex();
  const garments = useGarments() ?? [];
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<Style | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Style | null>(null);
  const list = idx.catalog.styles;
  const count = (s: Style) => garments.filter((g) => g.style_ids.includes(s.id)).length;
  return (
    <>
      <p className="hint">Qué estilos combinan entre sí se define en Reglas → Matriz de estilos.</p>
      <div className="card-list">
        {list.map((s, i) => (
          <div key={s.id} className="list-item">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="small muted">{count(s)} prendas</div>
            </div>
            <MoveButtons list={list} i={i} onMove={(l) => void reorder('styles', l)} />
            <button className="icon-btn sm" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)}>
              <Pencil />
            </button>
            <button className="icon-btn sm" aria-label={`Eliminar ${s.name}`} onClick={() => setDeleting(s)}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <button className="btn block" onClick={() => setEditing('new')}>
        <Plus /> Nuevo estilo
      </button>
      {editing && (
        <StyleSheet
          style={editing === 'new' ? null : editing}
          onClose={(created) => {
            setEditing(null);
            if (created) toast(`Estilo “${created}” creado. Por defecto combina con todos.`, { label: 'Ajustar', run: () => navigate('/ajustes/reglas') }, 6000);
          }}
        />
      )}
      {deleting && <DeleteStyleSheet style={deleting} inUse={count(deleting)} onClose={() => setDeleting(null)} />}
    </>
  );
}

function StyleSheet({ style, onClose }: { style: Style | null; onClose: (createdName?: string) => void }) {
  const [name, setName] = useState(style?.name ?? '');
  const save = async () => {
    if (style) {
      await saveRows('styles', [{ ...style, name: name.trim() }]);
      onClose();
    } else {
      await createStyle(name);
      onClose(name.trim());
    }
  };
  return (
    <Sheet
      title={style ? 'Renombrar estilo' : 'Nuevo estilo'}
      onClose={() => onClose()}
      footer={
        <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
          Guardar
        </button>
      }
    >
      <input className="input" value={name} maxLength={60} placeholder="p. ej. Fiesta" onChange={(e) => setName(e.target.value)} aria-label="Nombre del estilo" autoFocus />
    </Sheet>
  );
}

function DeleteStyleSheet({ style, inUse, onClose }: { style: Style; inUse: number; onClose: () => void }) {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const others = idx.catalog.styles.filter((s) => s.id !== style.id);
  const [target, setTarget] = useState<string>(others[0]?.id ?? '');
  const run = async () => {
    await deleteStyle(style, target || null);
    toast('Estilo eliminado');
    onClose();
  };
  return (
    <Sheet
      title={`Eliminar “${style.name}”`}
      onClose={onClose}
      footer={
        <button className="btn danger solid" onClick={() => void run()}>
          <Trash2 /> Eliminar
        </button>
      }
    >
      {inUse === 0 ? (
        <p>Ninguna prenda usa este estilo. Sus celdas de la matriz también se borrarán.</p>
      ) : (
        <div className="stack">
          <p>
            {inUse} {inUse === 1 ? 'prenda tiene' : 'prendas tienen'} este estilo. ¿Qué estilo les ponemos en su lugar?
          </p>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Reemplazar por">
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Ninguno (solo quitarlo)</option>
          </select>
          {!target && <p className="hint">Las prendas que se queden sin estilos combinarán con todo (comodín).</p>}
        </div>
      )}
    </Sheet>
  );
}
