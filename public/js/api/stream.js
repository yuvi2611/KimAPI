/**
 * Opens the live search (Server-Sent Events) and turns its events into callbacks.
 * Server event contract is documented in src/routes/search.js.
 *
 * @param {{q: string, limit: number, sources: string[], offsets: Record<string, number>}} params
 * @param {{
 *   onStatus: (s: object) => void,
 *   onProduct: (p: object) => void,
 *   onDone: () => void,
 *   onFatal: (f: {message: string}) => void,
 *   onError: () => void,
 * }} handlers
 * @returns {{ close: () => void }}
 */
export function openSearchStream({ q, limit, sources, offsets }, handlers) {
  const url = `/api/search?q=${encodeURIComponent(q)}&limit=${limit}&sources=${sources.join(',')}&offsets=${encodeURIComponent(JSON.stringify(offsets))}`;
  const es = new EventSource(url);
  let finished = false;
  const finish = () => {
    finished = true;
    es.close();
  };

  es.addEventListener('status', (e) => handlers.onStatus(JSON.parse(e.data)));
  es.addEventListener('product', (e) => handlers.onProduct(JSON.parse(e.data)));
  es.addEventListener('fatal', (e) => {
    finish();
    handlers.onFatal(JSON.parse(e.data));
  });
  es.addEventListener('done', () => {
    finish();
    handlers.onDone();
  });
  // The browser also fires `error` when the server closes normally, so ignore it once finished.
  es.onerror = () => {
    if (finished) return;
    finish();
    handlers.onError();
  };

  return { close: finish };
}
