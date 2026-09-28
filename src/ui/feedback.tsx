// Avisos breves (toasts) y diálogos de confirmación basados en promesas:
//   const ok = await confirm({ title: '¿Eliminar?', danger: true });

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: string, action?: ToastItem['action'], ms?: number) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);

  const toast = useCallback<FeedbackApi['toast']>((text, action, ms = 3200) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? Math.max(ms, 5000) : ms);
  }, []);

  const confirm = useCallback<FeedbackApi['confirm']>((o) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <span>{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      {dialog &&
        createPortal(
          <div className="overlay center" onClick={() => close(false)}>
            <div className="dialog stack" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
              <h2 id="dlg-title">{dialog.title}</h2>
              {dialog.message && <div className="muted">{dialog.message}</div>}
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => close(false)}>
                  {dialog.cancelText ?? 'Cancelar'}
                </button>
                <button className={`btn ${dialog.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
                  {dialog.confirmText ?? 'Aceptar'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('FeedbackProvider falta');
  return v;
}
