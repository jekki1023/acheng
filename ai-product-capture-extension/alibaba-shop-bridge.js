(() => {
  if (window.__PRODUCT_AI_CAPTURE_1688_SHOP_BRIDGE__) return;
  window.__PRODUCT_AI_CAPTURE_1688_SHOP_BRIDGE__ = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'product-ai-capture-1688-shop') return;
    window.__PRODUCT_AI_CAPTURE_1688_SHOP__ = event.data.payload;
    window.dispatchEvent(new CustomEvent('product-ai-capture-1688-shop-updated'));
  });

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('alibaba-shop-page-hook.js');
  script.async = false;
  (document.documentElement || document.head).appendChild(script);
  script.onload = () => script.remove();
})();
