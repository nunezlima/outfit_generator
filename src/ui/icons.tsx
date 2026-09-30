// Íconos por posición del outfit (lucide + dos propios que lucide no tiene).

import { Layers, Layers2, Shirt, SportShoe, Watch, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PositionRole } from '../domain/types';

export function PantsIcon(props: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...(props as object)}>
      <path d="M6 3h12l1.2 18h-5.4L12 10.5 10.2 21H4.8z" />
      <path d="M6.2 7h11.6" />
    </svg>
  );
}

export function DressIcon(props: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...(props as object)}>
      <path d="M9 3h6l-1.2 5.5L19 21H5l5.2-12.5z" />
      <path d="M9.5 8.5h5" />
    </svg>
  );
}

export const ROLE_ICON: Record<PositionRole, ComponentType<LucideProps>> = {
  top: Shirt,
  mid: Layers2,
  outer: Layers,
  bottom: PantsIcon,
  full_body: DressIcon,
  footwear: SportShoe,
  accessory: Watch,
  extra: Layers2,
};
