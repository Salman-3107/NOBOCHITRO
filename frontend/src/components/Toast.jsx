import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import './Toast.css';

// Lightweight toast notifications.
//
// The app previously used window.alert() for both success and failure, which
// blocks the page and looks nothing like the rest of the interface. This
// gives every screen one call -- toast.error(message) -- so server-side
// validation messages surface consistently instead of being swallowed.

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((message, tone = 'info', duration = 4000) => {
    // crypto.randomUUID is available in every browser Vite targets.
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, tone }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    push,
    dismiss,
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error', 6000),
    info: (message) => push(message, 'info'),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="toast__icon" aria-hidden="true">
              {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}
            </span>
            <p className="toast__message">{toast.message}</p>
            <button
              type="button"
              className="toast__close"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Returns a no-op-safe object if used outside the provider, so a component
// can call toast.error() without needing to know how it was mounted.
export function useToast() {
  const context = useContext(ToastContext);
  return context || {
    push: () => {}, dismiss: () => {},
    success: () => {}, error: () => {}, info: () => {},
  };
}
