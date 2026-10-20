import { create } from 'zustand';

interface ToastState {
  toasts: { id: number; text: string }[];
}
export const useToasts = create<ToastState>(() => ({ toasts: [] }));
let nextId = 1;

export function toast(text: string): void {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text }].slice(-3) }));
  window.setTimeout(() => {
    useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 3000);
}
