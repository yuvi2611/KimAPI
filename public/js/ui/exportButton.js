import { $ } from '../lib/dom.js';
import { state } from '../state.js';
import { exportScope } from '../selectors.js';

/** The label says exactly what a click will do: the selection, or everything currently shown. */
export function renderExport(vis) {
  const button = $('#export');
  button.hidden = !state.items.length;
  if (state.exporting) return; // the click handler owns the label while a file is being built
  const n = exportScope(vis).length;
  $('#exportLabel').textContent = state.selected.size ? `Export ${n} selected` : `Export ${n} shown`;
  button.disabled = !n;
}
