'use strict';
/**
 * Spreadsheet columns that are inferred from text: Type, Gender, Ingredient concept.
 * Each returns null when the text gives no evidence, which the export shows as "Not found".
 */

/** First matching rule wins, so more specific products are listed first. */
const TYPE_RULES = [
  [/micellar/i, 'Micellar water'],
  [/\btoner\b/i, 'Toner'],
  [/\bserum\b/i, 'Serum'],
  [/\bsun\s?(?:screen|block|lotion|cream|milk)|\bsun protection|\bspf\s?\d/i, 'Sunscreen'],
  [/\beye\b.*\b(?:cream|gel)\b/i, 'Eye care'],
  [/\b(?:face|facial)\s?mask|\bmask\b/i, 'Face mask'],
  [/\blip\b/i, 'Lip care'],
  [/\b(?:wash|cleanser|cleansing|foam)\b/i, 'Face wash'],
  [/\bscrub|exfoliat/i, 'Face scrub'],
  [/\b(?:moisturi[sz]er|lotion|cream)\b/i, 'Moisturiser'],
  [/\bdeodorant|anti-?perspirant|roll[- ]on\b/i, 'Deodorant'],
  [/\bshampoo\b/i, 'Shampoo'],
  [/\bconditioner\b/i, 'Conditioner'],
  [/\bsoap\b|body wash|shower/i, 'Body wash'],
  [/\btoothpaste\b/i, 'Toothpaste'],
  [/\bperfume|eau de|cologne\b/i, 'Fragrance'],
];

/** @param {string} name Product name. */
function guessType(name) {
  const rule = TYPE_RULES.find(([re]) => re.test(name));
  return rule ? rule[1] : null;
}

/**
 * Gender is reported only when the retailer says so ("for men", "unisex"...).
 * Silence means null, never a default.
 * @returns {'Male'|'Female'|'Unisex'|null}
 */
function findGender(name, desc) {
  const t = `${name} ${desc}`.toLowerCase();
  if (/\bunisex\b|\bfor (?:men and women|women and men|all genders)\b/.test(t)) return 'Unisex';
  // The retailer's own product name saying "Men" / "Women" (e.g. "Nivea Men Face Wash") is evidence too.
  const nameMen = /\bmen\b/i.test(name) && !/\bwomen\b/i.test(name);
  const nameWomen = /\b(?:women|ladies)\b/i.test(name);
  const men =
    (nameMen || /\b(for men|for him|men'?s|pour homme|gentlemen?)\b|\bmale\b(?!\s*pattern)/.test(t)) &&
    !/\bfemale\b/.test(t);
  const women = nameWomen || /\b(for women|for her|women'?s|ladies|female|pour femme)\b/.test(t);
  if (men && !women) return 'Male';
  if (women && !men) return 'Female';
  return null;
}

/** Actives worth surfacing in the "Ingredient concept" column. Extend freely. */
const KNOWN_INGREDIENTS = [
  'witch hazel',
  'ceramides',
  'niacinamide',
  'hyaluronic acid',
  'salicylic acid',
  'glycolic acid',
  'lactic acid',
  'azelaic acid',
  'benzoyl peroxide',
  'retinol',
  'vitamin c',
  'vitamin e',
  'vitamin b5',
  'panthenol',
  'aloe vera',
  'tea tree',
  'jojoba oil',
  'shea butter',
  'argan oil',
  'rooibos',
  'baobab',
  'zinc',
  'glycerin',
  'collagen',
  'peptides',
  'squalane',
  'centella',
  'cica',
  'charcoal',
  'sulphur',
  'thymol',
  'coconut oil',
  'green tea',
  'rose water',
  'oat',
  'cocoa butter',
  'marula',
  'kojic acid',
  'licorice',
  'caffeine',
  'bakuchiol',
  'tranexamic acid',
  'mandelic acid',
];

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Up to three known actives. Marketing copy is preferred over the raw ingredient list,
 * because a long INCI list mentions many things the product is not "about".
 * @param {string} mainText         Description without the ingredients list.
 * @param {string} [ingredientsText]
 */
function ingredientConcept(mainText, ingredientsText) {
  const find = (txt) => KNOWN_INGREDIENTS.filter((i) => new RegExp(`\\b${i}\\b`, 'i').test(txt));
  let hits = find(mainText);
  if (!hits.length) hits = find(ingredientsText || '').slice(0, 3);
  return hits.length ? hits.slice(0, 3).map(titleCase).join(', ') : null;
}

module.exports = { guessType, findGender, ingredientConcept, TYPE_RULES, KNOWN_INGREDIENTS };
