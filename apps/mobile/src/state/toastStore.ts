import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

interface ToastState {
  message: string;
  variant: ToastVariant;
  visible: boolean;
  show: (message: string, variant?: ToastVariant) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  variant: 'info',
  visible: false,
  show: (message, variant = 'info') => {
    if (timer) clearTimeout(timer);
    set({ message, variant, visible: true });
    timer = setTimeout(() => set({ visible: false }), 2600);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ visible: false });
  },
}));

/** Imperative helper for non-component call sites. */
export const toast = {
  success: (m: string) => useToastStore.getState().show(m, 'success'),
  warning: (m: string) => useToastStore.getState().show(m, 'warning'),
  danger: (m: string) => useToastStore.getState().show(m, 'danger'),
  info: (m: string) => useToastStore.getState().show(m, 'info'),
};
