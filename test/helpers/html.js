'use strict';
/**
 * Tiny HTML generators that mimic the shape of each retailer's real pages, just enough for our
 * parsers. If a retailer redesigns their site and the parsers break, the fix is: update the
 * parser, then update these generators to match the new markup so the tests keep guarding it.
 */

/** @param {{name: string, url: string, price?: number, was?: number}[]} tiles */
function dischemSearch({ tiles, total, empty = false }) {
  const items = tiles
    .map(
      (t) => `<li class="item product product-item">
        <a class="product photo product-item-photo" href="${t.url}"><img class="product-image-photo" src="https://img.test/${encodeURIComponent(t.name)}.jpg"></a>
        <a class="product-item-link" href="${t.url}"> ${t.name} </a>
        ${t.was ? `<div class="price-wrapper" data-price-type="oldPrice" data-price-amount="${t.was}"><span class="price">R ${t.was}</span></div>` : ''}
        ${t.price ? `<div class="price-wrapper" data-price-type="finalPrice" data-price-amount="${t.price}"><span class="price">R ${t.price}</span></div>` : ''}
      </li>`,
    )
    .join('');
  return `<html><body>
    ${total != null ? `<p class="toolbar-amount">Showing 1 - ${tiles.length} of ${total} results</p>` : ''}
    ${empty ? '<div class="message notice">Your search returned no results.</div>' : ''}
    <ol class="products list items product-items">${items}</ol></body></html>`;
}

function dischemProduct({
  brand = 'Mitchum',
  description = '',
  availability = 'InStock',
  price = 80.99,
  sku = '464110',
  size = '100ml',
} = {}) {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'x',
    brand: { '@type': 'Brand', name: brand },
    description: '',
    offers: [{ '@type': 'Offer', price, availability: `https://schema.org/${availability}` }],
  })}</script></head><body>
    <div id="description">${description}</div>
    <table id="product-attribute-specs-table"><tr><th>SKU</th><td>${sku}</td></tr><tr><th>Pack Size</th><td>${size}</td></tr></table>
  </body></html>`;
}

/** @param {{name: string, brand?: string, path: string, prices?: string}[]} tiles */
function clicksSearch({ tiles, lastPage = null, empty = false }) {
  const blocks = tiles
    .map(
      (
        t,
      ) => `<div class="productBlock"><div class="clickfunct_plp"><a href="${t.path}"><img src="/medias/${encodeURIComponent(t.name)}.jpg"></a></div>
        <div class="detailContent"><a href="${t.path}"><h5>${t.brand || ''}</h5><div class="product-name"><p>${t.name}</p></div></a>
        <div class="price-wrap"><div class="price">${t.prices || 'R 50.00'}</div></div></div></div>`,
    )
    .join('');
  const pager =
    lastPage == null
      ? ''
      : `<ul class="pagination"><li><a href="/search?page=1">2</a></li><li><a href="/search?q=x&page=${lastPage}&count=12">Last</a></li></ul>`;
  return `<html><body>${empty ? '<div id="searchProducts"></div>' : ''}<div id="searchProducts">${blocks}</div>${pager}</body></html>`;
}

function clicksProduct({ description = 'A fine product.', ingredients = 'AQUA, ZINC', stock = 'cart' } = {}) {
  const buy =
    stock === 'cart'
      ? '<button class="add_to_cart_button">Add to cart</button>'
      : stock === 'out'
        ? '<div class="addtocart_wrap">Out of stock</div>'
        : '';
  return `<html><body><div class="product-detail">${buy}</div><div class="price">R 74.99</div>
    <div id="information">Description: ${description} Ingredients Ingredients: ${ingredients} See more See less</div></body></html>`;
}

/** A `Response`-like object for fake fetch implementations. */
const reply = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });

module.exports = { dischemSearch, dischemProduct, clicksSearch, clicksProduct, reply };
