'use strict';

/**
 * Stock from a schema.org `availability` URL (what most storefronts put in JSON-LD).
 * 'Yes' / 'No', or null when the page does not say. Null is shown as "Not stated", never guessed.
 * @param {string} [availability]
 * @returns {'Yes'|'No'|null}
 */
function stockFromSchema(availability) {
  if (!availability) return null;
  if (/InStock/i.test(availability)) return 'Yes';
  if (/OutOfStock|SoldOut/i.test(availability)) return 'No';
  return null;
}

module.exports = { stockFromSchema };
