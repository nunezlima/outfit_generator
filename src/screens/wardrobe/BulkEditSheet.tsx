// Edición de varias prendas a la vez: agregar o quitar estilos y cambiar
// tipo, clima, abrigo o estado. Solo toca lo que eliges; lo demás se queda
// como está en cada prenda. Se puede deshacer desde el aviso.

import { useState } from 'react';
import { saveRows } from '../../data/repo';
import { applyBulkChanges, type BulkChanges, type StyleAction } from '../../domain/bulkEdit';
import { CLIMATE_LABELS, STATUS_LABELS, WARMTH_LABELS, type Climate, type Garment, type GarmentStatus, type UUID, type Warmth } from '../../domain/types';
import { useCatalogIndex } from '../../ui/CatalogContext';
import { Segmented } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { Sheet } from '../../ui/Sheet';

export function BulkEditSheet({ garments, onClose, onDone }: { garments: Garment[]; onClose: () => void; onDone: () => void }) {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const [styles, setStyles] = useState<Record<UUID, StyleAction>>({});
  const [typeId, setTypeId] = useState<UUID | null>(null);
  const [climate, setClimate] = useState<Climate | null>(null);
  const [warmth, setWarmth] = useState<Warmth | null>(null);
  const [status, setStatus] = useState<GarmentStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const n = garments.length;
  const changes: BulkChanges = { styles, typeId, climate, warmth, status };
  const changed = garments.map((g) => applyBulkChanges(g, changes)).filter((g): g is Garment => !!g);

  const apply = async () => {
    if (busy || changed.length === 0) return;
    setBusy(true);
    try {
      const before = garments.filter((g) => changed.some((c) => c.id === g.id));
      await saveRows('garments', changed);
      toast(
        `${changed.length} ${changed.length === 1 ? 'prenda actualizada' : 'prendas actualizadas'}`,
        { label: 'Deshacer', run: () => void saveRows('garments', before) },
        7000,
      );
      onDone();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={`Editar ${n} ${n === 1 ? 'prenda' : 'prendas'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={apply} disabled={busy || changed.length === 0}>
            {changed.length === 0 ? 'Sin cambios' : `Aplicar a ${changed.length}`}
          </button>
        </>
      }
    >
      <div className="stack-lg">
        <p className="small muted">Solo se cambia lo que elijas aquí; todo lo demás se queda como está en cada prenda.</p>

        <div className="field">
          <span className="label">Estilos</span>
          <div className="bulk-styles">
            {idx.catalog.styles.map((s) => {
              const has = garments.filter((g) => g.style_ids.includes(s.id)).length;
              return (
                <div key={s.id} className="bulk-style-row">
                  <div>
                    <div>{s.name}</div>
                    <div className="hint">{has === 0 ? 'Ninguna lo tiene' : has === n ? 'Todas lo tienen' : `${has} de ${n} lo tienen`}</div>
                  </div>
                  <Segmented<StyleAction>
                    label={`Estilo ${s.name}`}
                    value={styles[s.id] ?? null}
                    onChange={(v) => setStyles((cur) => ({ ...cur, [s.id]: v }))}
                    options={[
                      { value: null, label: 'Igual' },
                      { value: 'add', label: 'Agregar' },
                      { value: 'remove', label: 'Quitar' },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="bulk-type">Tipo</label>
          <select id="bulk-type" className="select" value={typeId ?? ''} onChange={(e) => setTypeId(e.target.value || null)}>
            <option value="">No cambiar</option>
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
        </div>

        <div className="field">
          <span className="label">Clima</span>
          <Segmented<Climate | null>
            label="Clima"
            value={climate}
            onChange={setClimate}
            options={[{ value: null, label: 'No cambiar' }, ...(Object.keys(CLIMATE_LABELS) as Climate[]).map((c) => ({ value: c, label: CLIMATE_LABELS[c] }))]}
          />
        </div>

        <div className="field">
          <span className="label">Nivel de abrigo</span>
          <Segmented<Warmth | null>
            label="Nivel de abrigo"
            value={warmth}
            onChange={setWarmth}
            options={[{ value: null, label: 'No cambiar' }, ...(Object.keys(WARMTH_LABELS) as Warmth[]).map((w) => ({ value: w, label: WARMTH_LABELS[w] }))]}
          />
        </div>

        <div className="field">
          <span className="label">Estado</span>
          <Segmented<GarmentStatus | null>
            label="Estado"
            value={status}
            onChange={setStatus}
            options={[{ value: null, label: 'No cambiar' }, ...(Object.keys(STATUS_LABELS) as GarmentStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
          />
        </div>
      </div>
    </Sheet>
  );
}
