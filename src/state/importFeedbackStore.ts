import { create } from 'zustand';

/**
 * One-shot, app-global message for files imported via the OS "Open with" flow.
 * The dismiss timer is self-managed (a plain setTimeout) rather than relying on
 * react-native-paper's animation-gated timer, which does not fire on some
 * devices (e.g. Samsung One UI with reduced animations) — see useTimedSnackbar.
 */
interface ImportFeedbackState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useImportFeedbackStore = create<ImportFeedbackState>((set) => ({
  message: null,
  show: (message) => {
    if (timer) clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => {
      timer = undefined;
      set({ message: null });
    }, 3500);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    set({ message: null });
  },
}));
