const svg = (paths, attrs = '', size = 18) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${paths}</svg>`;

/** Inline icons (no icon font, no extra requests). Decorative, so aria-hidden. */
export const ICON = {
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  warn: svg('<path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01"/>'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  searchOff: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>', '', 44),
  warnBig: svg('<path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01"/>', '', 44),
};
