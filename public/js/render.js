/**
 * One function that makes the screen match `state`. Cheap to call: each part below only
 * touches the DOM where something actually changed.
 */
import { state } from './state.js';
import { visible, cheapestId } from './selectors.js';
import { renderMeta } from './ui/header.js';
import { renderTabs, renderNotices } from './ui/toolbar.js';
import { renderInsights } from './ui/insights.js';
import { syncRows } from './ui/list.js';
import { syncGallery } from './ui/gallery.js';
import { renderEmpty } from './ui/empty.js';
import { renderLoadMore } from './ui/loadmore.js';
import { renderExport } from './ui/exportButton.js';
import { renderDrawer } from './ui/drawer.js';

export function renderAll() {
  const vis = visible();
  const priced = vis.filter((p) => p.price != null);
  state.lowId = cheapestId(priced);

  renderMeta(vis);
  renderTabs();
  renderNotices();
  renderInsights(vis, priced);
  if (state.view === 'list') syncRows(vis);
  else syncGallery(vis);
  renderEmpty(vis);
  renderLoadMore();
  renderExport(vis);
  renderDrawer();
}
