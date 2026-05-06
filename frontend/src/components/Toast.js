import React, { useState, useCallback, useMemo, createContext, useContext } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type, removing: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  const value = useMemo(() => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 5000),
    info: (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning', 4000),
  }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: 'fixed',
        top: 76,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const typeStyles = {
  success: { bg: '#eafaf1', border: '#27ae60', color: '#1e8449', icon: '\u2713' },
  error:   { bg: '#fdedec', border: '#e74c3c', color: '#c0392b', icon: '\u2717' },
  info:    { bg: '#ebf5fb', border: '#3498db', color: '#2471a3', icon: '\u2139' },
  warning: { bg: '#fef5e7', border: '#f39c12', color: '#b7770d', icon: '\u26A0' },
};

function ToastItem({ toast }) {
  const s = typeStyles[toast.type] || typeStyles.info;
  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderLeft: `4px solid ${s.border}`,
      color: s.color,
      padding: '10px 18px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      pointerEvents: 'auto',
      minWidth: 250,
      maxWidth: 400,
      animation: toast.removing ? 'toast-out 0.3s ease forwards' : 'toast-in 0.3s ease',
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
      <span>{toast.message}</span>
    </div>
  );
}

export default ToastProvider;
