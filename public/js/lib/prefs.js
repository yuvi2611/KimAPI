const KEY = 'kimi.prefs';

/**
 * Per-browser conveniences (theme, view, batch size, recent searches).
 * Storage can be blocked (private windows), so every access is guarded and the app
 * must work without it.
 */
export const prefs = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  },
  write(patch) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.read(), ...patch }));
    } catch {
      /* storage unavailable: ignore */
    }
  },
};
