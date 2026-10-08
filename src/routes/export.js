'use strict';
/** POST /api/export  { products: Product[] }  ->  an .xlsx file. */
const express = require('express');
const { buildWorkbook } = require('../export/workbook');

/** @param {{ maxRows: number }} options */
function createExportRouter({ maxRows }) {
  const router = express.Router();

  router.post('/export', async (req, res) => {
    const products = Array.isArray(req.body?.products)
      ? req.body.products.filter((p) => p && typeof p === 'object' && p.name)
      : [];
    if (!products.length) return res.status(400).json({ error: 'Nothing to export. Select at least one product.' });
    if (products.length > maxRows)
      return res.status(400).json({ error: `Too many products for one export (limit ${maxRows}).` });

    try {
      const file = await buildWorkbook(products);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="products-${Date.now()}.xlsx"`,
      });
      res.send(file);
    } catch (e) {
      console.error('export failed:', e);
      res.status(500).json({ error: 'Could not build the Excel file. Please try again.' });
    }
  });

  return router;
}

module.exports = { createExportRouter };
