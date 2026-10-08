/**
 * Every plain request to our own server. (The live search stream is in stream.js.)
 * Functions throw `ApiError`; a 401 sets `status = 401` so callers can send the user to sign in.
 */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const JSON_POST = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || `Request failed (HTTP ${res.status}).`, res.status);
  return body;
}

/** @returns {Promise<{auth: boolean, user: string|null}>} */
export async function fetchSession() {
  return parse(await fetch('/api/me', { cache: 'no-store' }));
}

export async function logout() {
  await fetch('/api/logout', { ...JSON_POST, body: '{}' });
}

/** Re-fetch one product's details. Returns a fresh Product. */
export async function fetchProduct(p) {
  const qs = new URLSearchParams({
    source: p.source,
    url: p.url,
    name: p.name,
    price: p.price ?? '',
    image: p.image || '',
  });
  return parse(await fetch(`/api/product?${qs}`));
}

/** @returns {Promise<Blob>} the .xlsx file */
export async function exportXlsx(products) {
  const res = await fetch('/api/export', { ...JSON_POST, body: JSON.stringify({ products }) });
  if (!res.ok) await parse(res); // throws ApiError with the server's message
  return res.blob();
}
