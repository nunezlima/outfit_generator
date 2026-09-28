// Detalle de un outfit guardado: prendas (editables), avisos de reglas,
// fotos tuyas usándolo, favorito, etiquetas y uso.

import { CalendarCheck, Check, CircleSlash, Heart, Pencil, Plus, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useGeneratorState } from '../app/generatorState';
import { useGarmentMap, useGarments, useOutfit, useWearLog } from '../data/hooks';
import { usePhotoUrl } from '../data/photos';
import { addOutfitPhoto, deleteOutfit, removeOutfitPhoto, updateOutfit } from '../data/repo';
import { formatLongDate } from '../domain/dates';
import { MISSING_LABEL, outfitAvailability, validateOutfit } from '../domain/outfits';
import type { Garment, Outfit } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { EmptyState, Loading, Page } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPicker } from '../ui/GarmentPicker';
import { GarmentRow } from '../ui/GarmentViews';
import { TagsInput, WearSheet } from '../ui/OutfitSheets';
import { PhotoInput } from '../ui/PhotoInput';

export function OutfitDetailScreen() {
  const { id } = useParams();
  const outfit = useOutfit(id);
  if (outfit === undefined) return <Loading />;
  if (outfit === null)
    return (
      <Page title="Outfit" back="/outfits">
        <EmptyState icon={<CircleSlash />} title="Este outfit ya no existe" />
      </Page>
    );
  return <OutfitDetail key={outfit.id} outfit={outfit} />;
}

