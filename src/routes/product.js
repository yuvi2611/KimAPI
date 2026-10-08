'use strict';
/**
 * GET /api/product?source=dischem&url=https://...&name=...&price=...&image=...
 * Re-fetches one product's details (the "Retry" button). Only product pages on a retailer's
 * own host over https are accepted, so this cannot be used to make the server fetch arbitrary URLs.
 */
const express = require('express');
const { friendlyMessage } = require('../errors');
const { validPrice } = require('../util');
const { buildProduct } = require('../products/build');

/**
 * @param {object} deps
 * @param {Record<string, import('../types').Retailer>} deps.retailers
 * @param {ReturnType<import('../http/fetcher').createFetcher>} deps.fetcher
 */
function createProductRouter({ retailers, fetcher }) {
  const router = express.Router();

  router.get('/product', async (req, res) => {
    const retailer = retailers[String(req.query.source || '')];
    let url;
    try {
      url = new URL(String(req.query.url || ''));
    } catch {
      return res.status(400).json({ error: 'Invalid product link.' });
    }
    if (!retailer || url.protocol !== 'https:' || url.hostname !== retailer.host) {
      return res.status(400).json({ error: 'That link is not a supported retailer product.' });
    }

    fetcher.forget(url.href); // make Retry a genuine re-fetch
    try {
      const product = await buildProduct(retailer, {
        name: String(req.query.name || 'Product'),
        url: url.href,
        price: validPrice(parseFloat(req.query.price)),
        was: null,
        image: req.query.image || null,
        brand: '',
      });
      res.json(product);
    } catch (e) {
      res.status(502).json({ error: friendlyMessage(e, retailer.label) });
    }
  });

  return router;
}

module.exports = { createProductRouter };
