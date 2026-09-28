// Botones "Tomar foto" (abre la cámara del celular) y "Galería".

import { Camera, ImagePlus } from 'lucide-react';
import { useRef } from 'react';

export function PhotoInput({ onFile, compact }: { onFile: (f: File) => void; compact?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <div className="row-wrap">
      <input ref={cam} className="file-input" type="file" accept="image/*" capture="environment" onChange={handle} />
      <input ref={gal} className="file-input" type="file" accept="image/*" onChange={handle} />
      <button type="button" className={`btn ${compact ? 'sm' : ''}`} onClick={() => cam.current?.click()}>
        <Camera /> Tomar foto
      </button>
      <button type="button" className={`btn ${compact ? 'sm' : ''}`} onClick={() => gal.current?.click()}>
        <ImagePlus /> Galería
      </button>
    </div>
  );
}
