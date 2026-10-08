/** Per-product network actions: retry details, export to Excel. */
import { ApiError, exportXlsx, fetchProduct } from '../api/client.js';
import { $ } from '../lib/dom.js';
import { ICON } from '../lib/icons.js';
import { toast } from '../lib/toast.js';
import { schedule } from '../scheduler.js';
import { state } from '../state.js';
import { exportScope, visible } from '../selectors.js';
import { toLogin } from './session.js';

/** A short, human message for any failure. */
function describe(err) {
  if (err instanceof ApiError) return err.message;
  return err.message === 'Failed to fetch' ? 'Couldn’t reach the app. Is it still running?' : err.message;
}

/** Re-fetch a product whose page failed to load. */
export async function retryProduct(product, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Retrying…';
  }
  try {
    const fresh = await fetchProduct(product);
    Object.assign(product, fresh, { _o: product._o, _v: product._v + 1 }); // keep order; bump version to rebuild
    fresh.detailError
      ? toast('Still couldn’t load the details. Try again in a moment.', 'error')
      : toast('Details loaded.', 'ok');
  } catch (err) {
    if (err.status === 401) return toLogin();
    toast(describe(err), 'error');
    product._v++; // rebuild so the button resets
  }
  schedule();
}

/** Build the .xlsx on the server and download it. */
export async function exportSelected() {
  const rows = exportScope(visible());
  if (!rows.length) return toast('Nothing to export yet.', 'error');
  if (!navigator.onLine) return toast('You’re offline.', 'error');

  const button = $('#export');
  const label = $('#exportLabel');
  const icon = $('#exportIco');
  const oldLabel = label.textContent;
  const oldIcon = icon.innerHTML;

  state.exporting = true;
  button.disabled = true;
  icon.innerHTML = '<span class="spinner"></span>';
  label.textContent = 'Building…';
  let ok = false;

  try {
    const blob = await exportXlsx(rows);
    const url = URL.createObjectURL(blob);
    const slug =
      state.q
        .replace(/[^\w]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'products';
    const a = Object.assign(document.createElement('a'), { href: url, download: `kimi-${slug}.xlsx` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    const missing = rows.filter((p) => p.price == null || p.detailError).length;
    toast(
      `Exported ${rows.length} product${rows.length > 1 ? 's' : ''}.${missing ? ` ${missing} had missing data, marked “Not found”.` : ''}`,
      'ok',
    );
    ok = true;
  } catch (err) {
    if (err.status === 401) return toLogin();
    toast(describe(err), 'error');
  }

  if (ok) {
    icon.innerHTML = ICON.check;
    label.textContent = 'Exported';
    await new Promise((r) => setTimeout(r, 1600)); // let the tick show
  }
  icon.innerHTML = oldIcon;
  label.textContent = oldLabel;
  state.exporting = false;
  button.disabled = false;
  schedule();
}
