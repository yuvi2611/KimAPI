'use strict';
/**
 * Excel export. Mirrors the team's PCPD sheet: columns B, D, I, J, K are deliberately left
 * EMPTY, because managers write their own notes there. Do not fill them.
 */
const ExcelJS = require('exceljs');
const { validPrice } = require('../util');

const NOT_FOUND = 'Not found';
const MAX_CELL = 32_000; // Excel's hard limit is 32,767 characters

/** Column order is the contract with the team's sheet. `key` maps to row fields below. */
const SHEET_COLUMNS = [
  { header: 'Product', key: 'name', width: 38 },
  { header: '', key: 'blank1', width: 4 }, // manager notes
  { header: 'Type', key: 'type', width: 16 },
  { header: 'Status', key: 'status', width: 12 }, // manager notes
  { header: 'In stock?', key: 'inStock', width: 11 },
  { header: 'Gender', key: 'gender', width: 11 },
  { header: 'Ingredient concept', key: 'ingredientConcept', width: 28 },
  { header: 'Claim', key: 'claim', width: 38 },
  { header: 'Olfactive descriptor', key: 'olfDesc', width: 20 }, // manager notes
  { header: 'Olfactive Classification', key: 'olfClass', width: 22 }, // manager notes
  { header: 'Pyramid (online)', key: 'pyramid', width: 20 }, // manager notes
  { header: 'Online description', key: 'description', width: 95 },
  { header: 'Price (ZAR)', key: 'price', width: 13 },
  { header: 'Link', key: 'url', width: 18 },
];

/** Keys filled with "Not found" styling when empty. */
const DATA_KEYS = ['type', 'inStock', 'gender', 'ingredientConcept', 'claim', 'description', 'price'];

/**
 * Cell-safe text. Empty becomes "Not found". A leading = + - @ would make Excel run the text as a
 * formula (a known attack on spreadsheets built from web content), so we neutralise it.
 */
function safeCell(value) {
  if (value == null || value === '') return NOT_FOUND;
  let s = String(value).slice(0, MAX_CELL);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

/** Sheet names: max 31 chars, no \ / ? * [ ] : . The team's template calls Dis-Chem "Dischem". */
const sheetName = (retailer) =>
  String(retailer || 'Products')
    .replace(/[\\/?*[\]:]/g, '')
    .replace('Dis-Chem', 'Dischem')
    .slice(0, 31) || 'Products';

const displayName = (p) => {
  const name = String(p.name);
  return p.brand && !name.toLowerCase().startsWith(String(p.brand).toLowerCase()) ? `${p.brand} ${name}` : name;
};

const GREY_ITALIC = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF9CA3AF' } };

/** @param {object} p a Product as sent by the browser (untrusted input) */
function toRow(p) {
  return {
    name: safeCell(displayName(p)),
    type: safeCell(p.type),
    inStock: p.inStock || 'Unknown',
    gender: safeCell(p.gender),
    ingredientConcept: safeCell(p.ingredientConcept),
    claim: safeCell((p.promise || '').split(' · ').filter(Boolean).join(', ')),
    description: safeCell(p.fullDescription || p.description),
    price: validPrice(Number(p.price)) ?? NOT_FOUND,
    url: /^https:\/\//.test(p.url || '') ? { text: 'View', hyperlink: p.url } : NOT_FOUND,
  };
}

function styleSheet(ws) {
  const head = ws.getRow(1);
  head.height = 32;
  head.eachCell({ includeEmpty: true }, (c) => {
    c.font = { bold: true, name: 'Arial', size: 10 };
    c.alignment = { vertical: 'bottom', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  });
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      if (!c.font || !c.font.italic) c.font = { name: 'Arial', size: 9 };
      c.alignment = { vertical: 'bottom', wrapText: true };
      c.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
    });
    if (typeof row.getCell('price').value === 'number') row.getCell('price').numFmt = '"R"#,##0.00';
    if (row.getCell('url').value?.hyperlink) {
      row.getCell('url').font = { name: 'Arial', size: 9, color: { argb: 'FF1155CC' }, underline: true };
    }
  });
}

/**
 * One worksheet per retailer, identical columns.
 * @param {object[]} products
 * @returns {Promise<Buffer>}
 */
async function buildWorkbook(products) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kimi';

  const byRetailer = new Map();
  for (const p of products) {
    const key = String(p.retailer || 'Products');
    if (!byRetailer.has(key)) byRetailer.set(key, []);
    byRetailer.get(key).push(p);
  }

  for (const [retailer, list] of byRetailer) {
    const ws = wb.addWorksheet(sheetName(retailer), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = SHEET_COLUMNS;
    for (const p of list) {
      const row = ws.addRow(toRow(p));
      // grey italics = "this was missing", so a human can scan for gaps
      for (const key of DATA_KEYS) {
        const cell = row.getCell(key);
        if (cell.value === NOT_FOUND || cell.value === 'Unknown') cell.font = GREY_ITALIC;
      }
    }
    styleSheet(ws);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildWorkbook, safeCell, sheetName, toRow, SHEET_COLUMNS, NOT_FOUND };
