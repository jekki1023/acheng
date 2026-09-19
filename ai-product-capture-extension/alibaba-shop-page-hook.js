(() => {
  if (window.__PRODUCT_AI_CAPTURE_1688_SHOP_HOOK__) return;
  window.__PRODUCT_AI_CAPTURE_1688_SHOP_HOOK__ = true;

  const captured = new Map();
  let suppressScanUntil = 0;
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const absolute = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    try { return new URL(text, location.href).href; } catch (error) { return text; }
  };

  function offerFromUrl(value) {
    const match = String(value || '').match(/\/offer\/(\d+)\.html(?:[?#]|$)/i);
    return match ? match[1] : '';
  }

  function add(item, source) {
    if (!item || typeof item !== 'object') return;
    const url = absolute(item.url || item.href || item.itemUrl || item.detailUrl || '');
    const offerId = String(item.offerId || item.offer_id || item.offerid || offerFromUrl(url) || item.id || '').match(/^\d{8,15}$/);
    if (!offerId) return;
    const id = offerId[0];
    const old = captured.get(id) || {};
    captured.set(id, {
      offerId: id,
      title: old.title || normalize(item.title || item.subject || item.name || item.itemTitle || ''),
      price: old.price || normalize(item.price || item.priceText || item.salePrice || item.discountPrice || ''),
      image: old.image || absolute(item.image || item.pic || item.picUrl || item.mainPic || ''),
      url: old.url || url || `https://detail.1688.com/offer/${id}.html`,
      listedAt: old.listedAt || normalize(item.listedAt || item.publishTime || item.publish_time || item.createTime || item.create_time || item.gmtCreate || item.gmtModified || item.date || ''),
      source: source || old.source || ''
    });
  }

  function scanDom() {
    if (Date.now() < suppressScanUntil) return;
    document.querySelectorAll('a[href*="/offer/"]').forEach((anchor) => {
      const url = absolute(anchor.href || anchor.getAttribute('href'));
      const image = anchor.querySelector('img');
      add({
        url,
        title: anchor.getAttribute('title') || anchor.getAttribute('aria-label') || anchor.textContent,
        image: image && (image.currentSrc || image.src || image.getAttribute('data-src')),
        listedAt: anchor.getAttribute('data-publish-time') || anchor.getAttribute('data-publishtime') || ''
      }, 'dom');
    });
    document.querySelectorAll('[data-offer-id], [data-offerid], [data-item-id]').forEach((node) => {
      const id = node.getAttribute('data-offer-id') || node.getAttribute('data-offerid') || node.getAttribute('data-item-id');
      const anchor = node.closest('a');
      const image = node.querySelector('img');
      add({ offerId: id, url: anchor && anchor.href, title: node.getAttribute('title') || node.textContent,
        image: image && (image.currentSrc || image.src || image.getAttribute('data-src')),
        listedAt: node.getAttribute('data-publish-time') || node.getAttribute('data-publishtime') || '' }, 'dom');
    });
    // 新品组件有时把商品链接放在 data-* 属性或转义后的组件 JSON 中。
    const html = document.documentElement && document.documentElement.outerHTML;
    if (html) scanText(html, 'dom-html');
    document.querySelectorAll('[data-url], [data-href], [data-item-url], [data-detail-url]').forEach((node) => {
      const value = node.getAttribute('data-url') || node.getAttribute('data-href')
        || node.getAttribute('data-item-url') || node.getAttribute('data-detail-url') || '';
      const image = node.querySelector('img');
      add({
        url: value.replace(/\\\//g, '/'),
        title: node.getAttribute('title') || node.textContent,
        image: image && (image.currentSrc || image.src || image.getAttribute('data-src'))
      }, 'dom-data');
    });
  }

  function scanText(text, source) {
    const body = String(text || '');
    const urlRe = /(?:https?:)?\/\/[^"'<>\s]+\/offer\/(\d{8,15})\.html[^"'<>\s]*/gi;
    let match;
    while ((match = urlRe.exec(body))) add({ offerId: match[1], url: match[0] }, source);
    const bareUrlRe = /(?:detail\.)?1688\.com\/offer\/(\d{8,15})\.html[^"'<>\s]*/gi;
    while ((match = bareUrlRe.exec(body))) add({ offerId: match[1], url: `https://${match[0]}` }, source);
    const escapedUrlRe = /(?:https?:)?(?:\\\/){2}[^"'<>\s]+(?:\\\/)offer(?:\\\/)(\d{8,15})\.html[^"'<>\s]*/gi;
    while ((match = escapedUrlRe.exec(body))) add({ offerId: match[1], url: match[0].replace(/\\\//g, '/') }, source);
    const idRe = /["']?(?:offerId|offer_id|offerid|offer_id_str|offerIdStr|itemId)["']?\s*[:=]\s*["']?(\d{8,15})/g;
    while ((match = idRe.exec(body))) {
      const context = body.slice(Math.max(0, match.index - 600), match.index + 1200);
      const title = (context.match(/["'](?:title|subject|name)["']\s*:\s*["']([^"']{2,180})/) || [])[1] || '';
      const listedAt = (context.match(/["'](?:publishTime|publish_time|createTime|create_time|gmtCreate|gmtModified|date)["']\s*:\s*["']?([^,"'} ]+)/) || [])[1] || '';
      const image = (context.match(/["'](?:image|pic|picUrl|mainPic)["']\s*:\s*["']([^"']+)/) || [])[1] || '';
      add({ offerId: match[1], title, listedAt, image }, source);
    }
  }

  function publish(source, shouldScan = true) {
    if (shouldScan) scanDom();
    // Keep the first-seen/list order.  Sorting by offer_id destroys the shop's
    // “新品” order and makes it impossible to review the July/August/September
    // accumulation in the same order as the page.
    const items = Array.from(captured.values());
    window.__PRODUCT_AI_CAPTURE_1688_SHOP__ = {
      __captureSource: source || 'dom',
      __capturedAt: new Date().toISOString(),
      shopUrl: location.href,
      items
    };
    window.postMessage({ source: 'product-ai-capture-1688-shop', payload: window.__PRODUCT_AI_CAPTURE_1688_SHOP__ }, '*');
  }

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function () {
      const args = arguments;
      return nativeFetch.apply(this, args).then((response) => {
        try { response.clone().text().then((text) => { scanText(text, `fetch:${response.url || args[0]}`); publish('fetch'); }).catch(() => {}); } catch (error) {}
        return response;
      });
    };
  }

  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR && NativeXHR.prototype) {
    const open = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function (method, url) {
      this.__productAi1688ShopUrl = String(url || '');
      if (!this.__productAi1688ShopBound) {
        this.__productAi1688ShopBound = true;
        this.addEventListener('load', () => { scanText(this.responseText, `xhr:${this.__productAi1688ShopUrl}`); publish('xhr'); });
      }
      return open.apply(this, arguments);
    };
  }

  const observer = new MutationObserver(() => publish('dom-mutation'));
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.source === 'product-ai-capture-1688-shop-clear') {
      captured.clear();
      suppressScanUntil = Date.now() + 1200;
      publish('manual-clear', false);
    }
  });
  scanDom();
  publish('dom');
  setInterval(() => publish('dom-scan'), 1200);
})();
