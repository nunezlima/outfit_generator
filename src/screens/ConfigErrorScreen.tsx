import { KeyRound, ShieldAlert } from 'lucide-react';
import type { ConfigProblem } from '../lib/supabase';

export function ConfigErrorScreen({ problem }: { problem: Exclude<ConfigProblem, null> }) {
  const secret = problem === 'secret_key';
  return (
    <div className="login">
      <div className="card stack">
        <div className="logo" style={secret ? { background: 'var(--danger)' } : undefined}>
          {secret ? <ShieldAlert /> : <KeyRound />}
        </div>
        <h1 className="center">{secret ? 'Clave peligrosa detectada' : 'Falta configurar Supabase'}</h1>
        {secret ? (
          <>
            <p>
              La variable <code>VITE_SUPABASE_ANON_KEY</code> contiene la clave <b>service_role / secret</b>. Esa clave salta todas las reglas de
              seguridad y <b>nunca</b> debe estar en el navegador, así que la app se niega a arrancar.
            </p>
            <p>
              1) Cámbiala por la clave pública (<i>anon</i> o <i>publishable</i>). 2) Como pudo quedar expuesta, <b>rótala</b> en Supabase (ver README,
              sección “Si una clave se filtra”).
            </p>
          </>
        ) : (
          <>
            <p>
              Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> con los valores de tu proyecto.
            </p>
            <p className="muted small">
              En tu computadora: copia <code>.env.example</code> como <code>.env</code>. En Vercel: Settings → Environment Variables, y vuelve a
              desplegar. Instrucciones completas en el README.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
