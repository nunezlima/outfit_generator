// Reglas de compatibilidad en 3 niveles (gana el más específico):
//   1. Matriz de estilos · 2. Reglas de tipos · 3. Excepciones entre prendas

import { Ban, Check, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGarmentMap, useGarments } from '../data/hooks';
import { setGarmentRule, setStyleCompat, setTypeRule } from '../data/repo';
import { orderedPair } from '../domain/compat';
import { useCatalogIndex } from '../ui/CatalogContext';
import { Page, Segmented, Tabs } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto } from '../ui/GarmentViews';
import { Sheet } from '../ui/Sheet';

type Tab = 'styles' | 'types' | 'garments';

export function RulesScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('t') as Tab) ?? 'styles';
  return (
    <Page title="Reglas" back="/ajustes">
      <div className="stack">
        <div className="callout info small">
          <span>
            Gana la regla <b>más específica</b>: una excepción entre dos prendas manda sobre una regla de tipos, y esta manda sobre la matriz de estilos.
          </span>
        </div>
        <Tabs
          value={tab}
          onChange={(t) => setParams({ t }, { replace: true })}
          tabs={[
            { value: 'styles', label: '1 · Estilos' },
            { value: 'types', label: '2 · Tipos' },
            { value: 'garments', label: '3 · Prendas' },
          ]}
        />
        {tab === 'styles' && <StyleMatrix />}
        {tab === 'types' && <TypeRules />}
        {tab === 'garments' && <GarmentRules />}
      </div>
    </Page>
  );
}

function StyleMatrix() {
  const idx = useCatalogIndex();
  const styles = idx.catalog.styles;
  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of idx.catalog.styleCompat) m.set(`${r.style_a}|${r.style_b}`, r.compatible);
    return m;
  }, [idx.catalog.styleCompat]);
  const get = (a: string, b: string) => {
    const [x, y] = orderedPair(a, b);
    return map.get(`${x}|${y}`) ?? true;
  };

  if (styles.length < 2) return <p className="hint">Necesitas al menos dos estilos.</p>;
  return (
    <div className="stack">
      <p className="hint">Toca una celda para cambiar si esos dos estilos combinan. Dos prendas combinan si alguno de sus estilos combina con alguno de los de la otra.</p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {styles.map((s) => (
                <th key={s.id} scope="col">
                  <span>{s.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {styles.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                {styles.map((col) => {
                  if (row.id === col.id)
                    return (
                      <td key={col.id}>
                        <span className="matrix-cell self" title="Un estilo siempre combina consigo mismo">
                          —
                        </span>
                      </td>
                    );
                  const ok = get(row.id, col.id);
                  return (
                    <td key={col.id}>
                      <button
                        className={`matrix-cell ${ok ? 'yes' : 'no'}`}
                        aria-label={`${row.name} con ${col.name}: ${ok ? 'combinan' : 'no combinan'}`}
                        aria-pressed={ok}
                        onClick={() => void setStyleCompat(row.id, col.id, !ok)}
                      >
                        {ok ? <Check /> : <Ban />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row small muted">
        <span className="matrix-cell yes" style={{ width: 24, height: 24 }}>
          <Check width={14} />
        </span>
        combinan
        <span className="matrix-cell no" style={{ width: 24, height: 24, marginLeft: 12 }}>
          <Ban width={14} />
        </span>
        no combinan
      </div>
    </div>
  );
}

function TypeRules() {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  const rules = [...idx.catalog.typeRules].sort((a, b) => Number(a.allowed) - Number(b.allowed) || idx.typeName(a.type_a).localeCompare(idx.typeName(b.type_a), 'es'));
  return (
    <div className="stack">
      <p className="hint">Pares de tipos que siempre (o nunca) combinan, sin importar sus estilos. Ej.: pantalón de vestir + chanclas = no.</p>
      {rules.length === 0 ? (
        <p className="muted">Sin reglas de tipos.</p>
      ) : (
        <div className="card-list">
          {rules.map((r) => (
            <div key={`${r.type_a}|${r.type_b}`} className="list-item">
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {idx.typeName(r.type_a)} + {idx.typeName(r.type_b)}
                </div>
                <div className="small" style={{ color: r.allowed ? 'var(--success)' : 'var(--danger)' }}>
                  {r.allowed ? 'Siempre permitido' : 'Prohibido'}
                </div>
              </div>
              <button className="btn sm" onClick={() => void setTypeRule(r.type_a, r.type_b, !r.allowed)}>
                {r.allowed ? 'Prohibir' : 'Permitir'}
              </button>
              <button
                className="icon-btn sm"
                aria-label="Quitar regla"
                onClick={() => void setTypeRule(r.type_a, r.type_b, null).then(() => toast('Regla quitada: ahora decide la matriz de estilos'))}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="btn block" onClick={() => setAdding(true)}>
        <Plus /> Nueva regla de tipos
      </button>
      {adding && <AddTypeRuleSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddTypeRuleSheet({ onClose }: { onClose: () => void }) {
  const idx = useCatalogIndex();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [allowed, setAllowed] = useState(false);
  const typeSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
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
  );
  return (
    <Sheet
      title="Nueva regla de tipos"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          disabled={!a || !b || a === b}
          onClick={async () => {
            await setTypeRule(a, b, allowed);
            onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="ta">Tipo</label>
          {typeSelect('ta', a, setA)}
        </div>
        <div className="field">
          <label htmlFor="tb">con</label>
          {typeSelect('tb', b, setB)}
        </div>
        <Segmented<'no' | 'yes'>
          label="Regla"
          value={allowed ? 'yes' : 'no'}
          onChange={(v) => setAllowed(v === 'yes')}
          options={[
            { value: 'no', label: 'Prohibido' },
            { value: 'yes', label: 'Siempre permitido' },
          ]}
        />
        {a && a === b && <p className="error-text">Elige dos tipos distintos.</p>}
      </div>
    </Sheet>
  );
}

function GarmentRules() {
  const idx = useCatalogIndex();
  const garments = useGarments() ?? [];
  const byId = useGarmentMap(garments);
  const rules = idx.catalog.garmentRules.filter((r) => byId.has(r.garment_a) && byId.has(r.garment_b));
  return (
    <div className="stack">
      <p className="hint">
        Excepciones entre dos prendas concretas. Se crean desde la ficha de una prenda → <b>Combina con</b>.
      </p>
      {rules.length === 0 ? (
        <p className="muted">Aún no hay excepciones.</p>
      ) : (
        <div className="card-list">
          {rules.map((r) => {
            const a = byId.get(r.garment_a)!;
            const b = byId.get(r.garment_b)!;
            return (
              <div key={`${r.garment_a}|${r.garment_b}`} className="list-item">
                <GarmentPhoto garment={a} className="thumb sm" />
                <GarmentPhoto garment={b} className="thumb sm" />
                <div className="grow">
                  <div className="small">
                    <Link to={`/guardarropa/${a.id}`}>{a.name}</Link> + <Link to={`/guardarropa/${b.id}`}>{b.name}</Link>
                  </div>
                  <div className="small" style={{ color: r.allowed ? 'var(--success)' : 'var(--danger)' }}>
                    {r.allowed ? 'Siempre combinan' : 'Nunca combinan'}
                  </div>
                </div>
                <button className="icon-btn sm" aria-label="Quitar excepción" onClick={() => void setGarmentRule(r.garment_a, r.garment_b, null)}>
                  <Trash2 />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
