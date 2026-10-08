'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildWorkbook, safeCell, sheetName, SHEET_COLUMNS, NOT_FOUND } = require('../src/export/workbook');

const product = (over = {}) => ({
  name: 'Face Wash 150ml',
  brand: 'Nivea',
  retailer: 'Dis-Chem',
  price: 44.99,
  type: 'Face wash',
  gender: null,
  ingredientConcept: 'Niacinamide',
  promise: 'Oily skin · Cleanses',
  fullDescription: 'Cleans deeply.',
  inStock: 'Yes',
  url: 'https://www.dischem.co.za/x',
  ...over,
});

async function read(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
const cellText = (c) => (c.value && c.value.text ? c.value.text : c.value);

describe('workbook cells', () => {
  it('missing values become "Not found", never blank or guessed', () => {
    for (const v of [null, undefined, '']) assert.equal(safeCell(v), NOT_FOUND);
  });

  it('neutralises spreadsheet formulas coming from web content', () => {
    for (const evil of ['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)']) {
      assert.ok(safeCell(evil).startsWith("'"), `${evil} should be escaped`);
    }
    assert.equal(safeCell('Normal text'), 'Normal text');
  });

  it('never exceeds Excel’s cell limit', () => {
    assert.ok(safeCell('x'.repeat(40_000)).length <= 32_000);
  });

  it('makes valid, template-matching sheet names', () => {
    assert.equal(sheetName('Dis-Chem'), 'Dischem');
    assert.equal(sheetName('Clicks'), 'Clicks');
    assert.equal(sheetName('Bad/Name?*[]:'), 'BadName');
    assert.equal(sheetName(''), 'Products');
    assert.ok(sheetName('x'.repeat(60)).length <= 31);
  });
});

describe('workbook layout matches the team sheet', () => {
  it('uses the exact column order, with blank headers for the manager columns', async () => {
    const wb = await read(await buildWorkbook([product()]));
    const headers = wb.getWorksheet('Dischem').getRow(1).values.slice(1);
    assert.deepEqual(
      headers.map((h) => h || ''),
      SHEET_COLUMNS.map((c) => c.header),
    );
    assert.deepEqual(SHEET_COLUMNS.map((c) => c.header).slice(0, 6), [
      'Product',
      '',
      'Type',
      'Status',
      'In stock?',
      'Gender',
    ]);
  });

  it('leaves the manager columns (B, D, I, J, K) completely empty', async () => {
    const wb = await read(await buildWorkbook([product(), product({ name: 'Other' })]));
    const ws = wb.getWorksheet('Dischem');
    for (const rowNo of [2, 3]) {
      for (const col of ['B', 'D', 'I', 'J', 'K']) {
        assert.equal(ws.getCell(`${col}${rowNo}`).value, null, `${col}${rowNo} must stay empty`);
      }
    }
  });

  it('fills the data columns and marks gaps as "Not found"', async () => {
    const ws = (await read(await buildWorkbook([product()]))).getWorksheet('Dischem');
    assert.equal(ws.getCell('A2').value, 'Nivea Face Wash 150ml');
    assert.equal(ws.getCell('C2').value, 'Face wash');
    assert.equal(ws.getCell('F2').value, NOT_FOUND, 'gender was not stated');
    assert.equal(ws.getCell('H2').value, 'Oily skin, Cleanses');
    assert.equal(ws.getCell('M2').value, 44.99);
    assert.equal(cellText(ws.getCell('N2')), 'View');
  });

  it('handles a product with no price or details at all', async () => {
    const ws = (await read(await buildWorkbook([{ name: 'Bare', retailer: 'Clicks' }]))).getWorksheet('Clicks');
    assert.equal(ws.getCell('M2').value, NOT_FOUND);
    assert.equal(ws.getCell('L2').value, NOT_FOUND);
    assert.equal(ws.getCell('E2').value, 'Unknown');
  });

  it('creates one tab per retailer', async () => {
    const wb = await read(
      await buildWorkbook([product(), product({ retailer: 'Clicks' }), product({ retailer: 'Clicks', name: 'B' })]),
    );
    assert.deepEqual(wb.worksheets.map((w) => w.name).sort(), ['Clicks', 'Dischem']);
    assert.equal(wb.getWorksheet('Clicks').rowCount, 3);
  });

  it('does not double the brand when the name already starts with it', async () => {
    const ws = (await read(await buildWorkbook([product({ name: 'Nivea Face Wash', brand: 'Nivea' })]))).getWorksheet(
      'Dischem',
    );
    assert.equal(ws.getCell('A2').value, 'Nivea Face Wash');
  });

  it('only links to https pages', async () => {
    const ws = (await read(await buildWorkbook([product({ url: 'javascript:alert(1)' })]))).getWorksheet('Dischem');
    assert.equal(ws.getCell('N2').value, NOT_FOUND);
  });
});
