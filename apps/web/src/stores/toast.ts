import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push(kind: ToastKind, text: string): void;
  dismiss(id: number): void;
}

let seq = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, text) {
    const id = seq++;
    set({ toasts: [...get().toasts.filter((t) => t.text !== text), { id, kind, text }].slice(-4) });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (t: string) => useToasts.getState().push('info', t),
  success: (t: string) => useToasts.getState().push('success', t),
  warning: (t: string) => useToasts.getState().push('warning', t),
  error: (t: string) => useToasts.getState().push('error', t),
};
