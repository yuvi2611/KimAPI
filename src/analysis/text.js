'use strict';
const { clean } = require('../util');

/** Strip retailer boilerplate and fix run-together words ("gentleSoft" -> "gentle Soft"). */
function tidy(text) {
  return clean(text)
    .replace(/^Description:?\s*/i, '')
    .replace(/Detailed Description:?/i, ' ')
    .replace(/(Pack size|Quantity in pack|Marketing description|Endorsements|Package type)\s*:.*$/i, '')
    .replace(/See more See less/gi, '')
    .replace(/([a-z)])([A-Z][a-z])/g, '$1 $2');
}

/** Shorten at a word boundary and add an ellipsis. */
function cut(text, max) {
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

/** Short blurb for cards: marketing copy only, stopping before ingredients/directions. */
function summarise(text, max = 420) {
  const head = tidy(text).split(/\b(?:Ingredients|Directions|Warnings?|How to use|Features)\s*:/i)[0];
  return cut(clean(head), max);
}

/** Longer description for the spreadsheet: copy plus directions, but not the ingredient list. */
function fullDescription(text, max = 1800) {
  const head = tidy(text).split(/\bIngredients\s*:/i)[0];
  return cut(clean(head), max);
}

module.exports = { tidy, cut, summarise, fullDescription };
