// Cesto de ropa sucia: marcar prendas (una, varias o todas) como lavadas, y
// mandar prendas al cesto a mano.

import { Check, Plus, Sparkles, WashingMachine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGarments } from '../data/hooks';
import { setStatus, washGarments } from '../data/repo';
import type { UUID } from '../domain/types';
import { CheckBox, EmptyState, Loading, Page } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPicker } from '../ui/GarmentPicker';
import { GarmentPhoto } from '../ui/GarmentViews';
import { useCatalogIndex } from '../ui/CatalogContext';

export function LaundryScreen() {
  const garments = useGarments();
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const [selected, setSelected] = useState<Set<UUID>>(new Set());
  const [adding, setAdding] = useState(false);

  const dirty = useMemo(() => (garments ?? []).filter((g) => g.status === 'laundry'), [garments]);
  const available = useMemo(() => (garments ?? []).filter((g) => g.status === 'available'), [garments]);
  if (!garments) return <Loading />;

  const allOn = dirty.length > 0 && dirty.every((g) => selected.has(g.id));
  const chosen = dirty.filter((g) => selected.has(g.id));

  const toggle = (id: UUID) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const wash = async (list = chosen) => {
    if (list.length === 0) return;
    await washGarments(list);
    setSelected(new Set());
    toast(list.length === 1 ? `“${list[0].name}” lista para usar` : `${list.length} prendas listas para usar`);
  };

  return (
    <Page title="Cesto">
      {dirty.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="¡Todo limpio!" text="Cuando una prenda llegue a su límite de usos aparecerá aquí. También puedes mandar prendas a mano.">
          <button className="btn" onClick={() => setAdding(true)}>
            <Plus /> Mandar prendas al cesto
          </button>
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="spread">
            <button className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setSelected(allOn ? new Set() : new Set(dirty.map((g) => g.id)))}>
              <CheckBox on={allOn} />
              <span>Seleccionar todo ({dirty.length})</span>
            </button>
            <button className="btn sm" onClick={() => setAdding(true)}>
              <Plus /> Agregar
            </button>
          </div>
          <div className="card-list">
            {dirty.map((g) => (
              <button key={g.id} className="list-item" onClick={() => toggle(g.id)} aria-pressed={selected.has(g.id)}>
                <CheckBox on={selected.has(g.id)} />
                <GarmentPhoto garment={g} className="thumb" />
                <span className="grow">
                  <span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>
                    {g.name}
                  </span>
                  <span className="small muted">
                    {idx.typeName(g.type_id)}
                    {g.wash_after_uses > 0 ? ` · ${g.uses_since_wash}/${g.wash_after_uses} usos` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="btn-row" style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 12px)' }}>
            {chosen.length > 0 ? (
              <button className="btn primary big" onClick={() => void wash()}>
                <Check /> Lavado / listo ({chosen.length})
              </button>
            ) : (
              <button className="btn primary big" onClick={() => void wash(dirty)}>
                <WashingMachine /> Lavé todo ({dirty.length})
              </button>
            )}
          </div>
        </div>
      )}
      {adding && (
        <GarmentPicker
          title="Mandar al cesto"
          garments={available}
          multiple
          confirmText="Al cesto"
          onClose={() => setAdding(false)}
          onDone={async (ids) => {
            setAdding(false);
            const list = available.filter((g) => ids.includes(g.id));
            if (list.length) {
              await setStatus(list, 'laundry');
              toast(`${list.length} ${list.length === 1 ? 'prenda enviada' : 'prendas enviadas'} al cesto`);
            }
          }}
        />
      )}
    </Page>
  );
}
