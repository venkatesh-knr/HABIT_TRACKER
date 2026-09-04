import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  variant: 'error' | 'info';
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface FeedbackContextValue {
  showToast: (message: string, variant?: 'error' | 'info') => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TOAST_DURATION_MS = 3000;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variant: 'error' | 'info' = 'error') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  function respond(value: boolean) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <FeedbackContext.Provider value={{ showToast, confirm }}>
      {children}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.variant}`} role="status">
            {t.message}
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="confirm-overlay" onClick={() => respond(false)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmState.title}</h2>
            <p>{confirmState.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn-link" onClick={() => respond(false)}>
                {confirmState.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={confirmState.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => respond(true)}
              >
                {confirmState.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}

export function useToast() {
  return useFeedback().showToast;
}

export function useConfirm() {
  return useFeedback().confirm;
}
