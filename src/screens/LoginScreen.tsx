import { Eye, EyeOff, LogIn, Shirt } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../app/auth';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <div className="logo">
          <Shirt />
        </div>
        <div className="center stack" style={{ gap: 4 }}>
          <h1>Guardarropa</h1>
          <p className="muted small">Inicia sesión para ver tu ropa y generar outfits.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <div className="row">
            <input
              id="password"
              className="input grow"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary big block" disabled={busy}>
          <LogIn /> {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted tiny center">No hay registro público: la cuenta se crea desde el panel de Supabase.</p>
      </form>
    </div>
  );
}
