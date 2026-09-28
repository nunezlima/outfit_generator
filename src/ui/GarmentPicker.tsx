// Hoja para elegir una o varias prendas (con búsqueda y filtro por posición).

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Garment, UUID } from '../domain/types';
import { useCatalogIndex } from './CatalogContext';
import { Chip, EmptyState, SearchInput, normalize } from './common';
import { GarmentCard } from './GarmentViews';
import { Sheet } from './Sheet';

interface Props {
  title: string;
  garments: Garment[];
  multiple?: boolean;
  initial?: UUID[];
  onClose: () => void;
  onDone: (ids: UUID[]) => void;
  confirmText?: string;
}

export function GarmentPicker({ title, garments, multiple, initial = [], onClose, onDone, confirmText = 'Listo' }: Props) {
  const idx = useCatalogIndex();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<UUID | null>(null);
  const [sel, setSel] = useState<Set<UUID>>(new Set(initial));

  const shown = useMemo(() => {
    const nq = normalize(q.trim());
    return garments.filter((g) => {
      if (pos && idx.positionOfType(g.type_id)?.id !== pos) return false;
      if (!nq) return true;
      return normalize(`${g.name} ${idx.typeName(g.type_id)}`).includes(nq);
    });
  }, [garments, q, pos, idx]);

  const usedPositions = idx.catalog.positions.filter((p) => garments.some((g) => idx.positionOfType(g.type_id)?.id === p.id));

  const toggle = (id: UUID) => {
    if (!multiple) {
      onDone([id]);
      return;
    }
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        multiple ? (
          <button className="btn primary" onClick={() => onDone([...sel])}>
            <Check /> {confirmText} {sel.size > 0 ? `(${sel.size})` : ''}
          </button>
        ) : undefined
      }
    >
      <div className="stack">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar prenda…" />
        <div className="chips scroll">
          <Chip on={pos === null} onClick={() => setPos(null)}>
            Todas
          </Chip>
          {usedPositions.map((p) => (
            <Chip key={p.id} on={pos === p.id} onClick={() => setPos(p.id)}>
              {p.name}
            </Chip>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={<Check />} title="Nada por aquí" text="No hay prendas que coincidan." />
        ) : (
          <div className="garment-grid">
            {shown.map((g) => (
              <GarmentCard key={g.id} garment={g} selected={sel.has(g.id)} onClick={() => toggle(g.id)} />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
