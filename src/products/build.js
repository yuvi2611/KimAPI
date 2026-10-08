'use strict';
const { friendlyMessage } = require('../errors');
const { orNull, validPrice } = require('../util');
const { summarise, fullDescription } = require('../analysis/text');
const { claimList } = require('../analysis/claims');
const { guessType, findGender, ingredientConcept } = require('../analysis/classify');

/**
 * Build one product record from a search-listing item plus its product page.
 *
 * THE RULE: a field we cannot find is null. Never invented, never defaulted.
 * If the product page fails to load we still return the listing data with `detailError` set,
 * so the UI can show a Retry button instead of dropping the product.
 *
 * @param {import('../types').Retailer} retailer
 * @param {import('../types').ListingItem} item
 * @returns {Promise<import('../types').Product>}
 */
async function buildProduct(retailer, item) {
  let detail = {};
  let detailError = null;
  try {
    detail = (await retailer.detail(item)) || {};
  } catch (e) {
    detailError = friendlyMessage(e, retailer.label);
  }

  const raw = detail.desc || '';
  const price = validPrice(detail.livePrice) ?? item.price ?? null;
  const copy = fullDescription(raw, 100_000); // marketing text only, uncapped, for analysis
  const claims = claimList(item.name, raw);

  return {
    id: `${retailer.key}:${item.url}`,
    retailer: retailer.label,
    source: retailer.key,
    brand: orNull(detail.brand || item.brand),
    name: item.name,
    price,
    was: item.was && price && item.was > price ? item.was : null,
    description: raw ? orNull(summarise(raw)) : null,
    fullDescription: raw ? orNull(fullDescription(raw)) : null,
    promise: claims.length ? claims.join(' · ') : null,
    type: guessType(item.name),
    gender: findGender(item.name, copy),
    ingredientConcept: ingredientConcept(copy, detail.ingredients),
    inStock: detail.inStock ?? null,
    sku: detail.sku || null,
    size: detail.size || null,
    image: item.image,
    url: item.url,
    detailError,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { buildProduct };