function OutfitDetail({ outfit }: { outfit: Outfit }) {
  const idx = useCatalogIndex();
  const garments = useGarments() ?? [];
  const byId = useGarmentMap(garments);
  const log = useWearLog() ?? [];
  const navigate = useNavigate();
  const gen = useGeneratorState();
  const { confirm, toast } = useFeedback();
  const [picking, setPicking] = useState(false);
  const [wearing, setWearing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(outfit.name);
  const [viewer, setViewer] = useState<string | null>(null);

  const items = outfit.garment_ids.map((id) => byId.get(id)).filter((g): g is Garment => !!g);
  const av = outfitAvailability(outfit, byId);
  const warnings = useMemo(() => validateOutfit(items, idx.catalog), [items, idx.catalog]);
  const uses = log.filter((w) => w.outfit_id === outfit.id);
  const last = uses.reduce<string | null>((m, w) => (!m || w.worn_on > m ? w.worn_on : m), null);

  const sortedItems = [...items].sort((a, b) => (idx.positionOfType(a.type_id)?.sort_order ?? 0) - (idx.positionOfType(b.type_id)?.sort_order ?? 0));

  const remove = async () => {
    const ok = await confirm({ title: `¿Eliminar “${outfit.name}”?`, message: 'Las prendas no se borran. El historial del calendario se conserva.', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    await deleteOutfit(outfit);
    toast('Outfit eliminado');
    navigate('/outfits', { replace: true });
  };

  return (
    <Page
      title={outfit.name}
      back="/outfits"
      actions={
        <button className={`icon-btn${outfit.favorite ? ' on' : ''}`} aria-pressed={outfit.favorite} aria-label="Favorito" onClick={() => void updateOutfit(outfit, { favorite: !outfit.favorite })}>
          <Heart fill={outfit.favorite ? 'currentColor' : 'none'} />
        </button>
      }
    >
      <div className="stack-lg">
        {editingName ? (
          <div className="row">
            <input className="input grow" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre" autoFocus />
            <button
              className="icon-btn on"
              aria-label="Guardar nombre"
              disabled={!name.trim()}
              onClick={() => {
                void updateOutfit(outfit, { name: name.trim() });
                setEditingName(false);
              }}
            >
              <Check />
            </button>
          </div>
        ) : (
          <div className="spread">
            <div>
              <h2>{outfit.name}</h2>
              <p className="small muted">
                {uses.length ? `Usado ${uses.length} ${uses.length === 1 ? 'vez' : 'veces'} · último: ${formatLongDate(last!)}` : 'Aún no lo has usado'}
              </p>
            </div>
            <button className="icon-btn" aria-label="Renombrar" onClick={() => setEditingName(true)}>
              <Pencil />
            </button>
          </div>
        )}

        {!av.available && (
          <div className="callout warn">
            <TriangleAlert />
            <span>
              <b>No disponible.</b> {av.missing.map((m) => `${m.name} está ${MISSING_LABEL[m.reason]}`).join('; ')}.
            </span>
          </div>
        )}

        <div className="stack" style={{ gap: 6 }}>
          <div className="section-title">
            <h3>Prendas ({items.length})</h3>
            <button className="btn sm soft" onClick={() => setPicking(true)}>
              <Plus /> Editar prendas
            </button>
          </div>
          <div className="card-list">
            {sortedItems.map((g) => (
              <GarmentRow
                key={g.id}
                garment={g}
                onClick={() => navigate(`/guardarropa/${g.id}`)}
                sub={`${idx.positionOfType(g.type_id)?.name ?? ''} · ${idx.typeName(g.type_id)}${g.status !== 'available' ? ` · ${g.status === 'laundry' ? 'en el cesto' : 'archivada'}` : ''}`}
                right={
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label={`Quitar ${g.name} del outfit`}
                    onClick={() => void updateOutfit(outfit, { garment_ids: outfit.garment_ids.filter((x) => x !== g.id) })}
                  >
                    <X />
                  </button>
                }
              />
            ))}
            {items.length === 0 && <p className="list-item muted">Sin prendas.</p>}
          </div>
        </div>

        {(warnings.conflicts.length > 0 || warnings.structure.length > 0) && (
          <div className="callout warn">
            <TriangleAlert />
            <div>
              <b>Según tus reglas:</b>
              <ul>
                {warnings.structure.map((s) => (
                  <li key={s}>{s}</li>
                ))}
                {warnings.conflicts.map((c) => (
                  <li key={`${c.a.id}-${c.b.id}`}>
                    “{c.a.name}” + “{c.b.name}”: {c.verdict.reason}
                  </li>
                ))}
              </ul>
              <span className="small">Puedes guardarlo igual; son solo avisos.</span>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button className="btn primary" disabled={!av.available || items.length === 0} onClick={() => setWearing(true)}>
            <CalendarCheck /> Lo usé hoy
          </button>
          <button
            className="btn"
            onClick={() => {
              gen.setPinned(items.filter((g) => g.status === 'available').map((g) => g.id));
              gen.setResult(null);
              navigate('/');
            }}
          >
            <Sparkles /> Variar
          </button>
        </div>

        <div className="field">
          <span className="label">Etiquetas</span>
          <TagsInput value={outfit.tags} onChange={(tags) => void updateOutfit(outfit, { tags })} />
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h3>Fotos tuyas con este outfit</h3>
          {outfit.photo_paths.length > 0 && (
            <div className="photos-grid">
              {outfit.photo_paths.map((p) => (
                <OutfitPhoto
                  key={p}
                  path={p}
                  onOpen={() => setViewer(p)}
                  onRemove={async () => {
                    if (await confirm({ title: 'Quitar foto', confirmText: 'Quitar', danger: true })) await removeOutfitPhoto(outfit, p);
                  }}
                />
              ))}
            </div>
          )}
          <PhotoInput
            compact
            onFile={async (f) => {
              try {
                await addOutfitPhoto(outfit, f);
                toast('Foto agregada');
              } catch (e) {
                toast(`No se pudo agregar: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="o-notes">Notas</label>
          <textarea id="o-notes" className="textarea" maxLength={1000} defaultValue={outfit.notes ?? ''} onBlur={(e) => e.target.value !== (outfit.notes ?? '') && void updateOutfit(outfit, { notes: e.target.value.trim() || null })} />
        </div>

        <button className="btn danger block" onClick={() => void remove()}>
          <Trash2 /> Eliminar outfit
        </button>
        <p className="hint center">
          <Link to="/outfits?vista=calendar">Ver calendario</Link>
        </p>
      </div>

      {picking && (
        <GarmentPicker
          title="Prendas del outfit"
          garments={garments.filter((g) => g.status !== 'archived' || outfit.garment_ids.includes(g.id))}
          multiple
          initial={outfit.garment_ids.filter((id) => byId.has(id))}
          confirmText="Guardar"
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            void updateOutfit(outfit, { garment_ids: ids });
            setPicking(false);
          }}
        />
      )}
      {wearing && <WearSheet garmentIds={items.map((g) => g.id)} outfitId={outfit.id} onClose={() => setWearing(false)} />}
      {viewer && <PhotoViewer path={viewer} onClose={() => setViewer(null)} />}
    </Page>
  );
}

function OutfitPhoto({ path, onOpen, onRemove }: { path: string; onOpen: () => void; onRemove: () => void }) {
  const url = usePhotoUrl(path, 'thumb');
  return (
    <div className="photo" style={{ cursor: 'pointer' }} onClick={onOpen}>
      {url ? <img src={url} alt="Foto del outfit" /> : <span className="tiny">Cargando…</span>}
      <button
        className="icon-btn sm remove"
        aria-label="Quitar foto"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X />
      </button>
    </div>
  );
}

function PhotoViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const url = usePhotoUrl(path, 'full');
  return (
    <div className="viewer" onClick={onClose} role="dialog" aria-label="Foto">
      {url ? <img src={url} alt="Foto del outfit" /> : <span style={{ color: '#fff' }}>Cargando…</span>}
      <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
        <X />
      </button>
    </div>
  );
}
