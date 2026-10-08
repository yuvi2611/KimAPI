const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for safe use inside HTML. EVERY retailer-supplied string must go through this. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** 1234.5 -> "R1,234.50" */
export const money = (n) => `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const num = (n) => n.toLocaleString('en-US');

/** Percentage off when a product is on special, else 0. */
export const offPct = (p) => (p.was && p.price ? Math.round((1 - p.price / p.was) * 100) : 0);

export const clock = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
