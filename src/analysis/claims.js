'use strict';
/**
 * Product "promises" (e.g. "48 hours", "SPF 50", "Non-greasy").
 *
 * Principle: only report what the retailer's own text says. If nothing matches we return an
 * empty list and the UI shows "No promise found". We never fill gaps with a guess.
 */
const { clean } = require('../util');

const MAX_PATTERN_HITS = 5;
const MAX_CLAIMS = 6;

/** Each pattern finds one family of claim. Order = display priority. */
const CLAIM_PATTERNS = [
  // durations of effect: "48 hours", "24h protection"
  /\b\d{1,3}\s?[- ]?(?:hours?|hrs?|h)\b(?:\s+(?:of\s+)?(?:protection|freshness|fragrance|wear|odou?r|control|moisture|hydration|coverage|action))?/gi,
  // results timelines: "in 7 days", "12 weeks of results"
  /\b(?:in\s+)?\d{1,2}\s?[- ]?(?:days?|weeks?)\b|\b\d{1,2}\s?[- ]?(?:days?|weeks?|months?)\s+(?:of\s+)?(?:protection|results?|supply|use)\b/gi,
  // sun protection
  /\bSPF\s?\d{1,3}\+?/gi,
  // named benefits and "free from" claims
  /\b(?:long[- ]lasting|all[- ]day|non[- ]greasy|non[- ]sticky|fast[- ]absorbing|quick[- ]drying|anti[- ](?:perspirant|bacterial|dandruff|ageing|aging)|alcohol[- ]free|aluminium[- ]free|aluminum[- ]free|paraben[- ]free|fragrance[- ]free|sulph?ate[- ]free|cruelty[- ]free|vegan|hypoallergenic|dermatologically (?:tested|approved)|clinically (?:proven|tested)|gentle|sensitive skin|waterproof|water[- ]resistant|moisturi[sz]ing|hydrating|nourishing|soothing|invisible|dust[- ]free|odou?r protection|sweat protection|no (?:white )?marks|stain[- ]free|cooling|refreshing)\b/gi,
  // percentages: "100% natural"
  /\b(?:up to\s+)?\d{1,3}\s?%\s+(?:[a-z-]+\s+){0,2}(?:natural|pure|organic|cotton|more|less|reduction)\b/gi,
];

const SKIN_TYPE =
  /\b(?:normal|dry|oily|combination|sensitive|acne[- ]prone|blemish[- ]prone|mature|all)(?:\s*(?:,|to|and|&|\/|or)\s*(?:normal|dry|oily|combination|sensitive))*\s+skin(?:\s+types)?\b/i;

const BENEFIT_VERBS =
  /\b(?:cleanses?|mattifies|exfoliates?|clears? (?:spots|pimples|blemishes)|reduces? (?:shine|oiliness|pimples|redness|wrinkles|blemishes)|controls? (?:oil|shine|sebum)|unclogs? pores|brightens?|firms?|non[- ]comedogenic)\b/gi;

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tidy one raw match into display form ("48hr" -> "48 hours", "spf50+" -> "SPF 50+"). */
function normalise(raw) {
  let c = clean(raw)
    .replace(/^(\d+)\s?-?(?:hours?|hrs?|h)\b/i, (_, n) => `${n} ${Number(n) === 1 ? 'hour' : 'hours'}`)
    .replace(/^(\d+)\s?-?(days?|weeks?|months?)\b/i, '$1 $2');
  if (/^spf/i.test(c)) c = `SPF ${c.replace(/\D/g, '')}${c.includes('+') ? '+' : ''}`;
  return c;
}

/**
 * Claims matched by the pattern table.
 * @returns {string[]}
 */
function extractPromise(name, desc) {
  const text = `${name}. ${desc}`.replace(/\s+/g, ' ');
  const seen = new Set();
  const out = [];
  for (const re of CLAIM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const c = normalise(m[0]);
      const key = c.toLowerCase().replace(/[- +]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(capitalise(c));
      if (out.length >= MAX_PATTERN_HITS) break;
    }
  }
  return out;
}

/** Crude stem so "Cleanse" and "Cleanses" (or "Moisturizing"/"Moisturising") count as one claim. */
const stem = (x) =>
  x
    .toLowerCase()
    .replace(/z/g, 's')
    .replace(/(ing|es|s|e)$/, '');

/**
 * The full "Claim" list: skin type first, then benefits, then measurable promises.
 * @param {string} name  Product name.
 * @param {string} desc  Retailer description text.
 * @returns {string[]}
 */
function claimList(name, desc) {
  const both = `${name}. ${desc}`;
  const lead = [];

  const skin = both.match(SKIN_TYPE);
  if (skin) lead.push(capitalise(skin[0]));

  const seenBenefit = new Set();
  for (const b of both.match(BENEFIT_VERBS) || []) {
    const k = b.toLowerCase();
    if (!seenBenefit.has(k) && seenBenefit.size < 3) {
      seenBenefit.add(k);
      lead.push(capitalise(b));
    }
  }

  return [...lead, ...extractPromise(name, desc)]
    .filter((v, i, all) => all.findIndex((x) => stem(x) === stem(v)) === i)
    .slice(0, MAX_CLAIMS);
}

module.exports = { extractPromise, claimList };
