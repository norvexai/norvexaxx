import React, { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = "ok") => {
    const id = crypto.randomUUID();
    setItems(list => [...list, { id, message, kind }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 4800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
