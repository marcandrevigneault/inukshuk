import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Snackbar message state with a self-managed auto-dismiss timer.
 *
 * Why this exists: react-native-paper's `<Snackbar>` arms its auto-dismiss
 * `setTimeout` ONLY inside the show-animation's completion callback
 * (`Animated.timing(...).start(({ finished }) => { if (finished) setTimeout(...) })`).
 * That animation uses the native driver, and its completion callback is not
 * guaranteed to fire on every device/OEM — notably on Samsung One UI with
 * reduced or disabled animations (battery saver / "Remove animations"). When it
 * doesn't fire, the dismiss timer is never set and the snackbar "sticks" on
 * screen indefinitely.
 *
 * Owning the timer here makes dismissal independent of any animation callback:
 * `show()` starts a plain JS timeout that clears the message after `durationMs`.
 * Pair this with `duration={Infinity}` on the paper `<Snackbar>` so paper never
 * tries (and fails) to manage the timer itself.
 */
export interface TimedSnackbar {
  /** Current message, or null when hidden. */
  message: string | null;
  /** Show a message; auto-dismisses after the configured duration. */
  show: (message: string) => void;
  /** Hide immediately (e.g. the snackbar's action/close). */
  dismiss: () => void;
}

export function useTimedSnackbar(durationMs = 3500): TimedSnackbar {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    setMessage(null);
  }, []);

  const show = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setMessage(null);
      }, durationMs);
    },
    [durationMs],
  );

  // Clear any pending timer on unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show, dismiss };
}
