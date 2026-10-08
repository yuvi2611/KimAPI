'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractPromise, claimList } = require('../src/analysis/claims');
const { guessType, findGender, ingredientConcept } = require('../src/analysis/classify');
const { tidy, summarise, fullDescription } = require('../src/analysis/text');
const { clean, num, validPrice, orNull } = require('../src/util');

describe('claims: only what the retailer says', () => {
  it('finds durations and normalises them', () => {
    assert.deepEqual(extractPromise('Nivea Deodorant', 'Gives 48 hours of protection.'), ['48 hours of protection']);
    assert.ok(extractPromise('Mitchum Ultimate 72hour 100ml', '').includes('72 hours'));
    assert.deepEqual(extractPromise('Roll On', 'lasts 48h'), ['48 hours']);
  });

  it('normalises SPF and does not duplicate it', () => {
    assert.deepEqual(extractPromise('Sun Lotion SPF50', 'High SPF 50+ protection'), ['SPF 50']);
  });

  it('returns nothing when the text makes no claim (never guesses)', () => {
    assert.deepEqual(extractPromise('Plain Soap', 'A bar of soap.'), []);
    assert.deepEqual(claimList('Plain Soap', 'A bar of soap.'), []);
  });

  it('puts skin type first and merges near-duplicates (Cleanse/Cleanses)', () => {
    const claims = claimList('Face Wash', 'For oily skin. Cleanses deeply and cleanse daily.');
    assert.equal(claims[0], 'Oily skin');
    assert.equal(claims.filter((c) => /^cleanse/i.test(c)).length, 1);
  });

  it('caps the list at six claims', () => {
    const text = 'long-lasting non-greasy hypoallergenic vegan gentle waterproof soothing refreshing cooling invisible';
    assert.ok(claimList('x', text).length <= 6);
  });
});

describe('classification: null when there is no evidence', () => {
  it('guesses product type from the name', () => {
    assert.equal(guessType('Nivea Face Wash 150ml'), 'Face wash');
    assert.equal(guessType('Vichy Capital Soleil SPF50 Milk'), 'Sunscreen');
    assert.equal(guessType('Mystery Item'), null);
  });

  it('reports gender only when stated', () => {
    assert.equal(findGender('Men Deodorant', ''), 'Male');
    assert.equal(findGender('Moisturiser', 'Perfect for women'), 'Female');
    assert.equal(findGender('Face Wash', 'A unisex formula'), 'Unisex');
    assert.equal(findGender('Face Wash', 'Gentle on skin'), null);
  });

  it('does not call a product male when it also says female', () => {
    assert.notEqual(findGender('Sunscreen', 'for male and female skin'), 'Male');
  });

  it('prefers marketing copy over the raw ingredient list (reported in catalogue order)', () => {
    assert.equal(ingredientConcept('With niacinamide and zinc.', 'AQUA, GLYCERIN, WITCH HAZEL'), 'Niacinamide, Zinc');
  });

  it('falls back to the ingredient list, and returns null if nothing is known', () => {
    assert.match(ingredientConcept('Gentle wash', 'AQUA, GLYCERIN'), /Glycerin/);
    assert.equal(ingredientConcept('Gentle wash', 'AQUA, PARFUM'), null);
  });
});

describe('text helpers', () => {
  it('strips retailer boilerplate and the ingredient list', () => {
    const raw = 'Description: Great soap.Pack size: 150g Ingredients: AQUA, SODIUM';
    assert.equal(fullDescription(raw), 'Great soap.');
    assert.equal(summarise('Description: Short. Ingredients: AQUA'), 'Short.');
  });

  it('truncates long text at a word boundary with an ellipsis', () => {
    const out = summarise('word '.repeat(200), 50);
    assert.ok(out.endsWith('…') && out.length <= 52);
  });

  it('repairs words run together by the retailer markup', () => {
    assert.equal(tidy('gentleSoft skin'), 'gentle Soft skin');
  });
});

describe('util', () => {
  it('validPrice accepts plausible rand prices only', () => {
    assert.equal(validPrice(80.994), 80.99);
    for (const bad of [0, -5, NaN, Infinity, 1e6, '12', null, undefined]) assert.equal(validPrice(bad), null);
  });

  it('num reads the first number from text', () => {
    assert.equal(num('R 1,299.50'), 1299.5);
    assert.equal(num('free'), null);
  });

  it('clean / orNull collapse whitespace and never return empty strings', () => {
    assert.equal(clean('  a \n b  '), 'a b');
    assert.equal(orNull('   '), null);
    assert.equal(orNull(null), null);
  });
});
