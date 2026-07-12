"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangleIcon, CheckIcon } from "@/components/icons";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

/** Fire-and-forget feedback for in-place actions ("Stage updated", "WhatsApp sent") —
 * before this, most actions gave no visible confirmation at all, so users on slow
 * connections tapped again not knowing whether the first tap registered. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-pop-in pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-pop ${
              t.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-white text-slate-700"
            }`}
          >
            {t.tone === "error"
              ? <AlertTriangleIcon className="h-4 w-4 shrink-0 text-red-500" />
              : <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
