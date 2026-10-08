'use strict';
/**
 * Shared shapes, documented once as JSDoc so editors can autocomplete and a new developer can
 * see the data model at a glance. This file has no runtime code.
 *
 * @typedef {ReturnType<typeof import('./config').loadConfig>} Config
 *
 * @typedef {object} ListingItem  One tile on a retailer's search page.
 * @property {string} name
 * @property {string} url          Absolute https product link.
 * @property {number|null} price   Current price in rand.
 * @property {number|null} was     Previous price when on special.
 * @property {string|null} image
 * @property {string} [brand]
 *
 * @typedef {object} Retailer  What every store adapter must provide.
 * @property {string} key          Short id, e.g. "dischem". Used in URLs and ids.
 * @property {string} label        Display name, e.g. "Dis-Chem".
 * @property {string} host         Hostname product links must belong to.
 * @property {(q: string, n: number) => Promise<{items: ListingItem[], total: number|null}>} page
 *           One page of search results (n is 0-based). total = how many exist, or null if unknown.
 * @property {(item: ListingItem) => Promise<object>} detail
 *           Fields from the product page: brand, desc, ingredients, livePrice, inStock, sku, size.
 *
 * @typedef {object} Product  The record sent to the browser and written to Excel.
 *   Every field except id/name/url may be null, meaning "the retailer did not state it".
 * @property {string} id           "<retailer key>:<url>", unique per product.
 * @property {string} retailer     Display name.
 * @property {string} source       Retailer key.
 * @property {string|null} brand
 * @property {string} name
 * @property {number|null} price
 * @property {number|null} was
 * @property {string|null} description     Short blurb for cards.
 * @property {string|null} fullDescription Longer text for the spreadsheet.
 * @property {string|null} promise         Claims joined with " · ".
 * @property {string|null} type
 * @property {'Male'|'Female'|'Unisex'|null} gender
 * @property {string|null} ingredientConcept
 * @property {'Yes'|'No'|null} inStock
 * @property {string|null} sku
 * @property {string|null} size
 * @property {string|null} image
 * @property {string} url
 * @property {string|null} detailError     Set when the product page failed to load (UI offers Retry).
 * @property {string} fetchedAt            ISO timestamp.
 */
module.exports = {};
