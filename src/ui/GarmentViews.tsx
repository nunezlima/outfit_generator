// Foto de prenda (o marcador con ícono y color), tarjeta y fila de lista.

import { Archive, WashingMachine } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePhotoUrl } from '../data/photos';
import { getColor } from '../domain/colors';
import type { Garment } from '../domain/types';
import { useCatalogIndex } from './CatalogContext';
import { ROLE_ICON } from './icons';

export function ColorSwatch({ color, size = 16 }: { color: string | null | undefined; size?: number }) {
  const c = getColor(color);
  if (!c) return null;
  return <span className="swatch" style={{ background: c.hex, width: size, height: size }} title={c.label} />;
}

export function GarmentPhoto({ garment, variant = 'thumb', className = '' }: { garment: Pick<Garment, 'photo_path' | 'type_id' | 'color' | 'name'>; variant?: 'thumb' | 'full'; className?: string }) {
  const url = usePhotoUrl(garment.photo_path, variant);
  const idx = useCatalogIndex();
  const role = idx.roleOfType(garment.type_id);
  const Icon = role ? ROLE_ICON[role] : ROLE_ICON.top;
  const color = getColor(garment.color);
  return (
    <div className={`photo ${className}`}>
      {url ? (
        <img src={url} alt={garment.name} loading="lazy" decoding="async" />
      ) : (
        <div className="placeholder">
          <Icon />
          <span>{idx.typeName(garment.type_id)}</span>
        </div>
      )}
      {!url && color && <i className="color-band" style={{ background: color.hex }} />}
    </div>
  );
}

export function StatusBadge({ status }: { status: Garment['status'] }) {
  if (status === 'laundry')
    return (
      <span className="badge warn">
        <WashingMachine /> Cesto
      </span>
    );
  if (status === 'archived')
    return (
      <span className="badge">
        <Archive /> Archivada
      </span>
    );
  return null;
}

export function GarmentCard({ garment, onClick, selected, dim, corner }: { garment: Garment; onClick?: () => void; selected?: boolean; dim?: boolean; corner?: ReactNode }) {
  const idx = useCatalogIndex();
  return (
    <button type="button" className={`garment-card${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} onClick={onClick}>
      <GarmentPhoto garment={garment} />
      <div className="corner">
        <span>{corner}</span>
        <StatusBadge status={garment.status} />
      </div>
      <div className="info">
        <div className="name">{garment.name}</div>
        <div className="meta">
          <ColorSwatch color={garment.color} size={11} />
          <span className="ellipsis">{idx.typeName(garment.type_id)}</span>
        </div>
      </div>
    </button>
  );
}

export function GarmentRow({ garment, sub, right, onClick, size = '' }: { garment: Garment; sub?: ReactNode; right?: ReactNode; onClick?: () => void; size?: '' | 'sm' | 'lg' }) {
  const idx = useCatalogIndex();
  const content = (
    <>
      <GarmentPhoto garment={garment} className={`thumb ${size}`} />
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {garment.name}
        </div>
        <div className="small muted clamp-2">{sub ?? idx.typeName(garment.type_id)}</div>
      </div>
    </>
  );
  return (
    <div className="list-item">
      {onClick ? (
        <button type="button" className="row-main" onClick={onClick}>
          {content}
        </button>
      ) : (
        content
      )}
      {right}
    </div>
  );
}
