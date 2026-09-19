(() => {
  const ROOT_ID = 'coupang-capture-root';
  const TAOBAO_MODE_STORAGE_KEY = 'product-ai-capture:taobao-mode';
  const PANEL_COLLAPSED_STORAGE_KEY = 'product-ai-capture:panel-collapsed';
  const LISTING_CONSTRAINT_PROFILE_STORAGE_PREFIX = 'product-ai-capture:listing-constraint-profile:';
  const ZHAOJIAFANG_FILTER_STORAGE_PREFIX = 'product-ai-capture:zhaojiafang-filter:';
  const ALIBABA_1688_FILTER_STORAGE_PREFIX = 'product-ai-capture:1688-filter:';
  const COUPANG_FILTER_STORAGE_PREFIX = 'product-ai-capture:coupang-filter:';
  const TAOBAO_FILTER_STORAGE_PREFIX = 'product-ai-capture:taobao-filter:';
  const NAVER_DETAIL_HTML_STORAGE_PREFIX = 'product-ai-capture:naver-detail-html:';
  const SIDE_CHAT_DETAIL_IMAGE_STORAGE_PREFIX = 'product-ai-capture:side-chat-detail-images:';
  const EXCLUDED_DETAIL_IMAGE_STORAGE_PREFIX = 'product-ai-capture:excluded-detail-images:';
  const SIZE_CHART_DETAIL_IMAGE_STORAGE_PREFIX = 'product-ai-capture:size-chart-detail-images:';
  const LISTING_CONSTRAINT_PROFILES = {
    digital_accessory: {
      label: '数码配件',
      productType: '数码配件',
      titleRule: '角色/主题 + 设备机种 + 호환 + 케이스',
      attributeSplit: '색상 只放颜色/款式；기종/적용모델 只放机种；不要混填',
      swatchRule: '只按颜色/款式去重，不按机种重复',
      pricingRule: '基础款售价由人工/配置指定；确定基础款后，其他款按源成本差额递增',
      imageRule: 'alicdn 公网图直接用；本地图片才传 Cafe24'
    },
    coupang_color_swatch: {
      label: 'Coupang 颜色色卡',
      productType: 'Coupang 商品',
      titleRule: '保留商品主体、关键用途和购买属性，避免把颜色/尺码重复塞入标题',
      attributeSplit: 'color 只放颜色/款式；size 只放尺码；不要把颜色和尺码混成一个字段',
      swatchRule: '按颜色/款式去重生成色卡，不按尺码重复；色卡使用对应颜色的 SKU 图',
      pricingRule: '保留 Coupang 页面当前显示的 SKU 价格，不猜测或覆盖价格',
      imageRule: '主图、SKU 图、详情图按各自集合使用；不要用详情场景图替代颜色 SKU 图'
    }
  };
  const AI_CURRENT_PRODUCT_PROMPT = '商品编辑/上架时只处理当前 JSON 中的一个商品；不要读取或沿用此前聊天中的其他商品、SKU、价格、图片、类目、尺码表或草稿信息。只使用本次商品数据和当前必要上架规则，缺失字段不要猜测。';
  const COUPANG_TRUSTED_SOURCE_SCOPE_PROMPT = 'Coupang 可信源中的 product_id、item_id、vendor_item_id、vendor_id 和 SKU 编码仅是源商品参考编号，不是当前店铺的商品编号。不要用这些编号查询、修改或覆盖当前店铺已有商品；本次应按新商品处理，将可信源中的商品信息、SKU、价格、库存、图片及用户明确要求用于创建到当前指定店铺。';
  const OPTION_PATTERN = /([A-Za-z가-힣]+-[A-Z])\s*(\d[\d,]*원)([^]*?)(?=(?:[A-Za-z가-힣]+-[A-Z]\s*\d[\d,]*원)|$)/g;
  const SITE = (() => {
    const host = location.hostname;
    if (host.includes('shop.coupang.com')) {
      return 'coupang-shop';
    }
    if (host.includes('1688.com') && /\/page\/[^/]*offerlist\.htm/i.test(location.pathname)) {
      return '1688-shop';
    }
    if (host.includes('1688.com')) {
      return '1688';
    }
    if (host.includes('world.tmall.com') || host.includes('world.taobao.com') || (host.includes('tmall.com') && location.pathname.includes('/category')) || (/^shop\d+\.taobao\.com$/i.test(host) && location.pathname.includes('/category'))) {
      return 'tmall-shop';
    }
    if (host.includes('tmall.com') || host.includes('taobao.com')) {
      return 'taobao';
    }
    if (host.includes('onch3.co.kr')) {
      return 'onch3';
    }
    if (host.includes('zhaojiafang.com')) {
      return 'zhaojiafang';
    }
    if (host.includes('pinduoduo.com')) {
      return 'pinduoduo';
    }
    if (host.includes('temu.com')) {
      return 'temu';
    }
    if (host.includes('smartstore.naver.com')) {
      return 'naver-smartstore';
    }
    if (host.includes('paintshopmro.com')) {
      return 'cafe24';
    }
    if (host.includes('martubegift.com') || window.Shopify || document.querySelector('form[action*="/cart/add"]')) {
      return 'shopify';
    }
    return 'coupang';
  })();

  if (window.__COUPANG_CAPTURE_LOADED__) {
    return;
  }
  window.__COUPANG_CAPTURE_LOADED__ = true;

  function getListingConstraintStorageKey() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || params.get('goods_id') || params.get('num') || location.pathname;
    return `${LISTING_CONSTRAINT_PROFILE_STORAGE_PREFIX}${SITE}:${id}`;
  }

  function loadListingConstraintProfile() {
    try {
      const value = localStorage.getItem(getListingConstraintStorageKey()) || 'auto';
      return value === 'auto' || value === 'none' || LISTING_CONSTRAINT_PROFILES[value] ? value : 'auto';
    } catch (error) {
      return 'auto';
    }
  }

  function saveListingConstraintProfile(profile) {
    try {
      const value = profile === 'none' || LISTING_CONSTRAINT_PROFILES[profile] ? profile : 'auto';
      localStorage.setItem(getListingConstraintStorageKey(), value);
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }


  function getZhaojiafangFilterStorageKey() {
    const match = location.pathname.match(/\/goods\/(\d+)/);
    const id = match ? match[1] : location.pathname;
    return `${ZHAOJIAFANG_FILTER_STORAGE_PREFIX}${id}`;
  }

  function loadZhaojiafangFilter() {
    try {
      const value = localStorage.getItem(getZhaojiafangFilterStorageKey());
      const parsed = value ? JSON.parse(value) : {};
      return {
        excludedColors: new Set(Array.isArray(parsed.excludedColors) ? parsed.excludedColors : []),
        excludedSizes: new Set(Array.isArray(parsed.excludedSizes) ? parsed.excludedSizes : [])
      };
    } catch (error) {
      return { excludedColors: new Set(), excludedSizes: new Set() };
    }
  }

  function saveZhaojiafangFilter(filter) {
    try {
      localStorage.setItem(getZhaojiafangFilterStorageKey(), JSON.stringify({
        excludedColors: Array.from(filter && filter.excludedColors ? filter.excludedColors : []),
        excludedSizes: Array.from(filter && filter.excludedSizes ? filter.excludedSizes : [])
      }));
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function get1688FilterStorageKey() {
    const match = location.pathname.match(/\/offer\/(\d+)\.html/i);
    const id = match ? match[1] : location.pathname;
    return `${ALIBABA_1688_FILTER_STORAGE_PREFIX}${id}`;
  }

  function load1688Filter() {
    try {
      const value = localStorage.getItem(get1688FilterStorageKey());
      const parsed = value ? JSON.parse(value) : {};
      return {
        excludedColors: new Set(Array.isArray(parsed.excludedColors) ? parsed.excludedColors : []),
        excludedSizes: new Set(Array.isArray(parsed.excludedSizes) ? parsed.excludedSizes : [])
      };
    } catch (error) {
      return { excludedColors: new Set(), excludedSizes: new Set() };
    }
  }

  function save1688Filter(filter) {
    try {
      localStorage.setItem(get1688FilterStorageKey(), JSON.stringify({
        excludedColors: Array.from(filter && filter.excludedColors ? filter.excludedColors : []),
        excludedSizes: Array.from(filter && filter.excludedSizes ? filter.excludedSizes : [])
      }));
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function getCoupangFilterStorageKey() {
    return `${COUPANG_FILTER_STORAGE_PREFIX}${getCurrentProductStorageId()}`;
  }

  function loadCoupangFilter() {
    try {
      const value = localStorage.getItem(getCoupangFilterStorageKey());
      const parsed = value ? JSON.parse(value) : {};
      return {
        excludedColors: new Set(Array.isArray(parsed.excludedColors) ? parsed.excludedColors : []),
        excludedSizes: new Set(Array.isArray(parsed.excludedSizes) ? parsed.excludedSizes : [])
      };
    } catch (error) {
      return { excludedColors: new Set(), excludedSizes: new Set() };
    }
  }

  function saveCoupangFilter(filter) {
    try {
      localStorage.setItem(getCoupangFilterStorageKey(), JSON.stringify({
        excludedColors: Array.from(filter && filter.excludedColors ? filter.excludedColors : []),
        excludedSizes: Array.from(filter && filter.excludedSizes ? filter.excludedSizes : [])
      }));
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function getTaobaoFilterStorageKey() {
    return `${TAOBAO_FILTER_STORAGE_PREFIX}${getCurrentProductStorageId()}`;
  }

  function loadTaobaoFilter() {
    try {
      const value = localStorage.getItem(getTaobaoFilterStorageKey());
      const parsed = value ? JSON.parse(value) : {};
      return {
        excludedColors: new Set(Array.isArray(parsed.excludedColors) ? parsed.excludedColors : []),
        excludedSizes: new Set(Array.isArray(parsed.excludedSizes) ? parsed.excludedSizes : [])
      };
    } catch (error) {
      return { excludedColors: new Set(), excludedSizes: new Set() };
    }
  }

  function saveTaobaoFilter(filter) {
    try {
      localStorage.setItem(getTaobaoFilterStorageKey(), JSON.stringify({
        excludedColors: Array.from(filter && filter.excludedColors ? filter.excludedColors : []),
        excludedSizes: Array.from(filter && filter.excludedSizes ? filter.excludedSizes : [])
      }));
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function getCurrentProductStorageId() {
    const params = new URLSearchParams(location.search);
    const path = location.pathname || '';
    const offerMatch = path.match(/\/offer\/(\d+)\.html/i);
    const zjfMatch = path.match(/\/goods\/(\d+)/i);
    const coupangMatch = path.match(/\/vp\/products\/(\d+)/i);
    return params.get('id')
      || params.get('goods_id')
      || params.get('num')
      || params.get('product_no')
      || (offerMatch && offerMatch[1])
      || (zjfMatch && zjfMatch[1])
      || (coupangMatch && coupangMatch[1])
      || path;
  }

  function getSideChatDetailImageStorageKey() {
    return `${SIDE_CHAT_DETAIL_IMAGE_STORAGE_PREFIX}${SITE}:${getCurrentProductStorageId()}`;
  }

  function getExcludedDetailImageStorageKey() {
    return `${EXCLUDED_DETAIL_IMAGE_STORAGE_PREFIX}${SITE}:${getCurrentProductStorageId()}`;
  }

  function getSizeChartDetailImageStorageKey() {
    return `${SIZE_CHART_DETAIL_IMAGE_STORAGE_PREFIX}${SITE}:${getCurrentProductStorageId()}`;
  }

  function getNaverDetailHtmlStorageKey() {
    return `${NAVER_DETAIL_HTML_STORAGE_PREFIX}${getCurrentProductStorageId()}`;
  }

  function loadNaverDetailHtmlEnabled() {
    try {
      return localStorage.getItem(getNaverDetailHtmlStorageKey()) === 'true';
    } catch (error) {
      return false;
    }
  }

  function saveNaverDetailHtmlEnabled(enabled) {
    try {
      localStorage.setItem(getNaverDetailHtmlStorageKey(), enabled ? 'true' : 'false');
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function loadUrlSet(storageKey) {
    try {
      const value = localStorage.getItem(storageKey);
      const parsed = value ? JSON.parse(value) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch (error) {
      return new Set();
    }
  }

  function saveUrlSet(storageKey, values) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(values || []).filter(Boolean)));
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function loadSideChatDetailImages() {
    return loadUrlSet(getSideChatDetailImageStorageKey());
  }

  function saveSideChatDetailImages(images) {
    saveUrlSet(getSideChatDetailImageStorageKey(), images);
  }

  function loadExcludedDetailImages() {
    return loadUrlSet(getExcludedDetailImageStorageKey());
  }

  function saveExcludedDetailImages(images) {
    saveUrlSet(getExcludedDetailImageStorageKey(), images);
  }

  function loadSizeChartDetailImages() {
    return loadUrlSet(getSizeChartDetailImageStorageKey());
  }

  function saveSizeChartDetailImages(images) {
    saveUrlSet(getSizeChartDetailImageStorageKey(), images);
  }

  const state = {
    data: null,
    collapsed: (() => {
      try {
        return localStorage.getItem(PANEL_COLLAPSED_STORAGE_KEY) === 'true';
      } catch (error) {
        return false;
      }
    })(),
    status: '',
    zhaojiafangFilter: loadZhaojiafangFilter(),
    alibaba1688Filter: load1688Filter(),
    coupangFilter: loadCoupangFilter(),
    taobaoFilter: loadTaobaoFilter(),
    sideChatDetailImages: loadSideChatDetailImages(),
    excludedDetailImages: loadExcludedDetailImages(),
    sizeChartDetailImages: loadSizeChartDetailImages(),
    naverDetailHtmlEnabled: loadNaverDetailHtmlEnabled(),
    listingConstraintProfile: loadListingConstraintProfile(),
    taobaoCollectedSkus: new Map(),
    taobaoLastImageOption: null,
    coupangShopCrawledProducts: [],
    coupangShopCrawlErrors: [],
    coupangShopCrawlRunning: false,
    taobaoCaptureMode: (() => {
      // 默认优先使用 SKU 矩阵；用户仍可切换到选择采集模式。
      try {
        const savedMode = localStorage.getItem(TAOBAO_MODE_STORAGE_KEY);
        return savedMode === 'selected' ? 'selected' : 'matrix';
      } catch (error) {
        return 'matrix';
      }
    })()
  };

  const root = document.createElement('div');
  root.id = ROOT_ID;
  document.documentElement.appendChild(root);

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeFileName(name) {
    return (name || 'product-capture')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'product-capture';
  }

  function normalizeUrl(url) {
    if (!url) {
      return '';
    }
    const value = String(url).trim();
    if (!value) {
      return '';
    }
    if (value.startsWith('//')) {
      return `https:${value}`;
    }
    return value;
  }

  function toAbsoluteUrl(url) {
    const value = normalizeUrl(url);
    if (!value) {
      return '';
    }
    try {
      return new URL(value, location.origin).href;
    } catch (error) {
      return value;
    }
  }


  function getSourcePlatform() {
    const host = location.hostname;
    if (host.includes('1688.com') && /\/page\/[^/]*offerlist\.htm/i.test(location.pathname)) {
      return '1688-shop';
    }
    if (host.includes('world.tmall.com') || host.includes('world.taobao.com') || (host.includes('tmall.com') && location.pathname.includes('/category'))) {
      return 'tmall-shop';
    }
    if (/^shop\d+\.taobao\.com$/i.test(host) && location.pathname.includes('/category')) {
      return 'taobao-shop';
    }
    if (host.includes('tmall.com')) {
      return 'tmall';
    }
    if (host.includes('taobao.com')) {
      return 'taobao';
    }
    if (host.includes('shop.coupang.com')) {
      return 'coupang-shop';
    }
    if (host.includes('coupang.com')) {
      return 'coupang';
    }
    if (host.includes('onch3.co.kr')) {
      return 'onch3';
    }
    if (host.includes('zhaojiafang.com')) {
      return 'zhaojiafang';
    }
    if (host.includes('pinduoduo.com')) {
      return 'pinduoduo';
    }
    if (host.includes('temu.com')) {
      return 'temu';
    }
    if (host.includes('smartstore.naver.com')) {
      return 'naver-smartstore';
    }
    if (host.includes('paintshopmro.com')) {
      return 'cafe24';
    }
    if (SITE === 'shopify') {
      return 'shopify';
    }
    return SITE;
  }

  function getCanonicalSourceUrl() {
    const platform = getSourcePlatform();
    if (platform === '1688-shop') {
      return location.origin + location.pathname;
    }
    if (platform === 'tmall-shop') {
      return location.origin + location.pathname;
    }

    if (platform === 'tmall' || platform === 'taobao') {
      const id = new URLSearchParams(location.search).get('id');
      const host = platform === 'tmall' ? 'detail.tmall.com' : 'item.taobao.com';
      if (id) {
        return `https://${host}/item.htm?id=${encodeURIComponent(id)}`;
      }
      return `https://${host}${location.pathname}`;
    }

    if (platform === '1688') {
      const match = location.pathname.match(/\/offer\/(\d+)\.html/);
      if (match) {
        return `https://detail.1688.com/offer/${encodeURIComponent(match[1])}.html`;
      }
      return `https://detail.1688.com${location.pathname}`;
    }

    if (platform === 'onch3') {
      const num = new URLSearchParams(location.search).get('num');
      if (num) {
        return `https://www.onch3.co.kr/dbcenter_renewal/detail.php?num=${encodeURIComponent(num)}`;
      }
    }

    if (platform === 'zhaojiafang') {
      const match = location.pathname.match(/\/goods\/(\d+)/);
      if (match) {
        return `https://detail.zhaojiafang.com/goods/${encodeURIComponent(match[1])}`;
      }
    }

    if (platform === 'pinduoduo') {
      const goodsId = new URLSearchParams(location.search).get('goods_id');
      if (goodsId) {
        return `https://mobile.pinduoduo.com/goods.html?goods_id=${encodeURIComponent(goodsId)}`;
      }
      return `https://mobile.pinduoduo.com${location.pathname}`;
    }

    if (platform === 'naver-smartstore') {
      const match = location.pathname.match(/\/([^/]+)\/products\/(\d+)/);
      if (match) {
        return `https://smartstore.naver.com/${encodeURIComponent(match[1])}/products/${encodeURIComponent(match[2])}`;
      }
      return `https://smartstore.naver.com${location.pathname}`;
    }

    if (platform === 'temu') {
      const goodsId = extractTemuGoodsIdFromUrl();
      if (goodsId) {
        return `https://www.temu.com/goods.html?goods_id=${encodeURIComponent(goodsId)}`;
      }
      return `https://www.temu.com${location.pathname}`;
    }

    if (platform === 'coupang-shop') {
      return location.origin + location.pathname;
    }

    if (platform === 'cafe24') {
      const productNo = new URLSearchParams(location.search).get('product_no');
      if (productNo) {
        return `${location.origin}${location.pathname}?product_no=${encodeURIComponent(productNo)}`;
      }
      return location.origin + location.pathname;
    }

    if (platform === 'coupang') {
      const canonical = document.querySelector('link[rel="canonical"]');
      const href = canonical && canonical.getAttribute('href');
      if (href) {
        return normalizeUrl(href);
      }
    }

    return location.origin + location.pathname;
  }

  function cleanTaobaoImageUrl(url) {
    return normalizeUrl(url)
      .replace(/_q\d+\.jpg_\.webp$/i, '')
      .replace(/_\d+x\d+q\d+\.jpg_\.webp$/i, '')
      .replace(/_\d+x\d+q\d+\.webp$/i, '')
      .replace(/_\d+x\d+\.jpg_\.webp$/i, '')
      .replace(/_\.webp$/i, '')
      .replace(/\.jpg_\.webp$/i, '.jpg');
  }


  function extractUrlFromCssImage(value) {
    const text = String(value || '');
    const match = text.match(/url\(["']?([^"')]+)["']?\)/i);
    return match ? match[1] : '';
  }

  function extractImageUrlFromElement(element) {
    if (!element || !(element instanceof Element)) {
      return '';
    }

    const candidates = [];
    const pushImageCandidate = (value) => {
      const cleaned = cleanTaobaoImageUrl(value || '');
      if (cleaned && /alicdn\.com|tbcdn\.cn/i.test(cleaned)) {
        candidates.push(cleaned);
      }
    };

    if (element.matches && element.matches('img')) {
      pushImageCandidate(element.currentSrc || element.src || element.getAttribute('src') || element.getAttribute('data-src'));
    }

    element.querySelectorAll('img').forEach((img) => {
      pushImageCandidate(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src'));
    });

    const elements = [element, ...Array.from(element.querySelectorAll('*')).slice(0, 20)];
    elements.forEach((node) => {
      ['data-src', 'data-img', 'data-image', 'data-bg', 'src'].forEach((attr) => {
        pushImageCandidate(node.getAttribute && node.getAttribute(attr));
      });
      const inlineBg = node.style && (node.style.backgroundImage || node.style.background);
      pushImageCandidate(extractUrlFromCssImage(inlineBg));
      try {
        pushImageCandidate(extractUrlFromCssImage(window.getComputedStyle(node).backgroundImage));
      } catch (error) {
        // Ignore inaccessible computed style edge cases.
      }
    });

    return candidates.find((url) => !/avatar|sns_logo|tps-|userheader|rate/i.test(url)) || '';
  }

  function findTaobaoSkuImageByName(name) {
    const targetName = cleanTaobaoOptionName(name);
    if (!targetName) {
      return '';
    }

    const nodes = Array.from(document.querySelectorAll('body *'));
    for (const node of nodes) {
      const text = cleanTaobaoOptionName(node.innerText || node.textContent || '');
      if (!text || text.length > 260) {
        continue;
      }
      const isLikelySameOption = text === targetName || text.includes(targetName) || targetName.includes(text);
      if (!isLikelySameOption) {
        continue;
      }
      const image = extractImageUrlFromElement(node);
      if (image) {
        return image;
      }
    }
    return '';
  }

  function optionSortKey(name) {
    const [brand = '', suffix = ''] = String(name).split('-');
    return `${brand}|${suffix}`;
  }

  function extractNextData() {
    const script = document.querySelector('script#__NEXT_DATA__');
    const text = script && script.textContent;
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('[Product AI Capture] __NEXT_DATA__ parse failed', error);
      return null;
    }
  }

  function getZhaojiafangGoodsInfo() {
    const nextData = extractNextData();
    return nextData
      && nextData.props
      && nextData.props.pageProps
      && nextData.props.pageProps.goodsInfo
      ? nextData.props.pageProps.goodsInfo
      : null;
  }

  function normalizeCny(value) {
    const text = normalize(value);
    if (!text) {
      return '';
    }
    return text.startsWith('￥') ? text : `￥${text}`;
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).map((value) => normalizeUrl(value)).filter(Boolean)));
  }

  function normalizeImageIdentity(url) {
    return normalizeUrl(url)
      .split('#')[0]
      .split('?')[0]
      .replace(/_\.webp$/i, '')
      .replace(/_sum\.(?:jpg|jpeg|png)$/i, '')
      .replace(/_\d+x\d+\.(?:jpg|jpeg|png)$/i, '')
      .toLowerCase();
  }

  function filterDetailImagesAgainstMain(detailImages, mainImages) {
    const mainKeys = new Set((mainImages || []).map(normalizeImageIdentity).filter(Boolean));
    const seen = new Set();
    return (detailImages || []).map(normalizeUrl).filter((url) => {
      const key = normalizeImageIdentity(url);
      if (!key || mainKeys.has(key) || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function normalizeShopifyImageUrl(url) {
    const value = toAbsoluteUrl(url);
    if (!value) {
      return '';
    }
    try {
      const parsed = new URL(value, location.origin);
      parsed.searchParams.delete('width');
      return parsed.href;
    } catch (error) {
      return value.replace(/([?&])width=\d+(&?)/, (match, prefix, suffix) => suffix ? prefix : '');
    }
  }

  function formatShopifyMoney(value, currency) {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return normalize(value);
    }
    const code = normalize(currency || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '');
    const symbol = code === 'KRW' ? '₩' : code === 'USD' ? '$' : code === 'CNY' ? '￥' : code ? `${code} ` : '';
    const amount = code === 'KRW'
      ? Math.round(number >= 1000000 && number % 100 === 0 ? number / 100 : number)
      : number;
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: code === 'KRW' ? 0 : 2, maximumFractionDigits: code === 'KRW' ? 0 : 2 })}`;
  }

  function parseJsonScript(node) {
    const text = node && node.textContent;
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function getShopifyStructuredProduct() {
    const parsed = Array.from(document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]'))
      .map(parseJsonScript)
      .filter(Boolean);
    const flattened = [];
    const pushJson = (item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach(pushJson);
      } else if (item['@graph'] && Array.isArray(item['@graph'])) {
        item['@graph'].forEach(pushJson);
      } else {
        flattened.push(item);
      }
    };
    parsed.forEach(pushJson);
    return flattened.find((item) => /ProductGroup/i.test(String(item['@type'] || '')) && Array.isArray(item.hasVariant))
      || flattened.find((item) => /Product/i.test(String(item['@type'] || '')) && (item.offers || item.image || item.name))
      || null;
  }

  function getShopifySelectedVariantJson() {
    return Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map(parseJsonScript)
      .find((item) => item && item.id && (item.option1 || item.public_title || item.featured_image) && (item.price || item.compare_at_price)) || null;
  }

  function getShopifyVariantIdFromUrl(value) {
    const text = String(value || '');
    const match = text.match(/[?&]variant=(\d+)/) || text.match(/variant=(\d+)/) || text.match(/variant\/(\d+)/);
    return match ? match[1] : '';
  }

  function extractShopifyTitle(product) {
    return normalize(document.querySelector('h1') && document.querySelector('h1').textContent || product && product.name || document.title.replace(/\s*[–-]\s*.*$/, ''));
  }

  function extractShopifyProductId() {
    if (window.__st && window.__st.rid) {
      return String(window.__st.rid);
    }
    const scriptText = Array.from(document.scripts).map((node) => node.textContent || '').find((text) => text.includes('var __st=') && text.includes('rid')) || '';
    const match = scriptText.match(/"rid"\s*:\s*(\d+)/) || scriptText.match(/rid\s*:\s*(\d+)/);
    return match ? match[1] : '';
  }

  function extractShopifyMeta(product) {
    const selected = getShopifySelectedVariantJson();
    const variants = product && Array.isArray(product.hasVariant) ? product.hasVariant : [];
    const firstOffer = variants[0] && variants[0].offers || product && product.offers || {};
    return {
      productId: extractShopifyProductId(),
      handle: location.pathname.split('/products/')[1] ? location.pathname.split('/products/')[1].split('/')[0] : '',
      vendor: product && product.brand && (product.brand.name || product.brand) || '',
      currency: firstOffer.priceCurrency || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '',
      selectedVariantId: selected && selected.id ? String(selected.id) : new URLSearchParams(location.search).get('variant') || ''
    };
  }

  function extractShopifyOptions(product) {
    const selected = getShopifySelectedVariantJson();
    const selectedById = selected && selected.id ? { [String(selected.id)]: selected } : {};
    const variants = product && Array.isArray(product.hasVariant) ? product.hasVariant : [];
    return variants.map((variant) => {
      const offer = variant.offers || {};
      const variantId = getShopifyVariantIdFromUrl(variant['@id'] || offer.url || '');
      const selectedVariant = selectedById[variantId] || {};
      const fullName = normalize(variant.name || selectedVariant.name || '');
      const baseTitle = normalize(product && product.name || '');
      const name = normalize(selectedVariant.public_title || selectedVariant.title || fullName.replace(baseTitle, '').replace(/^\s*[–-]\s*/, '')) || fullName;
      const availability = String(offer.availability || '');
      return {
        name,
        skuId: variantId,
        sku: variant.sku || selectedVariant.sku || '',
        barcode: variant.gtin || selectedVariant.barcode || '',
        salePrice: formatShopifyMoney(offer.price || selectedVariant.price, offer.priceCurrency || ''),
        originalPrice: selectedVariant.compare_at_price ? formatShopifyMoney(selectedVariant.compare_at_price, offer.priceCurrency || '') : '',
        stockStatus: /InStock/i.test(availability) || selectedVariant.available ? 'in_stock' : availability ? 'out_of_stock' : '',
        stockText: /InStock/i.test(availability) || selectedVariant.available ? '有货' : availability ? '无货' : '',
        image: normalizeShopifyImageUrl(variant.image || selectedVariant.featured_image && selectedVariant.featured_image.src || selectedVariant.featured_media && selectedVariant.featured_media.preview_image && selectedVariant.featured_media.preview_image.src || '')
      };
    }).filter((option) => option.name || option.skuId || option.salePrice);
  }

  function extractShopifyMainImages(product) {
    const urls = [];
    const galleryRoots = [
      document.querySelector('media-gallery'),
      document.querySelector('product-gallery'),
      document.querySelector('[id*="Media-Gallery"]'),
      document.querySelector('.product-media-gallery'),
      document.querySelector('.product-media-list'),
      document.querySelector('[class*="product-media"]')
    ].filter(Boolean);
    galleryRoots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => {
        urls.push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('src'));
      });
    });
    if (product && product.image) {
      if (Array.isArray(product.image)) {
        product.image.forEach((item) => urls.push(typeof item === 'string' ? item : item && item.url));
      } else {
        urls.push(typeof product.image === 'string' ? product.image : product.image.url);
      }
    }
    (product && Array.isArray(product.hasVariant) ? product.hasVariant : []).forEach((variant) => urls.push(variant.image));
    return uniqueList(urls.map(normalizeShopifyImageUrl)).filter((url) => /cdn\.shopify\.com|martubegift\.com\/cdn\/shop/i.test(url) && !/transparent\.png|flags\//i.test(url));
  }

  function extractShopifyDetailImages() {
    const roots = [
      document.querySelector('#Product-Panel-Description'),
      document.querySelector('.product__description'),
      document.querySelector('[id*="Description"] .rte'),
      document.querySelector('[class*="description"] .rte')
    ].filter(Boolean);
    const urls = [];
    roots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => urls.push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('src')));
    });
    return uniqueList(urls.map(normalizeShopifyImageUrl)).filter((url) => /cdn\.shopify\.com|martubegift\.com\/cdn\/shop/i.test(url) && !/transparent\.png|flags\//i.test(url));
  }


  function getTmallShopCapturedPayload() {
    const candidates = [];
    if (window.__PRODUCT_AI_CAPTURE_TMALL_SHOP__) {
      candidates.push(window.__PRODUCT_AI_CAPTURE_TMALL_SHOP__);
    }
    const attr = document.documentElement && document.documentElement.getAttribute('data-product-ai-tmall-shop-summary');
    if (attr) {
      try {
        candidates.push(JSON.parse(attr));
      } catch (error) {
        console.warn('[Product AI Capture] Tmall shop summary parse failed', error);
      }
    }
    return candidates.find((item) => item && Array.isArray(item.items)) || null;
  }

  function get1688ShopCapturedPayload() {
    const payload = window.__PRODUCT_AI_CAPTURE_1688_SHOP__;
    return payload && Array.isArray(payload.items) ? payload : { items: [] };
  }

  function extract1688ShopDomOptions() {
    if (SITE !== '1688-shop') return [];
    const found = new Map();
    const add = (rawUrl, node) => {
      const value = String(rawUrl || '').replace(/\\\//g, '/');
      const match = value.match(/(?:detail\.)?1688\.com\/offer\/(\d{8,15})\.html/i);
      if (!match) return;
      const id = match[1];
      const image = node && node.querySelector ? node.querySelector('img') : null;
      found.set(id, {
        name: normalize(node && (node.getAttribute('title') || node.getAttribute('aria-label') || node.textContent) || ''),
        itemId: id,
        price: normalize(node && (node.getAttribute('data-price') || node.getAttribute('data-sale-price')) || ''),
        image: image ? (image.currentSrc || image.src || image.getAttribute('data-src') || '') : '',
        url: value.indexOf('http') === 0 ? value : `https://${value.replace(/^\/+/, '')}`,
        source: 'content-dom'
      });
    };
    document.querySelectorAll('a[href*="/offer/"], [data-url], [data-href], [data-item-url], [data-detail-url]').forEach((node) => {
      add(node.getAttribute('href') || node.getAttribute('data-url') || node.getAttribute('data-href')
        || node.getAttribute('data-item-url') || node.getAttribute('data-detail-url'), node);
    });
    const html = document.documentElement && document.documentElement.outerHTML || '';
    const re = /(?:https?:)?\/\/(?:detail\.)?1688\.com\/offer\/(\d{8,15})\.html[^"'<>\s]*/gi;
    let match;
    while ((match = re.exec(html))) {
      const id = match[1];
      if (!found.has(id)) {
        found.set(id, {
          name: '', itemId: id, price: '', image: '',
          url: `https://detail.1688.com/offer/${id}.html`, source: 'content-html'
        });
      }
    }
    return Array.from(found.values());
  }

  function extract1688ShopOptions() {
    const payload = get1688ShopCapturedPayload();
    const merged = new Map();
    payload.items.map((item) => ({
      name: item.title || '',
      itemId: String(item.offerId || item.itemId || ''),
      price: item.price || '',
      image: item.image || '',
      url: item.url || '',
      listedAt: item.listedAt || item.publishTime || item.createTime || '',
      source: item.source || ''
    })).filter((item) => item.itemId).forEach((item) => merged.set(item.itemId, item));
    extract1688ShopDomOptions().forEach((item) => {
      const old = merged.get(item.itemId) || {};
      merged.set(item.itemId, { ...item, ...old, itemId: item.itemId });
    });
    return Array.from(merged.values());
  }

  function extract1688ShopMeta() {
    const payload = get1688ShopCapturedPayload();
    return {
      itemCount: extract1688ShopOptions().length,
      captureSource: payload.__captureSource || '',
      capturedAt: payload.__capturedAt || ''
    };
  }

  function build1688ShopMarkdown(data) {
    const meta = data.alibabaShopMeta || {};
    const lines = ['# AI_PRODUCT_CAPTURE_V1', '', '## Source',
      '- platform: 1688-shop', `- url: ${data.source.url}`,
      `- captured_at: ${data.source.capturedAt}`, '', '## Product List',
      `- captured_item_count: ${meta.itemCount || 0}`];
    if (!data.options.length) {
      lines.push('- none_collected');
    } else {
      data.options.forEach((item, index) => {
        lines.push(`${index + 1}. offer_id: ${item.itemId}`);
        if (item.name) lines.push(`   - title: ${item.name}`);
        if (item.price) lines.push(`   - price: ${item.price}`);
        if (item.url) lines.push(`   - url: ${item.url}`);
        if (item.image) lines.push(`   - image: ${item.image}`);
        if (item.listedAt) lines.push(`   - listed_at: ${item.listedAt}`);
      });
    }
    lines.push('', '## Collector Notes',
      '- 仅采集 1688 店铺新品列表中的 offer_id 和商品链接，不打开商品详情。',
      '- 下拉、懒加载或切换列表后，已采集商品会按 offer_id 去重并继续累计。');
    return lines.join('\n');
  }

  function build1688ShopJson(data) {
    return {
      schema: 'AI_PRODUCT_CAPTURE_V1',
      source: data.source,
      shop: data.alibabaShopMeta || {},
      products: data.options.map((item) => ({
        offer_id: item.itemId,
        title: item.name || '',
        price: item.price || '',
        url: item.url || '',
        image: item.image || '',
        listed_at: item.listedAt || ''
      })),
      collector_notes: ['仅采集店铺新品列表，不打开详情页。', '按 offer_id 去重并持续累计。']
    };
  }

  function extractTmallShopTitle() {
    return normalize(document.title || '').replace(/-天猫Tmall\.com.*$/i, '');
  }

  function extractTmallShopOptions(payload) {
    const items = (payload && Array.isArray(payload.items)) ? payload.items : [];
    const seen = new Set();
    return items.filter((item) => {
      if (!item || !item.itemId || seen.has(item.itemId)) return false;
      seen.add(item.itemId);
      return true;
    }).map((item) => ({
      name: '',
      itemId: String(item.itemId || ''),
      price: '',
      image: '',
      url: '',
      source: ''
    }));
  }

  function extractTmallShopMeta(payload) {
    return {
      itemCount: payload && Array.isArray(payload.items) ? payload.items.length : 0,
      captureSource: payload && payload.__captureSource || '',
      capturedAt: payload && payload.__capturedAt || ''
    };
  }

  function normalizeTmallShopImage(url) {
    return normalizeUrl(url || '').replace(/_(?:\d+x\d+)?q\d+\.jpg_?\.webp$/i, '').replace(/_q\d+\.jpg_?\.webp$/i, '');
  }

  function parseTmallShopItemsFromObject(value, source, out, seen, depth) {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 8) {
      return;
    }
    seen.add(value);
    const id = value.itemId || value.item_id || value.auctionId || value.auction_id || value.id || value.itemIdStr;
    const itemId = String(id || '').match(/^\d{8,15}$/) ? String(id) : '';
    if (itemId) {
      const old = out.get(itemId) || {};
      const detailHost = /taobao\.com/i.test(location.hostname) ? 'https://item.taobao.com/item.htm' : 'https://detail.tmall.com/item.htm';
      out.set(itemId, {
        itemId,
        title: old.title || normalize(value.title || value.itemTitle || value.item_title || value.name || value.itemName || value.item_name || ''),
        price: old.price || normalize(value.price || value.salePrice || value.sale_price || value.discountPrice || value.discount_price || value.priceText || ''),
        image: old.image || normalizeTmallShopImage(value.image || value.pic || value.picUrl || value.pic_url || value.imageUrl || value.mainPic || ''),
        sold: old.sold || normalize(value.vagueSold365 || value.sold || value.sales || value.payCount || value.count || ''),
        url: old.url || normalizeUrl(value.itemUrl || value.item_url || value.url || value.detailUrl || `${detailHost}?id=${itemId}`),
        source
      });
    }
    if (Array.isArray(value)) {
      value.forEach((item) => parseTmallShopItemsFromObject(item, source, out, seen, depth + 1));
      return;
    }
    Object.keys(value).slice(0, 300).forEach((key) => {
      let child;
      try { child = value[key]; } catch (error) { return; }
      if (typeof child === 'string' && /itemId|item_id|auctionId|title|itemUrl/i.test(child)) {
        try {
          parseTmallShopItemsFromObject(JSON.parse(child), source, out, seen, depth + 1);
        } catch (error) {}
      } else if (child && typeof child === 'object') {
        parseTmallShopItemsFromObject(child, source, out, seen, depth + 1);
      }
    });
  }

  function parseTmallShopItemsFromText(text, source) {
    const out = new Map();
    try {
      parseTmallShopItemsFromObject(JSON.parse(String(text || '')), source, out, new Set(), 0);
    } catch (error) {}
    if (!out.size) {
      const body = String(text || '');
      const re = /"itemId"\s*:\s*"?(\d{8,15})"?/g;
      let match;
      while ((match = re.exec(body))) {
        const itemId = match[1];
        const ctx = body.slice(Math.max(0, match.index - 1000), match.index + 1800);
        const title = (ctx.match(/"title"\s*:\s*"([^"]{2,180})"/) || [])[1] || '';
        const image = (ctx.match(/"image"\s*:\s*"([^"]+)"/) || ctx.match(/"picUrl"\s*:\s*"([^"]+)"/) || [])[1] || '';
        const itemUrl = (ctx.match(/"itemUrl"\s*:\s*"([^"]+)"/) || [])[1] || '';
        out.set(itemId, {
          itemId,
          title: normalize(title),
          price: '',
          image: normalizeTmallShopImage(image),
          sold: '',
          url: normalizeUrl(itemUrl || `https://item.taobao.com/item.htm?id=${itemId}`),
          source
        });
      }
    }
    return Array.from(out.values()).filter((item) => item.itemId);
  }

  function getTmallShopItemFetchUrls() {
    try {
      return uniqueList(performance.getEntriesByType('resource')
        .map((entry) => entry && entry.name || '')
        .filter((url) => /mtop\.taobao\.shop\.simple\.(?:item\.)?fetch/i.test(url)));
    } catch (error) {
      return [];
    }
  }

  function extractBalancedJsonByKey(text, key) {
    const source = String(text || '');
    const keyIndex = source.indexOf(`"${key}"`);
    if (keyIndex < 0) {
      return null;
    }
    const colon = source.indexOf(':', keyIndex);
    if (colon < 0) {
      return null;
    }
    let index = colon + 1;
    while (/\s/.test(source[index])) {
      index += 1;
    }
    const opener = source[index];
    const closer = opener === '{' ? '}' : opener === '[' ? ']' : '';
    if (!closer) {
      const primitive = source.slice(index).match(/^("(?:\\.|[^"])*"|-?\d+(?:\.\d+)?|true|false|null)/);
      if (!primitive) {
        return null;
      }
      try {
        return JSON.parse(primitive[1]);
      } catch (error) {
        return primitive[1];
      }
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = index; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === opener) {
        depth += 1;
      } else if (ch === closer) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(index, i + 1));
          } catch (error) {
            console.warn(`[Product AI Capture] 1688 ${key} JSON parse failed`, error);
            return null;
          }
        }
      }
    }
    return null;
  }

  function get1688ContextScript() {
    return Array.from(document.scripts)
      .map((node) => node.textContent || '')
      .find((text) => text.includes('window.context=') && (text.includes('skuInfoMap') || text.includes('skuModel') || text.includes('detailUrl'))) || '';
  }

  function get1688RootData() {
    const script = get1688ContextScript();
    if (!script) {
      return null;
    }
    const dataJson = extractBalancedJsonByKey(script, 'dataJson') || {};
    const skuModel = dataJson.skuModel || extractBalancedJsonByKey(script, 'skuModel') || {};
    const galleryFields = extractBalancedJsonByKey(script, 'gallery')
      || extractBalancedJsonByKey(script, 'fields')
      || {};
    const detailUrlMatch = script.match(/"detailUrl"\s*:\s*"([^"]+)"/);
    const productTitleMatch = script.match(/"productTitle"[\s\S]{0,800}?"title"\s*:\s*"([^"]+)"/)
      || script.match(/"subject"\s*:\s*"([^"]+)"/);
    const offerIdMatch = script.match(/"offerId"\s*:\s*(\d+)/) || location.pathname.match(/\/offer\/(\d+)\.html/);

    return {
      Root: { fields: { dataJson: { ...dataJson, skuModel } } },
      gallery: { fields: galleryFields && galleryFields.offerImgList || galleryFields && galleryFields.mainImage ? galleryFields : (extractBalancedJsonByKey(script, 'gallery') || {}).fields || {} },
      description: { fields: { detailUrl: detailUrlMatch ? detailUrlMatch[1].replace(/\\\//g, '/') : '' } },
      productTitle: { fields: { title: productTitleMatch ? productTitleMatch[1] : '' } },
      __offerId: offerIdMatch ? String(offerIdMatch[1]) : ''
    };
  }

  function get1688DataJson(data) {
    return data && data.Root && data.Root.fields && data.Root.fields.dataJson ? data.Root.fields.dataJson : {};
  }

  function clean1688HtmlText(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return normalize(textarea.value);
  }

  function clean1688OptionName(name) {
    return clean1688HtmlText(name)
      .replace(/\s*仅供外贸用途.*$/i, '')
      .replace(/\s*，?可能不符合境内产品标准.*$/i, '')
      .replace(/\s*禁止国内销售.*$/i, '')
      .trim();
  }

  function format1688Price(value) {
    const text = normalize(value);
    if (!text) {
      return '';
    }
    return text.startsWith('￥') ? text : `￥${text.replace(/^¥/, '')}`;
  }

  function parse1688OptionParts(value, skuProps) {
    const source = clean1688HtmlText(value)
      .replace(/\s*&gt;\s*/g, ' / ')
      .replace(/>/g, ' / ');
    const stripDimensionLabel = (part) => clean1688OptionName(part)
      .replace(/^[^:：;；|]+[:：]\s*/, '')
      .trim();
    let parts = source
      .split(/\s*(?:\/|;|；|\|)\s*/)
      .map(stripDimensionLabel)
      .filter(Boolean);

    // Some 1688 templates concatenate named dimensions without a visible
    // separator. Recover them from skuProps instead of treating the whole
    // string (for example “颜色:黑色;规格:红色”) as one option value.
    if (parts.length < (skuProps || []).length && Array.isArray(skuProps)) {
      const matched = skuProps.map((prop) => {
        const values = Array.isArray(prop && prop.value) ? prop.value : [];
        const hit = values
          .map((item) => clean1688OptionName(item && item.name))
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)
          .find((name) => source.includes(name));
        return hit || '';
      }).filter(Boolean);
      if (matched.length > parts.length) {
        parts = matched;
      }
    }
    return parts;
  }

  function is1688SizeDimension(option) {
    const label = option && option.dimensionNames && option.dimensionNames[1];
    return /尺码|尺寸|大小|size/i.test(String(label || ''));
  }

  function extract1688Title(data) {
    return normalize(
      data && data.productTitle && data.productTitle.fields && data.productTitle.fields.title
      || document.querySelector('.title-content') && document.querySelector('.title-content').textContent
      || document.title.replace(/\s*-\s*阿里巴巴\s*$/i, '')
    );
  }

  function get1688OptionIndexes(parts, skuProps) {
    return parts.map((part, index) => {
      const values = skuProps[index] && Array.isArray(skuProps[index].value) ? skuProps[index].value : [];
      const found = values.findIndex((item) => clean1688HtmlText(item.name) === part);
      if (found >= 0) {
        return found;
      }
      const anyFound = skuProps.reduce((best, prop) => {
        const list = Array.isArray(prop.value) ? prop.value : [];
        const idx = list.findIndex((item) => clean1688HtmlText(item.name) === part);
        return best >= 0 ? best : idx;
      }, -1);
      return anyFound >= 0 ? anyFound : 9999;
    });
  }

  function compare1688Parts(aParts, bParts, skuProps) {
    const aIndexes = get1688OptionIndexes(aParts, skuProps);
    const bIndexes = get1688OptionIndexes(bParts, skuProps);
    const len = Math.max(aIndexes.length, bIndexes.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (aIndexes[i] ?? 9999) - (bIndexes[i] ?? 9999);
      if (diff) {
        return diff;
      }
    }
    return aParts.join(' / ').localeCompare(bParts.join(' / '), 'zh-Hans-CN');
  }

  function extract1688DomPriceForParts(parts) {
    const lines = (document.body && document.body.innerText || '').split(/\n+/).map((line) => normalize(line)).filter(Boolean);
    const priceNear = (index) => {
      const windowText = lines.slice(index, index + 5).join(' ');
      const match = windowText.match(/[¥￥]\s*(\d+(?:\.\d+)?)/);
      return match ? match[1] : '';
    };
    const sizePart = parts && parts.length > 1 ? parts[parts.length - 1] : '';
    if (sizePart) {
      const sizeIndex = lines.findIndex((line) => line === sizePart || line.startsWith(`${sizePart} `));
      const price = sizeIndex >= 0 ? priceNear(sizeIndex) : '';
      if (price) {
        return price;
      }
    }
    const skuSectionIndex = lines.findIndex((line) => /^(颜色|尺码|尺寸|规格)$/.test(line));
    const scoped = skuSectionIndex >= 0 ? lines.slice(skuSectionIndex, skuSectionIndex + 80).join(' ') : lines.join(' ');
    const match = scoped.match(/[¥￥]\s*(\d+(?:\.\d+)?)/);
    return match ? match[1] : '';
  }

  function get1688SkuPrice(info, skuModel, dataJson, parts) {
    const candidates = [
      info && info.discountPrice,
      info && info.price,
      info && info.skuPrice,
      info && info.promotionPrice,
      info && info.priceDisplay,
      skuModel && skuModel.skuPriceScale,
      dataJson && dataJson.skuPriceScale,
      extract1688DomPriceForParts(parts)
    ];
    const found = candidates.find((value) => {
      if (value === null || value === undefined || value === '') {
        return false;
      }
      const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
      return Number.isFinite(numeric) && numeric > 1;
    });
    return format1688Price(found || '');
  }

  function extract1688SkuImageByName(fullName, skuProps) {
    const decoded = clean1688HtmlText(fullName);
    for (const prop of skuProps) {
      const values = Array.isArray(prop.value) ? prop.value : [];
      for (const item of values) {
        const itemName = clean1688HtmlText(item.name);
        if (item.imageUrl && itemName && (decoded.includes(itemName) || itemName.includes(decoded))) {
          return normalizeUrl(item.imageUrl);
        }
      }
    }
    return '';
  }

  function extract1688Options(data) {
    const dataJson = get1688DataJson(data);
    const skuModel = dataJson.skuModel || {};
    const skuProps = Array.isArray(skuModel.skuProps) ? skuModel.skuProps : [];
    return Object.entries(skuModel.skuInfoMap || {}).map(([rawName, info]) => {
      const fullName = clean1688HtmlText(info && info.specAttrs || rawName);
      const parts = parse1688OptionParts(fullName, skuProps);
      return {
        name: parts.length ? parts.join(' / ') : clean1688OptionName(fullName) || fullName,
        rawName: fullName,
        colorName: parts[0] || '',
        sizeName: parts[1] || '',
        specName: parts[1] || '',
        dimensionNames: skuProps.map((prop) => clean1688OptionName(
          prop && (prop.name || prop.title || prop.label || prop.propName) || ''
        )).filter(Boolean),
        skuId: info && info.skuId ? String(info.skuId) : '',
        specId: info && info.specId ? String(info.specId) : '',
        salePrice: get1688SkuPrice(info, skuModel, dataJson, parts),
        stockQuantity: info && (info.canBookCount || info.canBookCount === 0) ? info.canBookCount : '',
        saleCount: info && (info.saleCount || info.saleCount === 0) ? info.saleCount : '',
        image: extract1688SkuImageByName(fullName, skuProps),
        parts
      };
    }).sort((a, b) => compare1688Parts(a.parts || [], b.parts || [], skuProps));
  }

  function getUniqueDimensionItemsFromOptions(options, fieldName, fallbackIndex) {
    const seen = new Set();
    const items = [];
    (options || []).forEach((option) => {
      const name = normalize(option && (option[fieldName] || (Array.isArray(option.parts) ? option.parts[fallbackIndex] : '')) || '');
      if (!name || seen.has(name)) {
        return;
      }
      seen.add(name);
      items.push({ id: name, name });
    });
    return items;
  }

  function is1688OptionExcluded(option) {
    const filter = state.alibaba1688Filter || { excludedColors: new Set(), excludedSizes: new Set() };
    return filter.excludedColors.has(option.colorName)
      || filter.excludedSizes.has(option.sizeName);
  }

  function apply1688OptionFilter(options) {
    if (SITE !== '1688') {
      return options;
    }
    return (options || []).filter((option) => !is1688OptionExcluded(option));
  }

  function extract1688FilterMeta(rawOptions, filteredOptions) {
    const filter = state.alibaba1688Filter || { excludedColors: new Set(), excludedSizes: new Set() };
    return {
      colors: getUniqueDimensionItemsFromOptions(rawOptions, 'colorName', 0),
      sizes: getUniqueDimensionItemsFromOptions(rawOptions, 'sizeName', 1),
      secondDimensionLabel: is1688SizeDimension(rawOptions && rawOptions[0]) ? '尺码' : '规格/款式',
      excludedColors: Array.from(filter.excludedColors || []),
      excludedSizes: Array.from(filter.excludedSizes || []),
      rawOptionCount: rawOptions ? rawOptions.length : 0,
      filteredOptionCount: filteredOptions ? filteredOptions.length : 0
    };
  }

  function extract1688MainImages(data) {
    const fields = data && data.gallery && data.gallery.fields ? data.gallery.fields : {};
    return uniqueList([...(fields.mainImage || []), ...(fields.offerImgList || [])].map(normalizeUrl));
  }

  function normalize1688ImageIdentity(url) {
    return normalizeImageIdentity(url);
  }

  function filter1688DetailImages(images, mainImages) {
    const mainKeys = new Set((mainImages || []).map(normalize1688ImageIdentity).filter(Boolean));
    const seen = new Set();
    return (images || []).map(normalizeUrl).filter((url) => {
      const key = normalize1688ImageIdentity(url);
      if (!key || mainKeys.has(key) || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function is1688DetailImageUrl(url) {
    const source = normalizeUrl(url);
    if (!source || !/alicdn\.com/i.test(source)) {
      return false;
    }
    // The rendered 1688 detail block is not consistent between templates:
    // some use cbu01/img/ibank, while newer blocks use imgextra or a CDN URL
    // without the old ibank path.  Keep image-like CDN resources, but avoid
    // obvious site chrome that can otherwise enter the detail picker.
    if (!/\.(?:jpg|jpeg|png|webp)(?:[?#_]|$)/i.test(source)) {
      return false;
    }
    return !/(?:logo|icon|avatar|userheader|shophead|loading|sprite|rate)/i.test(source);
  }

  function extract1688RenderedDetailImages(data) {
    const candidates = [];
    const mainImages = extract1688MainImages(data);
    const detailRoot = Array.from(document.querySelectorAll('div, section, article')).find((node) => /商品详情/.test(normalize(node.textContent || '').slice(0, 80)));
    // The text marker is often a small tab/label rather than the container
    // holding the images.  Always keep a document-level fallback so the
    // picker does not disappear merely because the 1688 template changed.
    const roots = detailRoot ? [detailRoot, document.body] : [document.body];
    roots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => {
        const url = normalizeUrl(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('src'));
        if (is1688DetailImageUrl(url)) {
          candidates.push(url.replace(/_\.webp$/i, '').replace(/_sum\.jpg$/i, '').replace(/_\d+x\d+\.jpg$/i, ''));
        }
      });
    });
    return filter1688DetailImages(candidates, mainImages);
  }

  function extract1688Meta(data) {
    const dataJson = get1688DataJson(data);
    const detailUrl = normalizeUrl(data && data.description && data.description.fields && data.description.fields.detailUrl || '');
    const rangePrices = dataJson.orderParamModel && dataJson.orderParamModel.orderParam && dataJson.orderParamModel.orderParam.skuParam && Array.isArray(dataJson.orderParamModel.orderParam.skuParam.skuRangePrices)
      ? dataJson.orderParamModel.orderParam.skuParam.skuRangePrices.map((item) => ({
        beginAmount: item.beginAmount || '',
        price: format1688Price(item.price)
      }))
      : [];
    const offerId = String(data && data.__offerId || dataJson.tempModel && dataJson.tempModel.offerId || (location.pathname.match(/\/offer\/(\d+)\.html/) || [])[1] || '');
    return {
      offerId,
      detailUrl,
      rangePrices,
      detailHtml: '',
      detailError: '',
      detailLoading: false
    };
  }

  function extract1688DetailImagesFromHtml(html, mainImages) {
    const text = String(html || '');
    const contentMatch = text.match(/offer_details\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    let content = text;
    if (contentMatch) {
      try {
        const parsed = JSON.parse(contentMatch[1]);
        content = parsed && parsed.content ? parsed.content : text;
      } catch (error) {
        content = text;
      }
    }
    const urls = [];
    const imgRe = /(?:src|data-src)=["']([^"']+)["']/ig;
    let match;
    while ((match = imgRe.exec(content)) !== null) {
      const url = normalizeUrl(match[1]);
      if (is1688DetailImageUrl(url)) {
        urls.push(url);
      }
    }
    const directRe = /(?:https?:)?\/\/[^"'<>\s]+?\.(?:jpg|jpeg|png|webp)(?:_[^"'<>\s]*)?/ig;
    while ((match = directRe.exec(content)) !== null) {
      const url = normalizeUrl(match[0]);
      if (is1688DetailImageUrl(url)) {
        urls.push(url);
      }
    }
    return filter1688DetailImages(urls.map((url) => url.replace(/_\.webp$/i, '').replace(/_sum\.jpg$/i, '')), mainImages);
  }

  function getZhaojiafangSpecContext(goodsInfo) {
    const specRoot = (goodsInfo && goodsInfo.spec) || {};
    const groups = Array.isArray(specRoot.spec) ? specRoot.spec : [];
    const colorGroup = groups.find((group) => String(group.is_color) === '1') || groups[0] || {};
    const sizeGroup = groups.find((group) => group !== colorGroup) || groups[1] || {};
    const colors = Array.isArray(colorGroup.spec) ? colorGroup.spec : [];
    const sizes = Array.isArray(sizeGroup.spec) ? sizeGroup.spec : [];
    const colorById = new Map(colors.map((item) => [String(item.sp_value_id), item]));
    const sizeById = new Map(sizes.map((item) => [String(item.sp_value_id), item]));
    return {
      specData: specRoot.data || {},
      colors,
      sizes,
      colorById,
      sizeById
    };
  }

  function findZhaojiafangCurrentSku(goodsInfo) {
    const detail = (goodsInfo && goodsInfo.goods_detail) || {};
    const currentSkuId = String(detail.goods_id || '');
    const currentColorId = String(detail.color_id || '');
    const context = getZhaojiafangSpecContext(goodsInfo);
    let currentSizeId = '';
    let currentItem = null;

    Object.entries(context.specData || {}).some(([colorId, sizeMap]) => {
      return Object.entries(sizeMap || {}).some(([sizeId, item]) => {
        if (String(item && item.goods_id) === currentSkuId) {
          currentSizeId = String(sizeId);
          currentItem = item;
          return true;
        }
        return false;
      });
    });

    const color = context.colorById.get(currentColorId) || context.colorById.get(String(currentItem && currentItem.color_id)) || {};
    const size = context.sizeById.get(currentSizeId) || {};
    return {
      currentSkuId,
      currentColorName: normalize(color.sp_value || ''),
      currentSizeName: normalize(size.sp_value || ''),
      currentSkuImage: normalizeUrl((currentItem && currentItem.goods_image) || color.sp_image || (detail.images && detail.images[0]) || '')
    };
  }

  function extractZhaojiafangTitle(goodsInfo) {
    const detail = (goodsInfo && goodsInfo.goods_detail) || {};
    return normalize(detail.spu_name || detail.sku_name || document.title.replace(/-找家纺.*$/i, ''));
  }

  function extractZhaojiafangOptions(goodsInfo) {
    const context = getZhaojiafangSpecContext(goodsInfo);
    const options = [];

    Object.entries(context.specData || {}).forEach(([colorId, sizeMap]) => {
      const color = context.colorById.get(String(colorId)) || {};
      Object.entries(sizeMap || {}).forEach(([sizeId, item]) => {
        if (!item) {
          return;
        }
        const size = context.sizeById.get(String(sizeId)) || {};
        const colorName = normalize(color.sp_value || colorId);
        const sizeName = normalize(size.sp_value || sizeId);
        const name = [colorName, sizeName].filter(Boolean).join(' / ');
        if (!name) {
          return;
        }
        options.push({
          name,
          colorName,
          sizeName,
          colorId: String(colorId || ''),
          sizeId: String(sizeId || ''),
          skuId: String(item.goods_id || ''),
          salePrice: item.goods_price || '',
          price: normalizeCny(item.goods_price || ''),
          stockQuantity: item.goods_storage === undefined || item.goods_storage === null ? '' : item.goods_storage,
          stockStatus: item.goods_state_str || '',
          weight: item.goods_weight || '',
          image: normalizeUrl(item.goods_image || color.sp_image || ''),
          rawText: name
        });
      });
    });

    return options;
  }

  function getZhaojiafangOptionDimensions(goodsInfo) {
    const context = getZhaojiafangSpecContext(goodsInfo);
    return {
      colors: context.colors.map((item) => ({
        id: String(item.sp_value_id || ''),
        name: normalize(item.sp_value || item.sp_value_name || item.sp_value_id || '')
      })).filter((item) => item.name),
      sizes: context.sizes.map((item) => ({
        id: String(item.sp_value_id || ''),
        name: normalize(item.sp_value || item.sp_value_name || item.sp_value_id || '')
      })).filter((item) => item.name)
    };
  }

  function isZhaojiafangOptionExcluded(option) {
    const filter = state.zhaojiafangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return filter.excludedColors.has(option.colorName)
      || filter.excludedColors.has(option.colorId)
      || filter.excludedSizes.has(option.sizeName)
      || filter.excludedSizes.has(option.sizeId);
  }

  function applyZhaojiafangOptionFilter(options) {
    if (SITE !== 'zhaojiafang') {
      return options;
    }
    return (options || []).filter((option) => !isZhaojiafangOptionExcluded(option));
  }

  function extractZhaojiafangFilterMeta(goodsInfo, rawOptions, filteredOptions) {
    const dimensions = getZhaojiafangOptionDimensions(goodsInfo);
    const filter = state.zhaojiafangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return {
      colors: dimensions.colors,
      sizes: dimensions.sizes,
      excludedColors: Array.from(filter.excludedColors || []),
      excludedSizes: Array.from(filter.excludedSizes || []),
      rawOptionCount: rawOptions ? rawOptions.length : 0,
      filteredOptionCount: filteredOptions ? filteredOptions.length : 0
    };
  }

  function extractZhaojiafangImages(goodsInfo) {
    const detail = (goodsInfo && goodsInfo.goods_detail) || {};
    const images = uniqueList(detail.images || []);
    const current = findZhaojiafangCurrentSku(goodsInfo);
    const currentSkuImage = current.currentSkuImage;
    return {
      mainImages: currentSkuImage ? [currentSkuImage] : images.slice(0, 1),
      detailImages: images.filter((url) => url !== currentSkuImage),
      currentSkuImage,
      allImages: images
    };
  }

  function extractZhaojiafangVideoUrl(goodsInfo) {
    const urls = [];
    const pushVideoUrl = (value) => {
      const url = normalizeUrl(value || '');
      if (!url || !/\.(?:mp4|m3u8|mov|webm)(?:\?|$)|video\.zhaojiafang\.com|\/video\//i.test(url)) {
        return;
      }
      if (!urls.includes(url)) {
        urls.push(url);
      }
    };

    // Important for Zhaojiafang: different selected options can render different videos.
    // The visible player is the user's current SKU state, so it must win over __NEXT_DATA__.
    document.querySelectorAll('video, video source, source').forEach((node) => {
      pushVideoUrl(node.currentSrc || node.src || node.getAttribute('src') || node.getAttribute('data-src'));
    });

    const detail = (goodsInfo && goodsInfo.goods_detail) || {};
    [
      detail.video,
      detail.video_url,
      detail.videoUrl,
      detail.goods_video,
      detail.goods_video_url,
      detail.video_path
    ].forEach(pushVideoUrl);

    return urls[0] || '';
  }

  function extractZhaojiafangMeta(goodsInfo) {
    const detail = (goodsInfo && goodsInfo.goods_detail) || {};
    const current = findZhaojiafangCurrentSku(goodsInfo);
    const download = (goodsInfo && goodsInfo.download) || {};
    return {
      spuId: String(detail.goods_commonid || ''),
      currentSkuId: String(detail.goods_id || ''),
      currentColorName: current.currentColorName,
      currentSizeName: current.currentSizeName,
      priceRange: detail.goods_price || '',
      totalStock: detail.goods_storage === undefined || detail.goods_storage === null ? '' : detail.goods_storage,
      weight: detail.weight || '',
      status: detail.goods_state_str || '',
      imageDownloadCount: detail.image_download || '',
      allImageUrl: normalizeUrl(download.all_image_url || ''),
      quickImageRarUrl: ''
    };
  }


  function normalizePddImageUrl(url) {
    const value = normalizeUrl(url || '');
    if (!value) {
      return '';
    }
    return value
      .replace(/\?.*$/, '')
      .replace(/\.a\.jpeg\.webp$/i, '.a.jpeg')
      .replace(/\.jpeg\.webp$/i, '.jpeg')
      .replace(/\.jpg\.webp$/i, '.jpg')
      .replace(/\.png\.webp$/i, '.png');
  }

  function formatPddPrice(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (typeof value === 'string' && /^￥/.test(value.trim())) {
      return value.trim();
    }
    const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric)) {
      return String(value);
    }
    const yuan = numeric >= 1000 && Number.isInteger(numeric) ? numeric / 100 : numeric;
    return `￥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
  }

  function getPddCapturedPayload() {
    const candidates = [];
    if (window.__PRODUCT_AI_CAPTURE_PDD__) {
      candidates.push(window.__PRODUCT_AI_CAPTURE_PDD__);
    }
    const attr = document.documentElement && document.documentElement.getAttribute('data-product-ai-pdd-summary');
    if (attr) {
      try {
        candidates.push(JSON.parse(attr));
      } catch (error) {
        console.warn('[Product AI Capture] PDD summary parse failed', error);
      }
    }
    return candidates.find((item) => item && (item.goodsName || item.goodsID || (item.skus && item.skus.length) || (item.topGallery && item.topGallery.length))) || null;
  }

  function extractPddTitle(payload) {
    return normalize((payload && (payload.goodsName || payload.goods_name || payload.title)) || document.querySelector('h1')?.textContent || extractPddDomTitle() || document.title.replace(/拼多多.*/i, ''));
  }

  function getPddVisibleText() {
    return normalize(document.body && document.body.innerText || '');
  }

  function extractPddDomTitle() {
    const text = getPddVisibleText();
    const titlePatterns = [
      /已拼\s*\d+\s*件\s+(?:满\d+减\d+\s+)*(?:满\d+返\d+\s+)*(.+?)\s+发货前/,
      /¥\s*\d+(?:\.\d+)?\s+已拼\s*\d+\s*件\s+(.+?)\s+发货前/,
      /(?:颜色款式|已选：.*?)\s*¥?\s*\d+(?:\.\d+)?\s*(?:已拼\d+件)?\s*(.+?)\s+(?:发货前|7天无理由|商品评价)/
    ];
    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      const value = normalize(match && match[1]);
      if (value && value.length >= 6 && !/拼单即将结束|去拼单|查看全部/.test(value)) {
        return value;
      }
    }
    return '';
  }

  function extractPddDomPrice() {
    const text = getPddVisibleText();
    const match = text.match(/¥\s*\d+(?:\.\d+)?/);
    return match ? formatPddPrice(match[0]) : '';
  }

  function findPddSkuPopupRoot() {
    const nodes = Array.from(document.querySelectorAll('div, section, aside'));
    const candidates = nodes.map((node) => {
      if (root.contains(node)) {
        return null;
      }
      const rect = node.getBoundingClientRect && node.getBoundingClientRect();
      if (!rect || rect.width < 260 || rect.height < 180) {
        return null;
      }
      const text = normalize(node.innerText || node.textContent || '');
      const hasColor = /(?:^|\s)(颜色分类|颜色|款式)(?:\s|$)/.test(text);
      const hasSize = /(?:^|\s)(尺码|尺寸|规格|型号)(?:\s|$)/.test(text);
      const hasConfirm = /(?:^|\s)确定(?:\s|$)/.test(text);
      if (!hasColor || !hasSize || !hasConfirm) {
        return null;
      }
      const area = rect.width * rect.height;
      const imageCount = Array.from(node.querySelectorAll('img')).filter((img) => /pddpic\.com/i.test(img.currentSrc || img.src || '')).length;
      const skuClassBonus = /sku|spec/i.test(String(node.className || '')) ? -500000 : 0;
      return { node, area, imageCount, score: area + skuClassBonus };
    }).filter(Boolean);
    candidates.sort((a, b) => {
      const areaDiff = a.score - b.score;
      if (Math.abs(areaDiff) > 10000) {
        return areaDiff;
      }
      return b.imageCount - a.imageCount;
    });
    return candidates[0] ? candidates[0].node : null;
  }

  function collectPddDomImageEntries(scope) {
    const entries = [];
    const imageScope = scope || document;
    const push = (value, node) => {
      const raw = normalizeUrl(value || '').replace(/\\\//g, '/');
      const url = normalizePddImageUrl(raw);
      if (url && /pddpic\.com|pinduoduo\.com/i.test(url) && !/avatar|review|comment|mall-logo|merchant|promotion\.pddpic|commimg\.pddpic/i.test(raw)) {
        entries.push({ raw, url, node: node || null });
      }
    };
    Array.from(imageScope.querySelectorAll ? imageScope.querySelectorAll('img') : document.images || []).forEach((img) => {
      push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original'), img);
      const srcset = img.getAttribute('srcset') || '';
      srcset.split(',').forEach((part) => push(part.trim().split(/\s+/)[0], img));
    });
    Array.from((imageScope.querySelectorAll ? imageScope : document).querySelectorAll('[style*="pddpic"], [style*="pinduoduo"]')).forEach((node) => {
      const style = node.getAttribute('style') || '';
      const matches = style.match(/https?:\\?\/\\?\/[^)'"\s]+/g) || [];
      matches.forEach((url) => push(url, node));
    });
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry.url || seen.has(entry.url)) {
        return false;
      }
      seen.add(entry.url);
      return true;
    });
  }

  function collectPddDomImageUrls(scope) {
    return collectPddDomImageEntries(scope).map((entry) => entry.url);
  }

  function extractPddDomColorImages(expectedCount) {
    const popupRoot = findPddSkuPopupRoot();
    const count = expectedCount || undefined;
    const scopedEntries = popupRoot ? collectPddDomImageEntries(popupRoot) : [];
    const globalEntries = collectPddDomImageEntries();
    const isSmallSkuThumb = (entry) => /thumbnail\/(?:120|144|160|180|200|240)x/i.test(entry.raw);
    const isSelectedSkuThumb = (entry) => /thumbnail\/(?:300|375|400)x/i.test(entry.raw);
    const isLargeProductImage = (entry) => /thumbnail\/(?:750|800|1000|1300)x/i.test(entry.raw);
    // Important: PDD often renders SKU option thumbnails outside the text popup.
    // Use the popup for option names, but search the whole page for small SKU thumbs.
    const scopedSwatches = scopedEntries.filter(isSmallSkuThumb);
    const globalSwatches = globalEntries.filter(isSmallSkuThumb);
    const selectedThumbs = scopedEntries.concat(globalEntries).filter(isSelectedSkuThumb);
    const fallbackSmall = scopedEntries.concat(globalEntries).filter((entry) => !isLargeProductImage(entry));
    const preferred = scopedSwatches.length >= (expectedCount || 1)
      ? scopedSwatches
      : globalSwatches.length >= (expectedCount || 1)
        ? globalSwatches
        : globalSwatches.length
          ? globalSwatches
          : selectedThumbs.length
            ? selectedThumbs
            : fallbackSmall;
    return uniqueList(preferred.map((entry) => entry.url)).slice(0, count);
  }

  function extractPddDomProductImages(limit) {
    const urls = collectPddDomImageUrls()
      .filter((url) => !/thumbnail\/(?:100|120|144|160|180)x/i.test(url));
    return uniqueList(urls).slice(0, limit || undefined);
  }

  function parsePddDomOptionDimensions() {
    const popupRoot = findPddSkuPopupRoot();
    const rawText = popupRoot ? (popupRoot.innerText || popupRoot.textContent || '') : (document.body && document.body.innerText || '');
    const lines = rawText.split(/\n+/).map((line) => normalize(line)).filter(Boolean);
    const isColorLabel = (line) => /^(颜色分类|颜色|款式)$/.test(line);
    const isSizeLabel = (line) => /^(尺码|尺寸|规格|型号)$/.test(line);
    const isStopLabel = (line) => /^(确定|加入购物车|立即购买|单独购买|发起拼单|用手机浏览器扫码.*|顶部|商品讲解)$/.test(line);
    const cleanColorValue = (line) => normalize(line).replace(/^🔥\s*/, '');
    const validColorValue = (line) => {
      const value = cleanColorValue(line);
      return value
        && !isColorLabel(value)
        && !isSizeLabel(value)
        && !isStopLabel(value)
        && !/^请选择/.test(value)
        && !/[¥￥]|大促|满\d+|已拼|拼单|发货|商品详情|评价|收藏|客服/.test(value)
        && value.length <= 30;
    };

    let colorIndex = -1;
    let sizeIndex = -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!isColorLabel(lines[i])) {
        continue;
      }
      const nextSizeIndex = lines.findIndex((line, index) => index > i && index <= i + 40 && isSizeLabel(line));
      if (nextSizeIndex > i) {
        colorIndex = i;
        sizeIndex = nextSizeIndex;
        break;
      }
    }

    let colors = [];
    let sizes = [];
    if (colorIndex >= 0 && sizeIndex > colorIndex) {
      colors = lines.slice(colorIndex + 1, sizeIndex)
        .flatMap((line) => line.split(/\s+/))
        .map(cleanColorValue)
        .filter(validColorValue);

      const sizeEnd = (() => {
        for (let i = sizeIndex + 1; i < lines.length; i += 1) {
          if (isStopLabel(lines[i]) || isColorLabel(lines[i])) {
            return i;
          }
        }
        return Math.min(lines.length, sizeIndex + 40);
      })();
      const sizeText = lines.slice(sizeIndex + 1, sizeEnd).join(' ');
      const sizePattern = /((?:\d+)?XL|XS|S|M|L|均码|均碼|加大码|加大碼)(?:\s*建议\s*[\d.]+\s*[-—–]\s*[\d.]+斤)?/gi;
      let match;
      while ((match = sizePattern.exec(sizeText))) {
        const value = normalize(match[0]);
        if (value && !sizes.includes(value)) {
          sizes.push(value);
        }
      }
      if (!sizes.length) {
        sizes = lines.slice(sizeIndex + 1, sizeEnd)
          .flatMap((line) => line.split(/\s+/))
          .map(normalize)
          .filter((line) => line && !isStopLabel(line) && !isColorLabel(line) && !isSizeLabel(line));
      }
    }

    if (!colors.length && !sizes.length) {
      const text = getPddVisibleText();
      const selectedIndex = text.lastIndexOf('已选：');
      const colorWordIndex = text.lastIndexOf('请选择 颜色');
      const start = Math.max(selectedIndex, colorWordIndex, text.lastIndexOf('颜色分类'));
      const section = text.slice(Math.max(0, start), Math.max(0, start) + 2000);
      const colorMatch = section.match(/(?:颜色分类|颜色|款式)\s+(.+?)\s+(?:尺码|尺寸|规格|型号)\s+/);
      const sizeMatch = section.match(/(?:尺码|尺寸|规格|型号)\s+(.+?)\s+(?:确定|¥|加入购物车|立即购买)/);
      colors = colorMatch ? colorMatch[1].split(/\s+/).map(cleanColorValue).filter(validColorValue) : [];
      if (sizeMatch) {
        const sizePattern = /((?:\d+)?XL|XS|S|M|L|均码|均碼|加大码|加大碼)(?:\s*建议\s*[\d.]+\s*[-—–]\s*[\d.]+斤)?/gi;
        let match;
        while ((match = sizePattern.exec(sizeMatch[1]))) {
          const value = normalize(match[0]);
          if (value && !sizes.includes(value)) {
            sizes.push(value);
          }
        }
      }
    }

    return { colors: uniqueList(colors), sizes: uniqueList(sizes) };
  }

  function extractPddDomOptions() {
    const { colors, sizes } = parsePddDomOptionDimensions();
    const price = extractPddDomPrice();
    const colorImages = extractPddDomColorImages(colors.length);
    if (!colors.length && !sizes.length) {
      return [];
    }
    const rows = [];
    const colorList = colors.length ? colors : [''];
    const sizeList = sizes.length ? sizes : [''];
    colorList.forEach((color, colorIndex) => {
      sizeList.forEach((size) => {
        const name = [color, size].filter(Boolean).join(' / ');
        rows.push({
          name,
          colorName: color,
          skuId: '',
          salePrice: price,
          originalPrice: '',
          stockQuantity: '',
          stockStatus: '',
          image: colorImages[colorIndex] || '',
          rawText: 'dom-fallback'
        });
      });
    });
    return rows.filter((row) => row.name || row.salePrice || row.image);
  }

  function extractPddOptions(payload) {
    const skus = (payload && Array.isArray(payload.skus) && payload.skus.length ? payload.skus : payload && payload.sku) || [];
    if (!skus.length) {
      return extractPddDomOptions();
    }
    return skus.map((sku) => {
      const specs = Array.isArray(sku.specs) ? sku.specs : [];
      const specItems = specs.map((spec) => {
        const specName = normalize(spec.spec_key || spec.specKey || spec.key || spec.label || spec.parent_name || spec.parentName || '');
        const specValue = normalize(spec.spec_value || spec.specValue || spec.value || spec.name || spec);
        return { specName, specValue };
      }).filter((item) => item.specValue);
      const name = specItems.map((item) => item.specValue).join(' / ')
        || normalize(sku.sku_name || sku.skuName || sku.name || sku.skuID || sku.sku_id || '');
      const image = normalizePddImageUrl(sku.thumbUrl || sku.thumb_url || sku.hd_thumb_url || '');
      const explicitColor = specItems.find((item) => /颜色|顏色|色|款式|图案|颜色分类|color/i.test(item.specName));
      const colorName = (explicitColor && explicitColor.specValue)
        || (image && specItems.length ? specItems[0].specValue : '')
        || normalize(name.split('/')[0]);
      const stockQuantity = sku.quantity !== undefined ? sku.quantity : sku.stock_quantity !== undefined ? sku.stock_quantity : sku.stockQuantity;
      const saleRaw = sku.groupPrice || sku.group_price || sku.normalPrice || sku.normal_price || sku.skuExpansionPrice || sku.sku_expansion_price || sku.price;
      const originalRaw = sku.normalPrice || sku.normal_price || sku.linePrice || sku.line_price;
      return {
        name,
        colorName,
        skuId: String(sku.skuID || sku.sku_id || ''),
        salePrice: formatPddPrice(saleRaw),
        originalPrice: originalRaw && originalRaw !== saleRaw ? formatPddPrice(originalRaw) : '',
        stockQuantity: stockQuantity === undefined || stockQuantity === null ? '' : String(stockQuantity),
        stockStatus: sku.is_onsale === 0 || sku.isOnsale === false || Number(stockQuantity) === 0 ? 'sold_out_or_unavailable' : '',
        image,
        rawText: JSON.stringify(sku).slice(0, 500)
      };
    }).filter((option) => option.name || option.skuId || option.salePrice || option.image);
  }


  function extractPddMainImages(payload) {
    const topGallery = (payload && (payload.topGallery || payload.viewImageData || payload.gallery)) || [];
    const urls = [];
    const push = (value) => {
      const url = normalizePddImageUrl(typeof value === 'string' ? value : value && (value.url || value.thumbUrl || value.img_url));
      if (url && /pddpic\.com|pinduoduo\.com/i.test(url)) {
        urls.push(url);
      }
    };
    if (Array.isArray(topGallery)) {
      topGallery.forEach((item) => {
        if (item && String(item.type) && String(item.type) !== '1' && item.url && payload && payload.gallery) {
          return;
        }
        push(item);
      });
    }
    const params = new URLSearchParams(location.search);
    push(params.get('_oak_gallery'));
    push(params.get('thumb_url'));
    if (!urls.length) {
      extractPddDomProductImages(10).forEach(push);
    }
    return uniqueList(urls);
  }

  function extractPddDetailImages(payload) {
    const detailGallery = (payload && (payload.detailGallery || payload.detail_gallery)) || [];
    const urls = [];
    const push = (value) => {
      const url = normalizePddImageUrl(typeof value === 'string' ? value : value && (value.url || value.img_url));
      if (url && /pddpic\.com|pinduoduo\.com/i.test(url)) {
        urls.push(url);
      }
    };
    if (Array.isArray(detailGallery)) {
      detailGallery.forEach(push);
    }
    if (!urls.length && payload && Array.isArray(payload.gallery)) {
      payload.gallery.forEach((item) => {
        if (item && String(item.type) === '2') {
          push(item);
        }
      });
    }
    if (!urls.length) {
      extractPddDomProductImages().slice(10).forEach(push);
    }
    return uniqueList(urls);
  }

  function extractPddMeta(payload) {
    return {
      goodsId: String((payload && (payload.goodsID || payload.goods_id)) || new URLSearchParams(location.search).get('goods_id') || ''),
      spuId: String((payload && (payload.spuID || payload.spu_id)) || ''),
      captureSource: (payload && payload.__captureSource) || (payload ? '' : 'dom-fallback'),
      rawCapturedAt: (payload && payload.__capturedAt) || ''
    };
  }


  function extractTemuGoodsIdFromUrl() {
    const params = new URLSearchParams(location.search);
    const queryGoodsId = params.get('goods_id');
    if (queryGoodsId) {
      return queryGoodsId;
    }
    const match = location.pathname.match(/-g-(\d+)\.html/i) || location.pathname.match(/goods(?:\.html)?\D+(\d+)/i);
    return match ? match[1] : '';
  }

  function extractTemuTitleFromUrl() {
    try {
      const decodedPath = decodeURIComponent(location.pathname);
      const match = decodedPath.match(/\/kr\/(.+?)-g-\d+\.html/i) || decodedPath.match(/\/(.+?)-g-\d+\.html/i);
      if (!match) {
        return '';
      }
      return normalize(match[1].replace(/-+/g, ' ').replace(/\s+/g, ' '));
    } catch (error) {
      return '';
    }
  }

  function normalizeTemuImageUrl(url) {
    const value = normalizeUrl(url || '');
    if (!value) {
      return '';
    }
    return value.replace(/\?.*$/, '');
  }

  function formatTemuPrice(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const text = String(value).trim();
    if (/[$€£¥₩￥]/.test(text)) {
      return text;
    }
    const numeric = Number(text.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric)) {
      return text;
    }
    return `₩${Math.round(numeric).toLocaleString('ko-KR')}`;
  }

  function getTemuCapturedPayload() {
    const candidates = [];
    if (window.__PRODUCT_AI_CAPTURE_TEMU__) {
      candidates.push(window.__PRODUCT_AI_CAPTURE_TEMU__);
    }
    const attr = document.documentElement && document.documentElement.getAttribute('data-product-ai-temu-summary');
    if (attr) {
      try {
        candidates.push(JSON.parse(attr));
      } catch (error) {
        console.warn('[Product AI Capture] Temu summary parse failed', error);
      }
    }
    return candidates.find((item) => item && (item.goodsName || item.goodsID || (item.skus && item.skus.length) || (item.topGallery && item.topGallery.length))) || null;
  }

  function extractTemuTitle(payload) {
    return normalize((payload && (payload.goodsName || payload.goods_name || payload.title)) || document.querySelector('h1')?.textContent || extractTemuTitleFromUrl());
  }

  function extractTemuOptions(payload) {
    const skus = (payload && Array.isArray(payload.skus) && payload.skus.length ? payload.skus : payload && payload.sku) || [];
    return skus.map((sku) => {
      const specs = Array.isArray(sku.specs) ? sku.specs : [];
      const name = specs.map((spec) => normalize(spec.spec_value || spec.specValue || spec.value || spec.name || spec)).filter(Boolean).join(' / ')
        || normalize(sku.sku_name || sku.skuName || sku.name || sku.skuID || sku.sku_id || '');
      const stockQuantity = sku.quantity !== undefined ? sku.quantity : sku.stock_quantity !== undefined ? sku.stock_quantity : sku.stockQuantity;
      const saleRaw = sku.salePrice || sku.sale_price || sku.priceText || sku.price_text || sku.price || sku.groupPrice || sku.normalPrice;
      const originalRaw = sku.originalPrice || sku.original_price || sku.marketPrice || sku.market_price || sku.normalPrice || sku.normal_price;
      return {
        name,
        skuId: String(sku.skuID || sku.sku_id || ''),
        salePrice: formatTemuPrice(saleRaw),
        originalPrice: originalRaw && originalRaw !== saleRaw ? formatTemuPrice(originalRaw) : '',
        stockQuantity: stockQuantity === undefined || stockQuantity === null ? '' : String(stockQuantity),
        stockStatus: sku.is_onsale === 0 || sku.isOnsale === false || Number(stockQuantity) === 0 ? 'sold_out_or_unavailable' : '',
        image: normalizeTemuImageUrl(sku.thumbUrl || sku.thumb_url || sku.hd_thumb_url || sku.image || ''),
        rawText: JSON.stringify(sku).slice(0, 500)
      };
    }).filter((option) => option.name || option.skuId || option.salePrice || option.image);
  }

  function extractTemuMainImages(payload) {
    const topGallery = (payload && (payload.topGallery || payload.viewImageData || payload.gallery)) || [];
    const urls = [];
    const push = (value) => {
      const url = normalizeTemuImageUrl(typeof value === 'string' ? value : value && (value.url || value.thumbUrl || value.img_url || value.image));
      if (url && /kwcdn\.com|temu\.com/i.test(url)) {
        urls.push(url);
      }
    };
    if (Array.isArray(topGallery)) {
      topGallery.forEach((item) => {
        if (item && String(item.type) && String(item.type) !== '1' && item.url && payload && payload.gallery) {
          return;
        }
        push(item);
      });
    }
    const params = new URLSearchParams(location.search);
    push(params.get('top_gallery_url'));
    Array.from(document.querySelectorAll('img')).slice(0, 30).forEach((img) => {
      push(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src'));
    });
    return uniqueList(urls).slice(0, 12);
  }

  function extractTemuDetailImages(payload) {
    const detailGallery = (payload && (payload.detailGallery || payload.detail_gallery || payload.descGallery || payload.desc_gallery)) || [];
    const urls = [];
    const push = (value) => {
      const url = normalizeTemuImageUrl(typeof value === 'string' ? value : value && (value.url || value.img_url || value.image));
      if (url && /kwcdn\.com|temu\.com/i.test(url)) {
        urls.push(url);
      }
    };
    if (Array.isArray(detailGallery)) {
      detailGallery.forEach(push);
    }
    if (!urls.length && payload && Array.isArray(payload.gallery)) {
      payload.gallery.forEach((item) => {
        if (item && String(item.type) === '2') {
          push(item);
        }
      });
    }
    if (!urls.length) {
      extractPddDomProductImages().slice(10).forEach(push);
    }
    return uniqueList(urls);
  }

  function extractTemuMeta(payload) {
    const params = new URLSearchParams(location.search);
    return {
      goodsId: String((payload && (payload.goodsID || payload.goods_id)) || extractTemuGoodsIdFromUrl() || ''),
      spuId: String((payload && (payload.spuID || payload.spu_id)) || ''),
      specGalleryId: params.get('spec_gallery_id') || '',
      topGalleryUrl: normalizeTemuImageUrl(params.get('top_gallery_url') || ''),
      captureSource: (payload && payload.__captureSource) || '',
      rawCapturedAt: (payload && payload.__capturedAt) || ''
    };
  }


  function normalizeNaverImageUrl(url) {
    const value = normalizeUrl(url || '');
    if (!value) {
      return '';
    }
    try {
      const parsed = new URL(value, location.href);
      if (parsed.searchParams.has('src')) {
        return normalizeUrl(decodeURIComponent(parsed.searchParams.get('src') || '')).replace(/\?.*$/, '');
      }
      return parsed.href.replace(/\?.*$/, '');
    } catch (error) {
      return value.replace(/\?.*$/, '');
    }
  }

  function extractNaverSmartstoreEditorImageUrl(img) {
    if (!img) {
      return '';
    }
    const attrCandidates = [
      img.getAttribute('data-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('srcset') && String(img.getAttribute('srcset')).split(/\s+/)[0],
      img.getAttribute('src'),
      img.currentSrc,
      img.src
    ];
    for (const value of attrCandidates) {
      if (value && !/^data:/i.test(String(value))) {
        return value;
      }
    }

    const linkNode = img.closest('[data-linkdata]');
    const linkData = linkNode && linkNode.getAttribute('data-linkdata');
    if (linkData) {
      try {
        const parsed = JSON.parse(linkData);
        if (parsed && parsed.src) {
          return parsed.src;
        }
      } catch (error) {
        const match = linkData.match(/"src"\s*:\s*"([^"]+)/);
        if (match) {
          return match[1];
        }
      }
    }
    return '';
  }

  function extractNaverSmartstoreProductId() {
    const match = location.pathname.match(/\/products\/(\d+)/);
    return match ? match[1] : '';
  }

  function extractNaverSmartstoreStoreName() {
    const match = location.pathname.match(/^\/([^/]+)\/products\//);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function extractNaverSmartstoreTitle() {
    const candidates = [
      document.querySelector('h3'),
      document.querySelector('h2'),
      document.querySelector('[class*="ProductInfo"] h3'),
      document.querySelector('[class*="product"] h3'),
      document.querySelector('meta[property="og:title"]')
    ];
    for (const node of candidates) {
      const value = normalize(node && (node.getAttribute && node.getAttribute('content') || node.textContent));
      if (value && !/네이버|NAVER|스마트스토어/i.test(value)) {
        return value.replace(/\s*[:|-]\s*네이버.*$/i, '');
      }
    }
    return normalize(document.title).replace(/\s*[:|-]\s*네이버.*$/i, '');
  }

  function extractNaverSmartstorePrice() {
    const texts = [];
    const add = (value) => {
      const text = normalize(value || '');
      if (text) {
        texts.push(text);
      }
    };
    document.querySelectorAll('[class*="price"], strong, em, span, div').forEach((node) => {
      const text = normalize(node.textContent);
      if (/\d[\d,]*\s*원/.test(text) && text.length < 120) {
        add(text);
      }
    });
    add(document.body.innerText);
    for (const text of texts) {
      const saleMatch = text.match(/(?:판매가|할인가|가격)?\s*(\d[\d,]*)\s*원/);
      if (saleMatch) {
        return `${saleMatch[1]}원`;
      }
    }
    return '';
  }

  function extractNaverSmartstoreShipping() {
    const text = normalize(document.body.innerText || '');
    const freeMatch = text.match(/무료배송|배송비\s*무료/);
    if (freeMatch) {
      return freeMatch[0];
    }
    const patterns = [
      /배송비\s*(\d[\d,]*\s*원)/,
      /배송\s*비\s*(\d[\d,]*\s*원)/,
      /(\d[\d,]*\s*원)\s*배송비/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    return '';
  }

  function isNaverSmartstoreProductImage(img) {
    if (!img) {
      return false;
    }
    const src = normalizeNaverImageUrl(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original'));
    if (!src || !/shop-phinf\.pstatic\.net/i.test(src)) {
      return false;
    }
    const alt = normalize(img.alt || '');
    const nearbyText = normalize(img.closest('a,button,li,div') && img.closest('a,button,li,div').innerText || '');
    if (/^@/.test(alt) || /상품 바로가기|함께 구매|인기상품|둘러볼 만한|추천/.test(nearbyText)) {
      return false;
    }
    return /대표이미지|추가이미지/.test(alt) || /대표이미지/.test(nearbyText) || /type=(?:o1000|f40)/.test(img.currentSrc || img.src || '');
  }

  function extractNaverSmartstoreImages() {
    const urls = [];
    const push = (value) => {
      const url = normalizeNaverImageUrl(value);
      if (url && /shop-phinf\.pstatic\.net/i.test(url)) {
        urls.push(url);
      }
    };
    document.querySelectorAll('img').forEach((img) => {
      if (isNaverSmartstoreProductImage(img)) {
        push(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original'));
      }
    });
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((node) => push(node.getAttribute('content')));
    return uniqueList(urls);
  }

  function extractNaverSmartstoreMainImages() {
    return extractNaverSmartstoreImages().slice(0, 8);
  }

  function extractNaverSmartstoreDetailImages() {
    const mainSet = new Set(extractNaverSmartstoreMainImages());
    const urls = [];
    const push = (value) => {
      const url = normalizeNaverImageUrl(value);
      if (url && /shop-phinf\.pstatic\.net/i.test(url) && !mainSet.has(url)) {
        urls.push(url);
      }
    };

    const editorContainers = Array.from(document.querySelectorAll('.se-main-container'));
    editorContainers.forEach((container) => {
      container.querySelectorAll('img.se-image-resource, .se-module-image img, img').forEach((img) => {
        const rawSrc = extractNaverSmartstoreEditorImageUrl(img);
        const alt = normalize(img.alt || '');
        if (!rawSrc || /^data:/i.test(rawSrc) || /대표이미지|추가이미지|^@/.test(alt)) {
          return;
        }
        push(rawSrc);
      });

      container.querySelectorAll('[data-linkdata]').forEach((node) => {
        const linkData = node.getAttribute('data-linkdata') || '';
        try {
          const parsed = JSON.parse(linkData);
          if (parsed && parsed.src) {
            push(parsed.src);
          }
        } catch (error) {
          const match = linkData.match(/"src"\s*:\s*"([^"]+)/);
          if (match) {
            push(match[1]);
          }
        }
      });
    });

    if (urls.length) {
      return uniqueList(urls).slice(0, 80);
    }

    // Fallback only when SmartEditor detail container has not been mounted yet.
    document.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
      const src = normalizeNaverImageUrl(rawSrc);
      if (!src || !/shop-phinf\.pstatic\.net/i.test(src) || mainSet.has(src)) {
        return;
      }

      const alt = normalize(img.alt || '');
      const nearbyText = normalize(img.closest('a,button,li,div') && img.closest('a,button,li,div').innerText || '');
      if (/대표이미지|추가이미지|^@/.test(alt) || /상품 바로가기|함께 구매|인기상품|추천|멤버십|할인|쿠폰|배송비/.test(nearbyText)) {
        return;
      }
      if (/promo|coupon|banner|EC8381EB8BA8EBA1A4EBA781EBB0B0EB8488/i.test(rawSrc)) {
        return;
      }

      const rect = img.getBoundingClientRect && img.getBoundingClientRect();
      const displayedWidth = rect ? rect.width : img.naturalWidth;
      const displayedHeight = rect ? rect.height : img.naturalHeight;
      const isLargeDetail = img.naturalWidth >= 600 && img.naturalHeight >= 250 && displayedWidth >= 300 && displayedHeight >= 180;
      const isSmartstoreDetailSize = /[?&]type=w\d+/i.test(rawSrc) && !/[?&]type=w500_webp/i.test(rawSrc);

      if (isLargeDetail || isSmartstoreDetailSize) {
        push(rawSrc);
      }
    });

    return uniqueList(urls).slice(0, 80);
  }

  function extractNaverSmartstoreDetailHtml() {
    const containers = Array.from(document.querySelectorAll('.se-main-container'));
    if (!containers.length) {
      return '';
    }

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-source', 'naver-smartstore-detail');
    containers.forEach((container, index) => {
      const clone = container.cloneNode(true);
      clone.setAttribute('data-detail-block-index', String(index));

      clone.querySelectorAll('script').forEach((node) => node.remove());
      clone.querySelectorAll('img').forEach((img) => {
        const originalSelector = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src') || '';
        let src = originalSelector;
        if (!src || /^data:/i.test(src)) {
          const id = img.closest('[id]') && img.closest('[id]').id;
          const originalImg = id ? container.querySelector(`#${CSS.escape(id)} img`) : null;
          src = extractNaverSmartstoreEditorImageUrl(originalImg || img);
        }
        if (!src || /^data:/i.test(src)) {
          const linkNode = img.closest('[data-linkdata]');
          const linkData = linkNode && linkNode.getAttribute('data-linkdata');
          if (linkData) {
            try {
              const parsed = JSON.parse(linkData);
              src = parsed && parsed.src || src;
            } catch (error) {
              const match = linkData.match(/"src"\s*:\s*"([^"]+)/);
              if (match) {
                src = match[1];
              }
            }
          }
        }
        const normalizedSrc = normalizeNaverImageUrl(src);
        if (normalizedSrc) {
          img.setAttribute('src', normalizedSrc);
          img.setAttribute('data-original-src', normalizedSrc);
        }
        ['data-src', 'data-original', 'data-lazy-src', 'srcset'].forEach((attr) => img.removeAttribute(attr));
      });

      wrapper.appendChild(clone);
    });
    return wrapper.innerHTML.trim();
  }


  function extractNaverSmartstoreOptions() {
    const byName = new Map();
    const basePrice = extractNaverSmartstorePrice();
    const optionNodes = Array.from(document.querySelectorAll('[role="option"], option'));

    optionNodes.forEach((node) => {
      const rawText = normalize(node.textContent || '');
      if (!rawText || /선택|옵션을 선택|품절 상품 제외/.test(rawText)) {
        return;
      }
      if (/장바구니|구매하기|찜하기|공유|리뷰|문의|배송|판매자|로그인|네이버/.test(rawText)) {
        return;
      }
      const priceMatch = rawText.match(/([+-]\s*\d[\d,]*\s*원|\d[\d,]*\s*원)/);
      const stockText = /품절/.test(rawText) ? '품절' : (rawText.match(/재고\s*\d+개|남은수량\s*\d+개/) || [''])[0];
      let name = rawText
        .replace(/([+-]\s*\d[\d,]*\s*원|\d[\d,]*\s*원)/g, '')
        .replace(/품절|재고\s*\d+개|남은수량\s*\d+개/g, '')
        .trim();
      name = name.replace(/^(선택|옵션|색상|컬러|사이즈|종류)\s*/i, '').trim();
      if (!name || name.length < 2 || name.length > 100 || byName.has(name)) {
        return;
      }
      byName.set(name, {
        name,
        price: priceMatch ? normalize(priceMatch[1].replace(/\s+/g, '')) : basePrice,
        salePrice: priceMatch ? normalize(priceMatch[1].replace(/\s+/g, '')) : basePrice,
        stockText,
        stockStatus: stockText === '품절' ? 'out_of_stock' : stockText ? 'in_stock' : '',
        image: ''
      });
    });

    // Fallback for option lists rendered as plain visible text.
    if (!byName.size) {
      const nodes = Array.from(document.querySelectorAll('li, button, a, span, div'));
      nodes.forEach((node) => {
        const text = normalize(node.textContent || '');
        if (!text || text.length > 140 || !/(A타입|B타입|C타입|옵션|종류|품절|[+-]\s*\d[\d,]*\s*원)/.test(text)) {
          return;
        }
        if (/장바구니|구매하기|찜하기|공유|리뷰|문의|배송|판매자|로그인|네이버/.test(text)) {
          return;
        }
        const priceMatch = text.match(/([+-]\s*\d[\d,]*\s*원|\d[\d,]*\s*원)/);
        const name = text.replace(/([+-]\s*\d[\d,]*\s*원|\d[\d,]*\s*원)/g, '').replace(/품절/g, '').trim();
        if (!name || name.length < 2 || name.length > 100 || byName.has(name)) {
          return;
        }
        byName.set(name, {
          name,
          price: priceMatch ? normalize(priceMatch[1].replace(/\s+/g, '')) : basePrice,
          salePrice: priceMatch ? normalize(priceMatch[1].replace(/\s+/g, '')) : basePrice,
          stockText: /품절/.test(text) ? '품절' : '',
          stockStatus: /품절/.test(text) ? 'out_of_stock' : '',
          image: ''
        });
      });
    }

    return Array.from(byName.values()).slice(0, 120);
  }

  function extractNaverSmartstoreMeta() {
    return {
      storeName: extractNaverSmartstoreStoreName(),
      productId: extractNaverSmartstoreProductId(),
      basePrice: extractNaverSmartstorePrice()
    };
  }

  function extractOnch3Field(label) {
    const nodes = Array.from(document.querySelectorAll('.prod_detail_ul li, .prod_detail_info li, body li'));
    for (const node of nodes) {
      const titleNode = node.querySelector && node.querySelector('.prod_detail_title');
      const title = normalize(titleNode && titleNode.textContent);
      if (title !== label) {
        continue;
      }
      const clone = node.cloneNode(true);
      clone.querySelectorAll('.prod_detail_title, button, input, script, style').forEach((child) => child.remove());
      return normalize(clone.textContent);
    }
    return '';
  }

  function extractOnch3Title() {
    const productNode = document.querySelector('.product_nm');
    if (productNode) {
      const directText = Array.from(productNode.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => normalize(node.textContent))
        .filter(Boolean)
        .join(' ');
      if (directText) {
        return directText;
      }
    }
    return extractOnch3Field('제품명') || normalize(document.title).replace(/\s*-\s*온채널\s*$/i, '');
  }

  function extractCafe24ProductNo() {
    return new URLSearchParams(location.search).get('product_no') || '';
  }

  function extractCafe24Title() {
    const candidates = [
      document.querySelector('meta[property="og:title"]'),
      document.querySelector('.headingArea h2'),
      document.querySelector('.detailArea h2'),
      document.querySelector('.infoArea h2'),
      document.querySelector('h1'),
      document.querySelector('h2')
    ];
    for (const node of candidates) {
      const value = normalize(node && (node.content || node.textContent));
      if (value) {
        return value.replace(/\s*-\s*페인트샵\s*$/i, '').trim();
      }
    }
    return normalize(document.title).replace(/\s*-\s*페인트샵\s*$/i, '').trim();
  }

  function parseCafe24Won(value) {
    const match = String(value || '').replace(/,/g, '').match(/([+-])?\s*(\d+)\s*원/);
    if (!match) {
      return null;
    }
    const amount = Number(match[2]);
    return match[1] === '-' ? -amount : amount;
  }

  function formatCafe24Won(amount) {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
      return '';
    }
    return `${Number(amount).toLocaleString('ko-KR')}원`;
  }

  function extractCafe24BasePriceAmount() {
    const scopedNodes = Array.from(document.querySelectorAll('.xans-product-detaildesign li, .infoArea tr, .infoArea li, .detailArea li, .infoArea'));
    for (const node of scopedNodes) {
      const text = normalize(node && node.textContent);
      if (!text || !/(회원가|판매가|할인가|price|가격)/i.test(text)) {
        continue;
      }
      const amount = parseCafe24Won(text);
      if (amount !== null) {
        return amount;
      }
    }

    const bodyText = normalize(document.body && document.body.innerText);
    const memberMatch = bodyText.match(/회원가\s*([\d,]+원)/);
    if (memberMatch) {
      return parseCafe24Won(memberMatch[1]);
    }

    const scriptText = Array.from(document.scripts).map((node) => node.src || node.textContent || '').join('\n');
    const saleMatch = scriptText.match(/[?&]prd_sale_price=(\d+)/) || scriptText.match(/prd_sale_price\s*[=:]\s*['"]?(\d+)/);
    if (saleMatch) {
      return Number(saleMatch[1]);
    }
    return null;
  }

  function extractCafe24OriginalPriceAmount() {
    const scriptText = Array.from(document.scripts).map((node) => node.src || node.textContent || '').join('\n');
    const match = scriptText.match(/[?&]prd_price=(\d+)/) || scriptText.match(/prd_price\s*[=:]\s*['"]?(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function extractCafe24Shipping() {
    const text = normalize(document.body && document.body.innerText);
    const match = text.match(/배송비\s*([\d,]+원(?:\s*\([^)]*\))?)/);
    return match ? match[1] : '';
  }

  function extractCafe24PurchaseUnit() {
    const text = normalize(document.body && document.body.innerText);
    const match = text.match(/구매\s*단위\s*([\d,]+개)/);
    return match ? match[1] : '';
  }

  function findCafe24CurrentOptionSelect() {
    return document.querySelector('.xans-product-detail select[name="option1"]')
      || document.querySelector('.detailArea select[name="option1"]')
      || document.querySelector('select[name="option1"]')
      || document.querySelector('select[id^="product_option_id"]');
  }

  function cleanCafe24OptionName(text) {
    return normalize(String(text || '')
      .replace(/\(\s*[+-]?[\d,]+원\s*\)/g, '')
      .replace(/\[\s*품절\s*\]/g, '')
      .trim());
  }

  function extractCafe24Options() {
    const select = findCafe24CurrentOptionSelect();
    if (!select) {
      return [];
    }
    const basePrice = extractCafe24BasePriceAmount();
    const originalPrice = extractCafe24OriginalPriceAmount();
    return Array.from(select.options).map((option) => {
      const rawText = normalize(option.textContent || '');
      if (!rawText || /^[-*\s]+$/.test(rawText) || /옵션을 선택|옵션선택|선택해 주세요/i.test(rawText)) {
        return null;
      }
      const addPrice = parseCafe24Won(rawText.match(/\(([+-]?\s*[\d,]+원)\)/)?.[1] || '0원') || 0;
      const saleAmount = basePrice === null ? null : basePrice + addPrice;
      const soldOut = option.disabled || /품절|sold\s*out/i.test(rawText);
      return {
        name: cleanCafe24OptionName(rawText),
        rawName: rawText,
        optionValue: option.value || '',
        salePrice: formatCafe24Won(saleAmount),
        originalPrice: originalPrice ? formatCafe24Won(originalPrice + addPrice) : '',
        addPrice: addPrice ? formatCafe24Won(addPrice) : '',
        stockStatus: soldOut ? 'out_of_stock' : '',
        stockText: soldOut ? '품절' : ''
      };
    }).filter(Boolean);
  }

  function extractCafe24MainImages() {
    const urls = new Set();
    const push = (value) => {
      const src = toAbsoluteUrl(value || '');
      if (!src) return;
      if (/txt_product_zoom|icon|logo|header|footer|btn_|loading|naver/i.test(src)) return;
      if (/\/web\/product\/(big|small|medium)\//i.test(src) || /\/web\/product\/image\//i.test(src)) {
        urls.add(src);
      }
    };
    push(document.querySelector('meta[property="og:image"]')?.content || '');
    document.querySelectorAll('.xans-product-image.imgArea img, .imgArea .keyImg img, .imgArea .listImg img, .info_thumb img').forEach((img) => {
      push(img.currentSrc || img.src || img.getAttribute('ec-data-src') || img.getAttribute('data-src') || img.getAttribute('src'));
    });
    return Array.from(urls);
  }

  function isCafe24AnnouncementImage(img, src) {
    if (/logo|icon|footer|header|arrow|review|board|btn_|loading|banner|txt_|naver/i.test(src)) {
      return true;
    }
    if (/\/web\/upload\/NNEditor\/20260114\//i.test(src)) {
      return true;
    }
    if (img.closest('.detail_banner, .morenvy-banner, .xans-board-fixed, .detail_board, .review, .relation, .xans-product-relation')) {
      return true;
    }
    return false;
  }

  function extractCafe24DetailImages() {
    const urls = new Set();
    const roots = Array.from(document.querySelectorAll('#prdDetail .cont, #prdDetail, .xans-product-additional #prdDetail, .productDetail'));
    const scopedRoots = roots.length ? roots : [];
    scopedRoots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => {
        const src = toAbsoluteUrl(img.currentSrc || img.src || img.getAttribute('ec-data-src') || img.getAttribute('data-src') || img.getAttribute('src') || '');
        if (!src) return;
        if (isCafe24AnnouncementImage(img, src)) return;
        if (/\/web\/upload\/NNEditor\//i.test(src)) {
          urls.add(src);
        }
      });
    });
    return Array.from(urls);
  }

  function extractCafe24Meta() {
    return {
      productNo: extractCafe24ProductNo(),
      basePrice: formatCafe24Won(extractCafe24BasePriceAmount()),
      originalPrice: formatCafe24Won(extractCafe24OriginalPriceAmount()),
      purchaseUnit: extractCafe24PurchaseUnit(),
      vat: /VAT\s*별도/i.test(document.body && document.body.innerText || '') ? 'VAT 별도' : ''
    };
  }

  function extractTitle() {
    if (SITE === '1688') {
      return extract1688Title(get1688RootData());
    }
    if (SITE === 'tmall-shop') {
      return extractTmallShopTitle();
    }
    if (SITE === 'zhaojiafang') {
      return extractZhaojiafangTitle(getZhaojiafangGoodsInfo());
    }
    if (SITE === 'onch3') {
      return extractOnch3Title();
    }
    if (SITE === 'pinduoduo') {
      return extractPddTitle(getPddCapturedPayload());
    }
    if (SITE === 'temu') {
      return extractTemuTitle(getTemuCapturedPayload());
    }
    if (SITE === 'naver-smartstore') {
      return extractNaverSmartstoreTitle();
    }
    if (SITE === 'cafe24') {
      return extractCafe24Title();
    }
    if (SITE === 'taobao') {
      const candidates = [
        document.querySelector('h1')
      ];
      for (const node of candidates) {
        const value = normalize(node && node.textContent);
        if (value && value !== document.title && !value.includes('tmall.com')) {
          return value.replace(/-tmall\.com.*$/i, '');
        }
      }
      return normalize(document.title)
        .replace(/-tmall\.com.*$/i, '')
        .replace(/-淘宝网.*$/i, '')
        .replace(/-天猫.*$/i, '');
    }

    const candidates = [
      document.querySelector('h1'),
      document.querySelector('[class*="prod-buy-header"] h1'),
      document.querySelector('[class*="ProductHeader"] h1')
    ];
    for (const node of candidates) {
      const value = normalize(node && node.textContent);
      if (value) {
        return value;
      }
    }
    return '';
  }

  function extractTaobaoVideoUrl() {
    const urls = [];
    const pushVideoUrl = (value) => {
      const url = normalizeUrl(value || '');
      if (!url || !/\.(?:mp4|m3u8)(?:\?|$)|cloudvideo|cloud\.video|video/i.test(url)) {
        return;
      }
      if (!urls.includes(url)) {
        urls.push(url);
      }
    };

    document.querySelectorAll('video, source').forEach((node) => {
      pushVideoUrl(node.currentSrc || node.src || node.getAttribute('src'));
    });

    const script = getTaobaoInitScript();
    const item = extractBalancedJsonByKey(script, 'item') || {};
    const headImageVO = extractBalancedJsonByKey(script, 'headImageVO') || {};
    [item.videos, headImageVO.videos].forEach((videos) => {
      if (!Array.isArray(videos)) {
        return;
      }
      videos.forEach((video) => {
        pushVideoUrl(video && (video.url || video.videoUrl || video.video_url || video.playUrl || video.src));
      });
    });

    const videoMatch = script.match(/https?:\/\/[^"'\\]+(?:\.mp4|\.m3u8)[^"'\\]*/i);
    if (videoMatch) {
      pushVideoUrl(videoMatch[0]);
    }

    return urls[0] || '';
  }

  function normalizeTaobaoShippingFee(value) {
    const text = normalize(value);
    if (!text) {
      return '';
    }
    if (/卖家承担运费|包邮|免运费|免费/.test(text) && !/[¥￥]\s*\d/.test(text)) {
      return '¥0.00';
    }
    const match = text.match(/[¥￥]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return `¥${match[1]}`;
    }
    const labeledMatch = text.match(/(?:运费|邮费|快递)[:：]?\s*(\d+(?:\.\d+)?)/);
    if (labeledMatch) {
      return `¥${labeledMatch[1]}`;
    }
    return '';
  }

  function extractTaobaoShipping() {
    const script = getTaobaoInitScript();
    const overseas = extractBalancedJsonByKey(script, 'overseasLogisticsVO') || {};
    const deliveryList = overseas.data && Array.isArray(overseas.data.deliveryList) ? overseas.data.deliveryList : [];
    if (deliveryList.length) {
      const item = deliveryList[0] || {};
      const fee = normalizeTaobaoShippingFee(item.mainlandLogisticsPrice);
      if (fee) {
        return fee;
      }
    }

    const pcBuyParams = extractBalancedJsonByKey(script, 'pcBuyParams') || {};
    const pcFee = normalizeTaobaoShippingFee(pcBuyParams.who_pay_ship);
    if (pcFee) {
      return pcFee;
    }

    const text = normalize(document.body && document.body.innerText);
    const overseasMatch = text.match(/中国段物流\s*([¥￥]\s*\d+(?:\.\d+)?\s*(?:免费|包邮)?)/);
    if (overseasMatch) {
      return normalizeTaobaoShippingFee(overseasMatch[1]);
    }
    const expressMatch = text.match(/快递[:：]\s*[^\s]+|运费[:：]\s*[^\s]+|邮费[:：]\s*[^\s]+|包邮|免运费|卖家承担运费/);
    return expressMatch ? normalizeTaobaoShippingFee(expressMatch[0]) || normalize(expressMatch[0]) : '';
  }

  function normalize1688ShippingFee(value) {
    const text = normalize(value);
    if (!text) {
      return '';
    }
    const match = text.match(/(?:¥|￥|RMB)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:元|块)?/i);
    if (!match) {
      return '';
    }
    const amount = Number(String(match[1]).replace(/,/g, ''));
    return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : '';
  }

  function extract1688Shipping() {
    const bodyText = normalize(document.body && document.body.innerText);
    if (!bodyText) {
      return '';
    }
    // 1688 renders this as ordinary Chinese text in the delivery block, not
    // as the `配送费` field used by the other collectors.
    const labeledMatch = bodyText.match(/(?:运费|邮费|快递费|物流费|配送费)\s*[:：]?\s*((?:¥|￥|RMB)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:元|块)?)/i);
    if (labeledMatch) {
      return normalize1688ShippingFee(labeledMatch[1]);
    }
    const inlineMatch = bodyText.match(/(?:运费|邮费|快递费|物流费|配送费)[^\n]{0,12}?((?:¥|￥|RMB)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:元|块))/i);
    return inlineMatch ? normalize1688ShippingFee(inlineMatch[1]) : '';
  }

  function extractShipping() {
    if (SITE === 'coupang') {
      const structured = getCoupangStructuredProduct();
      const shippingRate = structured && structured.offers && structured.offers.shippingDetails && structured.offers.shippingDetails.shippingRate;
      if (shippingRate && String(shippingRate.value) === '0') {
        return '무료배송';
      }
    }
    if (SITE === 'onch3') {
      return extractOnch3Field('택배비/택배사');
    }
    if (SITE === 'naver-smartstore') {
      return extractNaverSmartstoreShipping();
    }
    if (SITE === 'cafe24') {
      return extractCafe24Shipping();
    }
    if (SITE === 'taobao') {
      return extractTaobaoShipping();
    }
    if (SITE === '1688') {
      return extract1688Shipping();
    }

    const scopedTexts = [];
    const titleNode = document.querySelector('h1');
    if (titleNode) {
      let parent = titleNode.parentElement;
      for (let i = 0; i < 4 && parent; i += 1, parent = parent.parentElement) {
        scopedTexts.push(normalize(parent.innerText));
      }
    }
    scopedTexts.push(normalize(document.body.innerText));

    for (const text of scopedTexts) {
      const match = text.match(/배송비\s*([\d,]+원)/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  function getCoupangDecodedPageText() {
    let text = Array.from(document.scripts).map((node) => node.textContent || '').join('\n');
    for (let i = 0; i < 5; i += 1) {
      text = text
        .replace(/\\u003c/g, '<')
        .replace(/\\u003e/g, '>')
        .replace(/\\u0026/g, '&')
        .replace(/\\u002F/g, '/')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n');
    }
    return text;
  }

  function extractBalancedFromText(text, key, opener, closer) {
    const source = String(text || '');
    const keyIndex = source.indexOf(key);
    if (keyIndex < 0) {
      return null;
    }
    const start = source.indexOf(opener, keyIndex);
    if (start < 0) {
      return null;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === opener) {
        depth += 1;
      } else if (ch === closer) {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  function parseCoupangJsonBlock(key, opener, closer, fallback) {
    const text = getCoupangDecodedPageText();
    const block = extractBalancedFromText(text, key, opener, closer);
    if (!block) {
      return fallback;
    }
    try {
      return JSON.parse(block);
    } catch (error) {
      console.warn(`[Product AI Capture] Coupang ${key} parse failed`, error);
      return fallback;
    }
  }

  function normalizeCoupangImageUrl(value) {
    const url = normalizeUrl(value || '');
    if (!url) {
      return '';
    }
    return url.replace(/\/thumbnails\/remote\/[^/]+\/image\//, '/image/');
  }

  function getCoupangStructuredProduct() {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((node) => {
        try {
          return JSON.parse(node.textContent || '');
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .find((item) => item && item['@type'] === 'Product') || null;
  }

  function extractCoupangBrand() {
    const structured = getCoupangStructuredProduct();
    const structuredBrand = structured && structured.brand;
    const brandName = normalize(typeof structuredBrand === 'string' ? structuredBrand : structuredBrand && structuredBrand.name || '');
    if (brandName) {
      return brandName;
    }
    const brandNode = document.querySelector('a.brand-info')
      || Array.from(document.querySelectorAll('.product-buy-header a, .prod-atf-contents a, [class*=brand]')).find((node) => {
        const text = normalize(node.textContent || '');
        return text && text.length <= 60 && !/판매자|브랜드샵|구경/.test(text);
      });
    return normalize(brandNode && brandNode.textContent || '');
  }

  function extractCoupangProductIdFromUrl(url) {
    const value = String(url || location.href);
    const match = value.match(/\/vp\/products\/(\d+)/);
    return match ? match[1] : '';
  }

  function extractCoupangMeta() {
    const params = new URLSearchParams(location.search);
    return {
      productId: extractCoupangProductIdFromUrl(location.href),
      itemId: params.get('itemId') || '',
      vendorItemId: params.get('vendorItemId') || '',
      vendorId: params.get('vendorId') || ''
    };
  }

  function extractOpenWingStats() {
    if (SITE !== 'coupang') {
      return null;
    }
    const overlay = document.querySelector('#cp-pv-sales-overlay');
    if (!overlay) {
      return null;
    }
    const rawText = normalize(overlay.innerText || overlay.textContent || '');
    const stats = {
      source: 'openwing_front',
      status: rawText || '',
      pvLast28Day: '',
      salesLast28d: '',
      cvr: '',
      serviceFeeRatio: ''
    };
    Array.from(overlay.querySelectorAll('.cps-metric')).forEach((node) => {
      const labelNode = node.querySelector('b');
      const label = normalize(labelNode && labelNode.textContent || '').toLowerCase();
      const value = normalize((node.textContent || '').replace(labelNode && labelNode.textContent || '', ''));
      if (!label || !value) {
        return;
      }
      if (label === 'pv') {
        stats.pvLast28Day = value;
      } else if (label === 'sales') {
        stats.salesLast28d = value;
      } else if (label === 'cvr') {
        stats.cvr = value;
      } else if (label === 'comm') {
        stats.serviceFeeRatio = value;
      }
    });
    return stats;
  }

  function normalizeCoupangProductUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const productId = extractCoupangProductIdFromUrl(parsed.href);
      if (!productId) {
        return parsed.href;
      }
      const params = new URLSearchParams();
      ['itemId', 'vendorItemId', 'vendorId', 'storeId', 'sourceType', 'subSourceType'].forEach((key) => {
        const value = parsed.searchParams.get(key);
        if (value) {
          params.set(key, value);
        }
      });
      return `https://www.coupang.com/vp/products/${productId}${params.toString() ? `?${params.toString()}` : ''}`;
    } catch (error) {
      return url || '';
    }
  }

  function extractCoupangShopMeta() {
    const sellerName = normalize(Array.from(document.querySelectorAll('h1, h2, strong, [class*=seller], [class*=store]'))
      .map((node) => normalize(node.textContent || ''))
      .find((text) => text && /회사|스토어|샵|판매자|ROYALBELLE|품수/.test(text)) || '');
    const vendorId = (location.pathname.match(/\/([A-Z]\d+)/) || [])[1] || new URLSearchParams(location.search).get('vendorId') || '';
    return {
      vendorId,
      sellerName,
      visibleProductCount: extractCoupangShopProductLinks().length,
      crawledProductCount: state.coupangShopCrawledProducts.length,
      crawlErrorCount: state.coupangShopCrawlErrors.length,
      captureSource: 'shop_visible_links_then_product_pages'
    };
  }

  function extractCoupangShopProductLinks() {
    const byProductId = new Map();
    Array.from(document.querySelectorAll('a[href*="/vp/products/"]')).forEach((anchor) => {
      const href = normalizeCoupangProductUrl(anchor.href || anchor.getAttribute('href') || '');
      const productId = extractCoupangProductIdFromUrl(href);
      if (!productId || byProductId.has(productId)) {
        return;
      }
      let node = anchor;
      let container = anchor;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const text = normalize(node.innerText || node.textContent || '');
        if (text.length > normalize(container.innerText || container.textContent || '').length && text.length < 1400) {
          container = node;
        }
      }
      const lines = (container.innerText || anchor.innerText || '').split(/\n+/).map(normalize).filter(Boolean);
      const imageNode = container.querySelector('img[src*="coupangcdn"], img') || anchor.querySelector('img');
      byProductId.set(productId, {
        productId,
        url: href,
        sourceType: (() => {
          try { return new URL(href).searchParams.get('sourceType') || ''; } catch (error) { return ''; }
        })(),
        cardTitle: lines.find((line) => line && !/^(?:무료배송|PV|Sales|CVR|OpenWing|类目|Comm|\(?\d+\)?|\d[\d,]*원|\d+%)$/.test(line)) || '',
        cardPrice: lines.find((line) => /^[0-9][0-9,]*원$/.test(line)) || '',
        cardImage: normalizeCoupangImageUrl(imageNode && (imageNode.currentSrc || imageNode.src || imageNode.getAttribute('data-src') || ''))
      });
    });
    return Array.from(byProductId.values());
  }

  function summarizeCoupangProductCapture(capture) {
    const productId = (capture && capture.coupangMeta && capture.coupangMeta.productId)
      || extractCoupangProductIdFromUrl(capture && capture.source && capture.source.url || '');
    return {
      productId,
      title: capture && capture.title || '',
      brand: capture && capture.brand || '',
      shipping: capture && capture.shipping || '',
      url: capture && capture.source && capture.source.url || '',
      product: capture && capture.jsonData && capture.jsonData.product || {},
      options: capture && capture.jsonData && Array.isArray(capture.jsonData.options) ? capture.jsonData.options : [],
      mainImages: capture && Array.isArray(capture.mainImages) ? capture.mainImages : [],
      detailImages: capture && Array.isArray(capture.detailImages) ? capture.detailImages : []
    };
  }

  function mergeCoupangShopCrawledProducts(products) {
    const byProductId = new Map(state.coupangShopCrawledProducts.map((item) => [item.productId, item]));
    (products || []).forEach((capture) => {
      const summary = summarizeCoupangProductCapture(capture);
      if (summary.productId) {
        byProductId.set(summary.productId, summary);
      }
    });
    state.coupangShopCrawledProducts = Array.from(byProductId.values());
  }

  function extractCoupangNextData() {
    const optionRows = parseCoupangJsonBlock('"optionRows"', '[', ']', []);
    const attributeVendorItemMap = parseCoupangJsonBlock('"attributeVendorItemMap"', '{', '}', {});
    return {
      optionRows: Array.isArray(optionRows) ? optionRows : [],
      attributeVendorItemMap: attributeVendorItemMap && typeof attributeVendorItemMap === 'object' && !Array.isArray(attributeVendorItemMap) ? attributeVendorItemMap : {}
    };
  }

  function extractCoupangNextOptions() {
    const data = extractCoupangNextData();
    if (!data.optionRows.length || !Object.keys(data.attributeVendorItemMap).length) {
      return [];
    }
    const attrById = new Map();
    data.optionRows.forEach((row) => {
      (row.attributes || []).forEach((attribute) => {
        attrById.set(String(attribute.valueId || ''), {
          rowName: normalize(row.name || ''),
          rowTypeId: String(row.typeId || ''),
          colorAttribute: Boolean(row.colorAttribute),
          sizeAttribute: Boolean(row.sizeAttribute),
          name: normalize(attribute.name || ''),
          image: normalizeCoupangImageUrl(attribute.image && (attribute.image.origin || attribute.image.detailImage || attribute.image.thumbnailImage || attribute.image.preloadImage) || '')
        });
      });
    });

    return Object.entries(data.attributeVendorItemMap).map(([key, value]) => {
      const ids = key.split(':').map((item) => String(item || ''));
      const parts = ids.map((id) => attrById.get(id)).filter(Boolean);
      const color = parts.find((part) => part.colorAttribute || /색상|컬러|color/i.test(part.rowName)) || null;
      const size = parts.find((part) => part.sizeAttribute || /사이즈|size/i.test(part.rowName)) || null;
      const namedParts = parts.map((part) => part.name).filter(Boolean);
      const addToCartUrl = value && value.apiUrlMap && value.apiUrlMap.addToCartUrl || '';
      const priceMatch = String(addToCartUrl).match(/[?&]price=(\d+)/);
      const imageCandidates = [];
      if (color && color.image) {
        imageCandidates.push(color.image);
      }
      (value && Array.isArray(value.images) ? value.images : []).forEach((image) => {
        imageCandidates.push(normalizeCoupangImageUrl(image && (image.origin || image.detailImage || image.thumbnailImage || image.preloadImage) || ''));
      });
      const skuImage = uniqueList(imageCandidates)[0] || '';
      return {
        name: namedParts.join(' / ') || key,
        color: color ? color.name : '',
        size: size ? size.name : '',
        itemId: value && value.itemId ? String(value.itemId) : '',
        vendorItemId: value && value.vendorItemId ? String(value.vendorItemId) : '',
        price: priceMatch ? `${Number(priceMatch[1]).toLocaleString('ko-KR')}원` : extractCoupangCurrentPrice(),
        stockStatus: value && value.soldOut ? 'sold_out' : 'in_stock',
        stockText: value && value.soldOut ? '품절' : '재고있음',
        image: skuImage,
        rawText: key
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function extractCoupangMainImages() {
    const urls = [];
    const structured = getCoupangStructuredProduct();
    const structuredImages = structured && Array.isArray(structured.image) ? structured.image : [];
    structuredImages.forEach((url) => urls.push(normalizeCoupangImageUrl(url)));

    const data = extractCoupangNextData();
    data.optionRows.forEach((row) => {
      (row.attributes || []).forEach((attribute) => {
        urls.push(normalizeCoupangImageUrl(attribute.image && (attribute.image.origin || attribute.image.detailImage || attribute.image.thumbnailImage || attribute.image.preloadImage) || ''));
      });
    });
    Object.values(data.attributeVendorItemMap || {}).forEach((value) => {
      (value && Array.isArray(value.images) ? value.images : []).forEach((image) => {
        urls.push(normalizeCoupangImageUrl(image && (image.origin || image.detailImage || image.thumbnailImage || image.preloadImage) || ''));
      });
    });

    return uniqueList(urls).filter((url) => /coupangcdn\.com\/image\/vendor_inventory/i.test(url));
  }

  function extractOptionBlocks() {
    const blocks = new Set();
    const textCandidates = [normalize(document.body.innerText)];

    document.querySelectorAll('body *').forEach((node) => {
      const text = normalize(node.innerText);
      if (!text) {
        return;
      }
      if (text.includes('판매자배송') && /\d[\d,]*원/.test(text)) {
        textCandidates.push(text);
      }
    });

    textCandidates.forEach((text) => {
      if (!text) {
        return;
      }
      const matches = text.match(/([A-Za-z가-힣]+-[A-Z])\s*\d[\d,]*원/g);
      if (matches && matches.length >= 2) {
        blocks.add(text);
      }
    });

    return Array.from(blocks);
  }

  function extractCoupangCurrentPrice() {
    const bodyText = normalize(document.body && document.body.innerText);
    const title = extractTitle();
    const titleIndex = title ? bodyText.indexOf(title) : -1;
    const headText = titleIndex >= 0 ? bodyText.slice(titleIndex + title.length, titleIndex + title.length + 700) : bodyText.slice(0, 1200);
    const priceArea = headText.split(/(?:배송비|무료배송|가격\s*history|价格历史|도착\s*예정|판매자:)/i)[0] || headText;
    const prices = Array.from(priceArea.matchAll(/\d[\d,]*원/g)).map((match) => normalize(match[0]));
    return prices.length ? prices[prices.length - 1] : '';
  }

  function addCoupangOption(byName, name, payload) {
    const cleanName = normalize(name)
      .replace(/^(?:색상|옵션|종류|타입)\s*/, '')
      .replace(/^(?:선택|请选择|옵션선택)\s*/, '')
      .replace(/\s*(?:선택|옵션 선택)\s*$/g, '')
      .trim();
    if (!cleanName || cleanName.length > 80) {
      return;
    }
    if (/^(?:색상|옵션|종류|선택|Y|N|-)$/.test(cleanName)) {
      return;
    }
    if (!byName.has(cleanName)) {
      byName.set(cleanName, {
        name: cleanName,
        price: payload && payload.price ? payload.price : '',
        note: payload && payload.note ? payload.note : '',
        stockText: payload && payload.stockText ? payload.stockText : ''
      });
    }
  }

  function extractCoupangPickerOptions(byName) {
    const currentPrice = extractCoupangCurrentPrice();
    const pickerRoots = Array.from(document.querySelectorAll('.prod-atf-contents .option-picker-container'))
      .filter((node) => node && node.getBoundingClientRect && node.getBoundingClientRect().width);

    pickerRoots.forEach((node) => {
      const rawText = node.innerText || node.textContent || '';
      const lines = rawText.split(/\n+/).map(normalize).filter(Boolean);
      let values = lines.slice(1);

      if (!values.length) {
        const compact = normalize(rawText);
        values = [compact.replace(/^(?:색상|옵션|종류|타입)\s*/, '')];
      }

      values.forEach((value) => {
        const cleaned = normalize(value.replace(/^(?:색상|옵션|종류|타입)\s*/, '').replace(/^선택\s*/, ''));
        addCoupangOption(byName, cleaned, {
          price: currentPrice,
          note: 'current_selected_option'
        });
      });
    });
  }

  function extractCoupangDetailDescriptionOptions(byName) {
    const bodyText = normalize(document.body && document.body.innerText);
    const markerIndex = bodyText.indexOf('옵션 설명');
    if (markerIndex < 0) {
      return;
    }

    const currentPrice = extractCoupangCurrentPrice();
    const section = bodyText
      .slice(markerIndex + '옵션 설명'.length, markerIndex + 2500)
      .split(/(?:대표 이미지|상품정보 더보기|상품상세|상품평|상품 문의|배송\/교환\/반품|다른 고객|이런 상품)/)[0];

    const tokens = section
      .split(/\s+/)
      .map((item) => normalize(item.replace(/[,:;|]+$/g, '')))
      .filter(Boolean);

    tokens.forEach((token) => {
      if (/^[A-Z]$/.test(token) || /^\d{1,2}$/.test(token) || /^[가-힣A-Za-z][가-힣A-Za-z0-9._-]{1,30}$/.test(token)) {
        addCoupangOption(byName, token, {
          price: currentPrice,
          note: 'from_option_description'
        });
      }
    });
  }

  function extractCoupangQuantitySummaryOptions(byName) {
    const rawText = document.body && document.body.innerText ? document.body.innerText : '';
    const lines = rawText.split(/\n+/).map(normalize).filter(Boolean);
    const headerIndex = lines.findIndex((line) => /색상\s*[×xX]\s*수량|옵션\s*[×xX]\s*수량|종류\s*[×xX]\s*수량/.test(line));
    const currentPrice = extractCoupangCurrentPrice();

    if (headerIndex >= 0) {
      for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 80); i += 1) {
        const line = lines[i];
        if (/^(?:모든 옵션 보기|무료배송|배송비|도착 예정|판매자:|적립|수량빼기|장바구니|바로구매)/.test(line)) {
          break;
        }
        const match = line.match(/^\d+\.\s*(.+?)\s*[×xX]\s*\d+개(?:\s+(\d[\d,]*원))?/);
        if (match) {
          addCoupangOption(byName, match[1], {
            price: normalize(match[2] || currentPrice),
            note: 'from_quantity_summary'
          });
        }
      }
      return;
    }

    const bodyText = normalize(rawText);
    const compactHeader = bodyText.match(/(?:색상|옵션|종류)\s*[×xX]\s*수량\s+([^]*?)(?:모든 옵션 보기|무료배송|배송비|도착 예정|판매자:|적립|수량빼기|장바구니|바로구매)/);
    const section = compactHeader && compactHeader[1] ? compactHeader[1] : '';
    if (!section) {
      return;
    }

    const rowPattern = /\d+\.\s*([^]*?)\s*[×xX]\s*\d+개(?:\s+(\d[\d,]*원))?(?=\s+\d+\.\s|$)/g;
    let match;
    while ((match = rowPattern.exec(section)) !== null) {
      addCoupangOption(byName, match[1], {
        price: normalize(match[2] || currentPrice),
        note: 'from_quantity_summary'
      });
    }
  }

  function extractCoupangInlineChoiceOptions(byName) {
    const rawText = document.body && document.body.innerText ? document.body.innerText : '';
    const lines = rawText.split(/\n+/).map(normalize).filter(Boolean);
    const startIndex = lines.findIndex((line) => /^(?:색상|옵션|종류|타입)\s*[:：]/.test(line));
    if (startIndex < 0) {
      return;
    }

    const currentPrice = extractCoupangCurrentPrice();
    for (let i = startIndex; i < Math.min(lines.length, startIndex + 80); i += 1) {
      let line = lines[i];
      if (/^(?:적립|최대 \d|쿠팡캐시|수량빼기|수량더하기|장바구니|바로구매|쿠팡상품번호|상품정보|무료배송|배송비|도착 예정|판매자:|색상계열|필수 표기 정보)/.test(line)) {
        break;
      }
      line = line.replace(/^(?:색상|옵션|종류|타입)\s*[:：]\s*/, '');
      if (!line || /^(?:선택|전체|마이쿠팡|장바구니)$/.test(line)) {
        continue;
      }
      if (/\d[\d,]*원/.test(line) && !/[A-Za-z가-힣][A-Za-z가-힣0-9 ._\-[\]]{1,}/.test(line)) {
        continue;
      }
      addCoupangOption(byName, line, {
        price: currentPrice,
        note: 'from_inline_choice_list'
      });
    }
  }

  function extractOptions() {
    const nextOptions = extractCoupangNextOptions();
    if (nextOptions.length) {
      return nextOptions;
    }
    const byName = new Map();
    const blocks = extractOptionBlocks();

    for (const block of blocks) {
      OPTION_PATTERN.lastIndex = 0;
      let match;
      while ((match = OPTION_PATTERN.exec(block)) !== null) {
        const name = normalize(match[1]);
        const price = normalize(match[2]);
        const rest = normalize(match[3]);
        if (!name || !price) {
          continue;
        }
        if (!byName.has(name)) {
          byName.set(name, {
            name,
            price,
            note: rest.includes('품절임박') ? rest.match(/품절임박 \([^)]*\)/)?.[0] || '' : '',
            stockText: rest.match(/품절임박 \([^)]*\)|재고[^ ]*|품절|매진/)?.[0] || ''
          });
        }
      }
    }

    extractCoupangPickerOptions(byName);
    extractCoupangDetailDescriptionOptions(byName);
    extractCoupangQuantitySummaryOptions(byName);
    extractCoupangInlineChoiceOptions(byName);

    return Array.from(byName.values()).sort((a, b) => optionSortKey(a.name).localeCompare(optionSortKey(b.name), 'ko'));
  }

  function normalizeCoupangOptionDimensions(options) {
    return (options || []).map((option) => {
      if (option.color || option.size) {
        return option;
      }
      const parts = String(option.name || '').split(/\s*\/\s*|\s*[×xX]\s*/).map(normalize).filter(Boolean);
      return {
        ...option,
        color: parts[0] || '',
        size: parts[1] || ''
      };
    });
  }


  function findOnch3OptionButton() {
    return document.querySelector('.detail_option_show')
      || Array.from(document.querySelectorAll('button, a, input[type=button]')).find((node) => /옵션별\s*보기/.test(normalize(node.value || node.textContent || node.getAttribute('title') || '')));
  }

  function expandOnch3OptionPanel() {
    if (SITE !== 'onch3') {
      return;
    }
    const optionBox = document.querySelector('.detail_page_option');
    const hasRows = optionBox && Array.from(optionBox.querySelectorAll('ul li')).some((li) => /\d[\d,]*(?:원)?\s*$/.test(normalize(li.textContent)));
    if (hasRows) {
      return;
    }
    const button = findOnch3OptionButton();
    if (button) {
      button.click();
    }
  }

  function formatOnch3Won(value) {
    const text = normalize(value);
    if (!text || text === '자율') {
      return text;
    }
    return /원$/.test(text) ? text : `${text}원`;
  }

  function parseOnch3OptionLine(text) {
    const value = normalize(text);
    if (!value || /옵션명|판매자 승인|상품승인|상품 판매 시|최종준수가 를 확인/.test(value)) {
      return null;
    }

    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) {
      return null;
    }

    const sellerToken = tokens.pop();
    const complianceToken = tokens.pop();
    if (!/^[\d,]+원?$/.test(sellerToken || '') || !/^(자율|[\d,]+원?)$/.test(complianceToken || '')) {
      return null;
    }

    const status = tokens.some((token) => /단종|품절|중지/.test(token)) ? 'discontinued' : '';
    const nameTokens = tokens.filter((token) => !/^\(?(?:단종|품절|중지)\)?$/.test(token));
    let stockQuantity = '';
    if (nameTokens.length > 1 && /^\d+$/.test(nameTokens[nameTokens.length - 1])) {
      stockQuantity = nameTokens.pop();
    }

    const name = normalize(nameTokens.join(' '));
    const sellerPrice = formatOnch3Won(sellerToken);
    const compliancePrice = formatOnch3Won(complianceToken);
    if (!name || !sellerPrice) {
      return null;
    }

    return {
      name,
      compliancePrice,
      sellerPrice,
      price: sellerPrice,
      stockQuantity,
      stockText: stockQuantity ? `${stockQuantity}` : '',
      status,
      rawText: value
    };
  }

  function extractOnch3Options() {
    const optionBox = document.querySelector('.detail_page_option');
    if (!optionBox) {
      return [];
    }
    const rows = Array.from(optionBox.querySelectorAll('ul li, tbody tr, .detail_page_name'));
    const byName = new Map();
    rows
      .map((row) => parseOnch3OptionLine(row.textContent))
      .filter(Boolean)
      .forEach((option) => {
        const key = `${option.name}|${option.sellerPrice}|${option.compliancePrice}`;
        if (!byName.has(key)) {
          byName.set(key, option);
        }
      });
    return Array.from(byName.values());
  }

  function hasOnch3LockedOptions() {
    const optionBox = document.querySelector('.detail_page_option');
    return Boolean(optionBox && /판매자 승인|상품승인/.test(optionBox.textContent || ''));
  }

  function extractOnch3MainImages() {
    const urls = new Set();
    document.querySelectorAll('.prod_detail_img img, .prod_detail_imgbox img').forEach((img) => {
      const src = normalizeUrl(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '');
      if (src && !/no_img|footer_logo|icon_/i.test(src)) {
        urls.add(src);
      }
    });
    return Array.from(urls);
  }

  function extractOnch3DetailImages() {
    const urls = new Set();
    const scopedRoots = Array.from(document.querySelectorAll('.gosi_wrap .content_section'));
    const roots = scopedRoots.length ? scopedRoots : [];

    roots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => {
        if (img.closest('.prod_gosi')) {
          return;
        }
        const src = normalizeUrl(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '');
        if (!src) {
          return;
        }
        if (/footer_logo|onch_new_logo|icon_|no_img|bar\.png|product_img_thumbnail|sns_logo|avatar/i.test(src)) {
          return;
        }
        urls.add(src);
      });
    });

    return Array.from(urls);
  }

  function extractDetailImages() {
    if (SITE === 'onch3') {
      return extractOnch3DetailImages();
    }
    if (SITE === 'cafe24') {
      return extractCafe24DetailImages();
    }
    if (SITE === 'taobao') {
      const urls = new Set();
      const pushDetailUrl = (value) => {
        const src = cleanTaobaoImageUrl(value || '');
        if (!src) {
          return;
        }
        const isAliDetail = /img\.alicdn\.com\/imgextra/i.test(src);
        const isNoise = /rate|avatar|sns_logo|tps-|picasso|q\d+|760x760q30|userheader|bao\/uploaded/i.test(src);
        if (isAliDetail && !isNoise) {
          urls.add(src);
        }
      };

      document.querySelectorAll('img').forEach((img) => {
        [
          img.currentSrc,
          img.src,
          img.getAttribute('src'),
          img.getAttribute('data-src'),
          img.getAttribute('data-ks-lazyload'),
          img.getAttribute('data-original'),
          img.getAttribute('data-lazyload')
        ].forEach(pushDetailUrl);
      });

      document.querySelectorAll('[style], [data-src], [data-ks-lazyload], [data-original], [data-lazyload], [data-img]').forEach((node) => {
        ['data-src', 'data-ks-lazyload', 'data-original', 'data-lazyload', 'data-img'].forEach((attr) => {
          pushDetailUrl(node.getAttribute && node.getAttribute(attr));
        });
        pushDetailUrl(extractUrlFromCssImage(node.getAttribute && node.getAttribute('style')));
        try {
          pushDetailUrl(extractUrlFromCssImage(window.getComputedStyle(node).backgroundImage));
        } catch (error) {
          // Ignore computed style edge cases.
        }
      });

      const html = document.documentElement.innerHTML || '';
      const urlPattern = /(?:https?:)?\/\/img\.alicdn\.com\/imgextra\/[^"'\\<>)\s]+/gi;
      let match;
      while ((match = urlPattern.exec(html)) !== null) {
        pushDetailUrl(match[0].replace(/\\u002F/g, '/'));
      }

      return Array.from(urls);
    }

    const selectors = [
      '.vendor-item img',
      '[class*="vendor-item"] img',
      '[id*="productDetail"] img',
      '[class*="product-detail"] img'
    ];
    const urls = new Set();

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((img) => {
        const src = img.currentSrc || img.src || '';
        if (!src) {
          return;
        }
        if (src.includes('vendor_inventory') || src.includes('coupangcdn.com')) {
          urls.add(src);
        }
      });
    });

    return Array.from(urls);
  }

  function extractTaobaoMainImages() {
    const urls = new Set();
    const pushMainImage = (value, img) => {
      const src = cleanTaobaoImageUrl(value || '');
      if (!src) {
        return;
      }
      if (!/alicdn\.com|tbcdn\.cn/i.test(src)) {
        return;
      }
      if (/shopIcon|avatar|sns_logo|userheader|rate|comment|tps-|footer|logo|toolbar|ap-sbi|coupang-capture/i.test(src)) {
        return;
      }
      if (img && (img.closest(`#${ROOT_ID}`) || img.closest('.shopHeader, [class*=shopHeader], [class*=Comment], [class*=askAnswer], .tb-footer, #tb-toolkit-new'))) {
        return;
      }
      urls.add(src);
    };

    // 淘宝新版主图/副图优先来自商品图集区域。不要全页面泛扫，
    // 否则会把店铺头像、评价图、页脚认证图误当成 Main Images。
    const galleryRoots = Array.from(document.querySelectorAll('#picGalleryEle, [class*=picGallery], [class*=thumbnailsWrap], [class*=mainPicWrap]'));
    galleryRoots.forEach((rootNode) => {
      rootNode.querySelectorAll('img').forEach((img) => {
        pushMainImage(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload'), img);
      });
    });

    if (urls.size) {
      return Array.from(urls).slice(0, 8);
    }

    // 旧版/异常页面兜底：仍然只接受大尺寸且位于商品图片区附近的图片。
    Array.from(document.querySelectorAll('img')).forEach((img) => {
      const rect = img.getBoundingClientRect && img.getBoundingClientRect();
      const area = rect ? rect.width * rect.height : 0;
      if (area < 2500 && Math.max(img.naturalWidth || 0, img.naturalHeight || 0) < 400) {
        return;
      }
      if (!img.closest('[class*=imgArea], [class*=picGallery], [class*=mainPic], [class*=thumbnail], #J_UlThumb')) {
        return;
      }
      pushMainImage(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload'), img);
    });

    return Array.from(urls).slice(0, 8);
  }

  function extractTaobaoCurrentPrice() {
    const text = document.body.innerText || '';
    const salePatterns = [
      /店铺优惠后\s*￥\s*([\d.]+)/,
      /券后\s*￥\s*([\d.]+)/,
      /到手价\s*￥\s*([\d.]+)/,
      /促销价\s*￥\s*([\d.]+)/,
      /￥\s*([\d.]+)/
    ];
    let salePrice = '';
    for (const pattern of salePatterns) {
      const match = text.match(pattern);
      if (match) {
        salePrice = match[1];
        break;
      }
    }
    const originalMatch = text.match(/优惠前\s*￥\s*([\d.]+)/);
    return {
      salePrice,
      originalPrice: originalMatch ? originalMatch[1] : ''
    };
  }

  function extractTaobaoCurrentStock() {
    const text = normalize(document.body.innerText || '');
    const quantityPatterns = [
      /库存\s*([\d,]+)\s*件/,
      /剩余\s*([\d,]+)\s*件/,
      /仅剩\s*([\d,]+)\s*件/,
      /还剩\s*([\d,]+)\s*件/,
      /可售\s*([\d,]+)\s*件/
    ];

    for (const pattern of quantityPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          stockQuantity: match[1].replace(/,/g, ''),
          stockStatus: 'in_stock',
          stockText: match[0]
        };
      }
    }

    const soldOutMatch = text.match(/(已售罄|售罄|无货|缺货|卖光了|暂时缺货)/);
    if (soldOutMatch) {
      return {
        stockQuantity: '',
        stockStatus: 'out_of_stock',
        stockText: soldOutMatch[1]
      };
    }

    const inStockMatch = text.match(/(有货|现货|库存紧张|少量库存)/);
    if (inStockMatch) {
      return {
        stockQuantity: '',
        stockStatus: 'in_stock',
        stockText: inStockMatch[1]
      };
    }

    return {
      stockQuantity: '',
      stockStatus: '',
      stockText: ''
    };
  }

  function extractTaobaoRootCatId() {
    const script = getTaobaoInitScript();
    const pcBuyParams = extractBalancedJsonByKey(script, 'pcBuyParams') || {};
    if (pcBuyParams.rootCatId) {
      return String(pcBuyParams.rootCatId || '');
    }
    const match = script.match(/"rootCatId"\s*:\s*"?(\d+)"?/);
    return match ? match[1] : '';
  }

  function isTaobaoDigitalAccessoryProduct() {
    if (SITE !== 'taobao') {
      return false;
    }
    const title = extractTitle();
    const bodyText = normalize(document.body && document.body.innerText);
    const rootCatId = extractTaobaoRootCatId();
    const haystack = `${title} ${bodyText.slice(0, 5000)}`;
    const hasDigitalAccessorySignals = /手机壳|保护套|手机套|镜头膜|钢化膜|平板壳|耳机壳|适用手机机型|适用手机型号|保护套质地|Samsung\/三星|iPhone|Galaxy|华为|Pura|Fold|Flip/i.test(haystack);
    return hasDigitalAccessorySignals && (rootCatId === '50008090' || /手机壳|保护套|手机套|适用手机机型|适用手机型号|保护套质地/i.test(haystack));
  }

  function getListingConstraintProfileResult(profile, source) {
    const config = LISTING_CONSTRAINT_PROFILES[profile];
    if (!config) {
      return null;
    }
    return {
      key: profile,
      label: config.label,
      source: source || 'manual',
      productType: config.productType,
      titleRule: config.titleRule,
      attributeSplit: config.attributeSplit,
      swatchRule: config.swatchRule,
      pricingRule: config.pricingRule,
      imageRule: config.imageRule
    };
  }

  function detectListingConstraintProfile() {
    if (SITE === 'coupang') {
      return 'coupang_color_swatch';
    }
    if (isTaobaoDigitalAccessoryProduct()) {
      return 'digital_accessory';
    }
    return '';
  }

  function extractListingConstraints() {
    if (SITE !== 'taobao' && SITE !== 'coupang') {
      return null;
    }
    const selectedProfile = state.listingConstraintProfile || 'auto';
    if (selectedProfile === 'none') {
      return null;
    }
    if (selectedProfile !== 'auto') {
      return getListingConstraintProfileResult(selectedProfile, 'manual');
    }
    const detectedProfile = detectListingConstraintProfile();
    return detectedProfile ? getListingConstraintProfileResult(detectedProfile, 'auto') : null;
  }



  function cleanTaobaoOptionName(text) {
    return normalize(text)
      .replace(/^颜色分类\s*/, '')
      .replace(/^切换大图模式\s*/, '')
      .replace(/\s*(万人加购|店长主推)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }


  function isTaobaoSizeName(text) {
    const value = normalize(text).toUpperCase();
    return /^(?:XXS|XS|S|M|L|XL|2XL|3XL|4XL|5XL|6XL|7XL|8XL|均码|均碼|FREE|ONE SIZE|ONE-SIZE)$/.test(value);
  }

  function normalizeTaobaoSizeName(text) {
    const value = normalize(text);
    if (/^均碼$/.test(value)) {
      return '均码';
    }
    if (/^one[-\s]?size$/i.test(value)) {
      return 'ONE SIZE';
    }
    return /^[a-z]+$/i.test(value) ? value.toUpperCase() : value;
  }

  function extractTaobaoVisibleSizes() {
    const byName = new Map();
    const nodes = Array.from(document.querySelectorAll('button, li, span, div, a'));
    nodes.forEach((node) => {
      const text = normalizeTaobaoSizeName(cleanTaobaoOptionName(node.innerText || node.textContent || ''));
      if (!isTaobaoSizeName(text)) {
        return;
      }
      const rect = node.getBoundingClientRect && node.getBoundingClientRect();
      if (rect && (rect.width === 0 || rect.height === 0)) {
        return;
      }
      const classText = `${node.className || ''} ${node.getAttribute && (node.getAttribute('aria-disabled') || '')} ${node.getAttribute && (node.getAttribute('disabled') || '')}`;
      const disabled = /disabled|disable|sold|out|无货|缺货|售罄|true/i.test(classText);
      if (!byName.has(text)) {
        byName.set(text, {
          name: text,
          stockStatus: disabled ? 'out_of_stock' : '',
          stockText: disabled ? '不可选/缺货' : ''
        });
      }
    });

    const preferredOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '均码', 'FREE', 'ONE SIZE'];
    return Array.from(byName.values()).sort((a, b) => {
      const ia = preferredOrder.indexOf(a.name);
      const ib = preferredOrder.indexOf(b.name);
      if (ia >= 0 || ib >= 0) {
        return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }


  function getTaobaoInitScript() {
    return Array.from(document.scripts)
      .map((node) => node.textContent || '')
      .find((text) => text.includes('skuBase') && text.includes('skuCore')) || '';
  }

  function cleanTaobaoPriceValue(value) {
    const text = normalize(String(value || '')).replace(/[￥¥,]/g, '');
    const match = text.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : '';
  }

  function extractTaobaoGlobalPrice(script, skuCore) {
    const visiblePriceCandidates = [];
    const skuPriceCandidates = [];
    const fallbackPriceCandidates = [];
    const pushPrice = (bucket, value) => {
      const price = cleanTaobaoPriceValue(value);
      if (price) {
        bucket.push(price);
      }
    };

    // 淘宝/Tmall 的 priceVO 有时是搜索埋点价、起价或券前/券后混合价，
    // 当前页前台可见价格更接近操作员看到的真实采购价，因此优先使用。
    const currentPrice = extractTaobaoCurrentPrice();
    pushPrice(visiblePriceCandidates, currentPrice.salePrice);

    const sku2info = skuCore && skuCore.sku2info ? skuCore.sku2info : {};
    Object.keys(sku2info).forEach((key) => {
      const info = sku2info[key] || {};
      if (info.price && info.price.priceText) {
        pushPrice(skuPriceCandidates, info.price.priceText);
      }
    });

    const priceVO = extractBalancedJsonByKey(script, 'priceVO') || {};
    if (priceVO.price) {
      pushPrice(fallbackPriceCandidates, priceVO.price.priceText || priceVO.price.extraText || priceVO.price.priceMoney);
    }
    if (Array.isArray(priceVO.extraPrices)) {
      priceVO.extraPrices.forEach((item) => pushPrice(fallbackPriceCandidates, item && (item.priceText || item.extraText)));
    }

    return visiblePriceCandidates[0] || skuPriceCandidates[0] || fallbackPriceCandidates[0] || '';
  }

  function parseTaobaoPropPath(propPath) {
    const map = new Map();
    String(propPath || '').split(';').forEach((part) => {
      const [pid, vid] = part.split(':');
      if (pid && vid) {
        map.set(pid, vid);
      }
    });
    return map;
  }

  function extractTaobaoInitialData() {
    const script = getTaobaoInitScript();
    if (!script) {
      return { options: [], sizes: [], skuMatrix: [], meta: { captureSource: 'dom-click-fallback' } };
    }

    const skuBase = extractBalancedJsonByKey(script, 'skuBase') || {};
    const skuCore = extractBalancedJsonByKey(script, 'skuCore') || {};
    const props = Array.isArray(skuBase.props) ? skuBase.props : [];
    const skus = Array.isArray(skuBase.skus) ? skuBase.skus : [];
    const sku2info = skuCore && skuCore.sku2info ? skuCore.sku2info : {};
    const globalSalePrice = extractTaobaoGlobalPrice(script, skuCore);
    const currentPrice = extractTaobaoCurrentPrice();

    const colorProp = props.find((prop) => String(prop && prop.hasImage) === 'true')
      || props.find((prop) => Array.isArray(prop && prop.values) && prop.values.some((value) => value && value.image))
      || props.find((prop) => /颜色|颜色分类|款式|分类/i.test(String(prop && prop.name || '')))
      || props[0];
    const sizeProp = props.find((prop) => /尺码|尺寸|大小|码数|size/i.test(String(prop && prop.name || '')))
      || props.find((prop) => prop !== colorProp);

    const propValueMaps = new Map();
    props.forEach((prop) => {
      const values = new Map();
      (prop.values || []).forEach((value) => {
        values.set(String(value.vid || ''), {
          pid: String(prop.pid || ''),
          vid: String(value.vid || ''),
          name: normalizeTaobaoSizeName(cleanTaobaoOptionName(value.name || value.text || '')),
          image: cleanTaobaoImageUrl(value.image || '')
        });
      });
      propValueMaps.set(String(prop.pid || ''), values);
    });

    const colorValues = colorProp && Array.isArray(colorProp.values) ? colorProp.values : [];
    const sizeValues = sizeProp && Array.isArray(sizeProp.values) ? sizeProp.values : [];
    const sizes = sizeValues.map((value) => ({
      name: normalizeTaobaoSizeName(cleanTaobaoOptionName(value.name || value.text || '')),
      optionCode: `${sizeProp.pid}:${value.vid}`,
      pid: String(sizeProp.pid || ''),
      vid: String(value.vid || '')
    })).filter((item) => item.name);

    const skuMatrix = skus.map((sku) => {
      const propPath = String(sku.propPath || '');
      const pathMap = parseTaobaoPropPath(propPath);
      const colorPid = colorProp ? String(colorProp.pid || '') : '';
      const sizePid = sizeProp ? String(sizeProp.pid || '') : '';
      const color = colorPid && propValueMaps.get(colorPid) ? propValueMaps.get(colorPid).get(pathMap.get(colorPid)) : null;
      const size = sizePid && propValueMaps.get(sizePid) ? propValueMaps.get(sizePid).get(pathMap.get(sizePid)) : null;
      const info = sku2info[String(sku.skuId || '')] || {};
      const priceInfo = info.price || {};
      const stockQuantity = info.quantity === undefined || info.quantity === null ? '' : info.quantity;
      const stockText = info.quantityText || (Number(stockQuantity) === 0 ? '无货' : stockQuantity !== '' ? '有货' : '');
      return {
        name: [color && color.name, size && size.name].filter(Boolean).join(' / '),
        color: color && color.name || '',
        size: size && size.name || '',
        skuId: String(sku.skuId || ''),
        propPath,
        colorOptionCode: color ? `${color.pid}:${color.vid}` : '',
        sizeOptionCode: size ? `${size.pid}:${size.vid}` : '',
        salePrice: cleanTaobaoPriceValue(priceInfo.priceText || priceInfo.extraText) || globalSalePrice,
        originalPrice: currentPrice.originalPrice || '',
        stockQuantity,
        stockText,
        stockStatus: /无货|售罄|缺货/.test(stockText) || Number(stockQuantity) === 0 ? 'out_of_stock' : stockText ? 'in_stock' : '',
        image: color && color.image || ''
      };
    }).filter((item) => item.skuId || item.name);

    const matrixByColor = new Map();
    skuMatrix.forEach((item) => {
      if (item.color && !matrixByColor.has(item.color)) {
        matrixByColor.set(item.color, item);
      }
    });

    const options = colorValues.map((value) => {
      const name = cleanTaobaoOptionName(value.name || value.text || '');
      const image = cleanTaobaoImageUrl(value.image || '');
      const matrixItem = matrixByColor.get(name) || {};
      return {
        name,
        salePrice: matrixItem.salePrice || globalSalePrice,
        originalPrice: currentPrice.originalPrice || '',
        stockQuantity: '',
        stockStatus: '',
        stockText: '',
        image,
        optionCode: colorProp ? `${colorProp.pid}:${value.vid}` : '',
        pid: colorProp ? String(colorProp.pid || '') : '',
        vid: String(value.vid || ''),
        source: 'skuBase'
      };
    }).filter((item) => item.name);

    return {
      options,
      sizes,
      skuMatrix,
      meta: {
        captureSource: 'skuBase/skuCore',
        propCount: props.length,
        skuCount: skuMatrix.length,
        colorPropName: colorProp && colorProp.name || '',
        colorPid: colorProp && colorProp.pid || '',
        sizePropName: sizeProp && sizeProp.name || '',
        sizePid: sizeProp && sizeProp.pid || ''
      }
    };
  }

  function mergeTaobaoClickedOptions(initialOptions) {
    const byName = new Map((initialOptions || []).map((option) => [option.name, { ...option }]));
    Array.from(state.taobaoCollectedSkus.values()).forEach((clicked) => {
      const existing = byName.get(clicked.name) || {};
      byName.set(clicked.name, {
        ...existing,
        ...clicked,
        image: clicked.image || existing.image || findTaobaoSkuImageByName(clicked.name) || '',
        salePrice: clicked.salePrice || existing.salePrice || '',
        source: existing.source ? `${existing.source}+clicked` : 'clicked',
        confirmed: true
      });
    });
    return Array.from(byName.values());
  }

  function getTaobaoSelectedOptions() {
    return Array.from(state.taobaoCollectedSkus.values()).map((option) => ({
      ...option,
      image: option.image || findTaobaoSkuImageByName(option.name) || '',
      source: option.source || 'clicked',
      confirmed: true
    }));
  }

  function isTaobaoMatrixMode(data) {
    return SITE === 'taobao' && ((data && data.taobaoMode) || state.taobaoCaptureMode) === 'matrix';
  }

  function saveTaobaoCaptureMode(mode) {
    try {
      localStorage.setItem(TAOBAO_MODE_STORAGE_KEY, mode === 'selected' ? 'selected' : 'matrix');
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function findTaobaoSkuOptionFromClick(target) {
    let node = target instanceof Element ? target : target && target.parentElement;
    const initial = extractTaobaoInitialData();
    const knownNames = new Set();
    (initial.options || []).forEach((item) => knownNames.add(cleanTaobaoOptionName(item.name || '')));
    (initial.sizes || []).forEach((item) => knownNames.add(cleanTaobaoOptionName(item.name || '')));
    (initial.skuMatrix || []).forEach((item) => {
      knownNames.add(cleanTaobaoOptionName(item.color || ''));
      knownNames.add(cleanTaobaoOptionName(item.size || ''));
    });
    const isProductGallery = (candidate) => Boolean(candidate && candidate.closest && candidate.closest(
      '[class*="gallery"], [class*="Gallery"], [class*="booth"], [class*="Booth"], '
      + '[class*="mainPic"], [class*="main-pic"], '
      + '[class*="detail-image"], [class*="detailImage"], [data-gallery], [data-role="main-image"]'
    ));
    for (let depth = 0; depth < 7 && node; depth += 1, node = node.parentElement) {
      if (isProductGallery(node)) {
        // 点击主图/副图不能被解释成“点击了 SKU”。只有真正位于规格控件
        // 内、且标签能和初始化 SKU/尺码对应时，才继续采集。
        return null;
      }
      const text = cleanTaobaoOptionName(node.innerText || node.textContent || '');
      const normalizedSize = normalizeTaobaoSizeName(text);
      const img = node.querySelector && node.querySelector('img');
      if (!text || text.length > 180) {
        continue;
      }
      if (/颜色分类|数量|领券购买|收藏|信用卡支付|切换大图模式/.test(text)) {
        continue;
      }
      const labels = [
        node.getAttribute && node.getAttribute('title'),
        node.getAttribute && node.getAttribute('aria-label'),
        node.getAttribute && node.getAttribute('data-value-name'),
        node.getAttribute && node.getAttribute('data-name'),
        text
      ].map((value) => cleanTaobaoOptionName(value || '')).filter(Boolean);
      const knownLabel = labels.find((label) => Array.from(knownNames).some((name) => name && (label === name || label.includes(name) || name.includes(label))));
      const hasSkuMarker = Boolean(node.matches && node.matches('[data-value-id], [data-vid], [data-pid], [data-value-name], [data-name]'))
        || /sku|prop|sale-prop|spec|规格|颜色分类|尺码/i.test(String(node.className || ''));
      if (knownNames.size && !knownLabel && !hasSkuMarker) {
        continue;
      }
      const image = extractImageUrlFromElement(node) || cleanTaobaoImageUrl(img && (img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src')));
      if (!image && !isTaobaoSizeName(normalizedSize) && !/[【】\[\]（）()]/.test(text)) {
        continue;
      }
      return { name: isTaobaoSizeName(normalizedSize) ? normalizedSize : text, image };
    }
    return null;
  }

  function buildTaobaoSkuRowsFromClick(option, price, stock) {
    const image = option.image || findTaobaoSkuImageByName(option.name) || '';
    if (image) {
      state.taobaoLastImageOption = { name: option.name, image };
      return [{ name: option.name, image, size: '' }];
    }

    // 尺码点击只用于触发页面价格/库存刷新；不把颜色 × 尺码展开成 SKU 行。
    // 淘宝前台本身就是“颜色分类 + 尺码”两组规格，AI 输出也保持这种结构。
    if (isTaobaoSizeName(option.name)) {
      return [];
    }

    return [{ name: option.name, image: '', size: '' }];
  }

  function extractTaobaoCurrentSkuIdFromPerformance() {
    const params = new URLSearchParams(location.search);
    const directSkuId = params.get('skuId');
    if (directSkuId && /^\d{8,16}$/.test(directSkuId)) {
      return directSkuId;
    }
    const currentItemId = params.get('id') || '';
    try {
      const entries = performance.getEntriesByType('resource')
        .map((entry) => entry && entry.name || '')
        .filter((url) => /mtop\.taobao\.pcdetail\.data\.adjust|skuClick|skuId/i.test(url))
        .reverse();
      for (const url of entries) {
        const parsed = new URL(url, location.href);
        const dataParam = parsed.searchParams.get('data') || '';
        const decodedData = decodeURIComponent(dataParam);
        const rawMatch = decodedData.match(/"skuId"\s*:\s*"(\d{8,16})"/) || decodedData.match(/skuId["']?\s*[:=]\s*["']?(\d{8,16})/);
        if (!rawMatch) {
          continue;
        }
        if (currentItemId && decodedData.includes(`"id":"${currentItemId}"`) === false && decodedData.includes(`id=${currentItemId}`) === false) {
          continue;
        }
        return rawMatch[1];
      }
    } catch (error) {}
    return '';
  }

  function rememberTaobaoClickedSku(option) {
    if (!option || !option.name) {
      return;
    }
    const price = extractTaobaoCurrentPrice();
    const stock = extractTaobaoCurrentStock();
    const skuId = extractTaobaoCurrentSkuIdFromPerformance();
    if (!price.salePrice) {
      return;
    }
    const rows = buildTaobaoSkuRowsFromClick(option, price, stock);
    rows.forEach((row) => {
      state.taobaoCollectedSkus.set(row.name, {
        name: row.name,
        size: '',
        salePrice: price.salePrice,
        originalPrice: price.originalPrice,
        stockQuantity: stock.stockQuantity,
        stockStatus: stock.stockStatus,
        stockText: stock.stockText,
        image: row.image || '',
        skuId
      });
    });
    if (state.taobaoCaptureMode === 'selected') {
      refreshData();
    } else {
      setStatus(`已记录到“选择采集”模式：${rows.map((row) => row.name).join('、')}`, 'is-success');
    }
  }

  function bindTaobaoSkuClickCapture() {
    if (SITE !== 'taobao') {
      return;
    }
    document.addEventListener('click', (event) => {
      const option = findTaobaoSkuOptionFromClick(event.target);
      if (!option) {
        return;
      }
      setTimeout(() => rememberTaobaoClickedSku(option), 350);
      setTimeout(() => rememberTaobaoClickedSku(option), 1100);
    }, true);
  }

  function formatOptionLine(option) {
    if (SITE === 'onch3') {
      const statusPart = option.status ? ` — 状态：${option.status}` : '';
      return `${option.name} — 최종준수가: ${option.compliancePrice || ''} — 판매사가: ${option.sellerPrice || option.price || ''}${statusPart}`;
    }
    if (SITE === 'taobao') {
      const stockPart = option.stockText ? ` — 库存：${option.stockText}` : '';
      const skuPart = option.skuId ? ` — sku_id: ${option.skuId}` : '';
      return `${option.name} — ￥${option.salePrice}${stockPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === 'naver-smartstore') {
      const stockPart = option.stockText ? ` — 库存：${option.stockText}` : '';
      const statusPart = option.stockStatus ? ` — 状态：${option.stockStatus}` : '';
      return `${option.name} — ${option.price || option.salePrice || ''}${stockPart}${statusPart}`;
    }
    if (SITE === 'cafe24') {
      const addPart = option.addPrice ? ` — 加价：${option.addPrice}` : '';
      const statusPart = option.stockText ? ` — ${option.stockText}` : '';
      return `${option.name} — ${option.salePrice || option.price || ''}${addPart}${option.optionValue ? ` — option_value: ${option.optionValue}` : ''}${statusPart}`;
    }
    if (SITE === 'shopify') {
      const skuPart = option.skuId ? ` — variant_id: ${option.skuId}` : '';
      const statusPart = option.stockText ? ` — ${option.stockText}` : '';
      return `${option.name} — ${option.salePrice || option.price || ''}${statusPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === '1688') {
      const stockPart = option.stockQuantity || option.stockQuantity === 0 ? ` — 库存：${option.stockQuantity}` : '';
      const skuPart = option.skuId ? ` — sku_id: ${option.skuId}` : '';
      return `${option.name} — ${option.salePrice || ''}${stockPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === 'tmall-shop') {
      const pricePart = option.price ? ` — ${option.price}` : '';
      const sourcePart = option.source ? ` — 来源：${String(option.source || '').split(':')[0]}` : '';
      return `${option.itemId || ''} — ${option.name || ''}${pricePart}${option.image ? ` — ${option.image}` : ''}${sourcePart}`;
    }
    if (SITE === 'temu') {
      const stockPart = option.stockQuantity ? ` — 库存：${option.stockQuantity}` : '';
      const statusPart = option.stockStatus ? ` — 状态：${option.stockStatus}` : '';
      const skuPart = option.skuId ? ` — sku_id: ${option.skuId}` : '';
      return `${option.name || option.skuId} — ${option.salePrice || ''}${stockPart}${statusPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === 'pinduoduo') {
      const stockPart = option.stockQuantity ? ` — 库存：${option.stockQuantity}` : '';
      const statusPart = option.stockStatus ? ` — 状态：${option.stockStatus}` : '';
      const skuPart = option.skuId ? ` — sku_id: ${option.skuId}` : '';
      return `${option.name || option.skuId} — ${option.salePrice || ''}${stockPart}${statusPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === 'zhaojiafang') {
      const stockPart = option.stockQuantity || option.stockQuantity === 0 ? ` — 库存：${option.stockQuantity}` : '';
      const statusPart = option.stockStatus ? ` — 状态：${option.stockStatus}` : '';
      const weightPart = option.weight ? ` — 重量：${option.weight}` : '';
      const skuPart = option.skuId ? ` — sku_id: ${option.skuId}` : '';
      return `${option.name} — ${option.price || normalizeCny(option.salePrice)}${stockPart}${statusPart}${weightPart}${skuPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    if (SITE === 'coupang') {
      const idPart = option.itemId ? ` — item_id: ${option.itemId}` : '';
      const vendorPart = option.vendorItemId ? ` — vendor_item_id: ${option.vendorItemId}` : '';
      const stockPart = option.stockText ? ` — ${option.stockText}` : '';
      return `${option.name} — ${option.price || ''}${stockPart}${idPart}${vendorPart}${option.image ? ` — ${option.image}` : ''}`;
    }
    return `${option.name} — ${option.price}`;
  }

  function buildCoupangShopMarkdown(data) {
    const meta = data.coupangShopMeta || {};
    const crawledById = new Map((state.coupangShopCrawledProducts || []).map((item) => [item.productId, item]));
    const products = (data.coupangShopProducts || []).map((item) => ({ ...item, crawled: crawledById.get(item.productId) || null }));
    const lines = [];
    lines.push('# AI_PRODUCT_CAPTURE_V1');
    lines.push('');
    lines.push('## Source');
    lines.push('- platform: coupang_shop');
    lines.push(`- url: ${data.source.url}`);
    lines.push(`- captured_at: ${data.source.capturedAt}`);
    lines.push('- capture_source: shop_visible_links_then_product_pages');
    lines.push('');
    lines.push('## Shop');
    lines.push(`- seller_name: ${meta.sellerName || data.title || ''}`);
    lines.push(`- vendor_id: ${meta.vendorId || ''}`);
    lines.push(`- visible_product_count: ${products.length}`);
    lines.push(`- crawled_product_count: ${state.coupangShopCrawledProducts.length}`);
    if (state.coupangShopCrawlErrors.length) {
      lines.push(`- crawl_error_count: ${state.coupangShopCrawlErrors.length}`);
    }
    lines.push('');
    lines.push('## Products');
    if (!products.length) {
      lines.push('- none_collected');
    }
    products.forEach((item, index) => {
      const crawled = item.crawled;
      const product = crawled && crawled.product || {};
      lines.push(`${index + 1}. product_id: ${item.productId}`);
      lines.push(`   - status: ${crawled ? 'product_page_crawled' : 'visible_link_only'}`);
      if (product.item_id || item.itemId) {
        lines.push(`   - item_id: ${product.item_id || item.itemId || ''}`);
      }
      if (product.vendor_item_id || item.vendorItemId) {
        lines.push(`   - vendor_item_id: ${product.vendor_item_id || item.vendorItemId || ''}`);
      }
      if (product.vendor_id || meta.vendorId) {
        lines.push(`   - vendor_id: ${product.vendor_id || meta.vendorId || ''}`);
      }
      lines.push(`   - title: ${crawled && crawled.title || item.cardTitle || ''}`);
      if (crawled && crawled.brand) {
        lines.push(`   - brand: ${crawled.brand}`);
      }
      if (crawled && crawled.shipping) {
        lines.push(`   - shipping: ${crawled.shipping}`);
      }
      if (item.cardPrice) {
        lines.push(`   - card_price: ${item.cardPrice}`);
      }
      lines.push(`   - option_count: ${crawled ? crawled.options.length : 0}`);
      lines.push(`   - main_image_count: ${crawled ? crawled.mainImages.length : (item.cardImage ? 1 : 0)}`);
      lines.push(`   - detail_image_count: ${crawled ? crawled.detailImages.length : 0}`);
      if (crawled && crawled.mainImages[0]) {
        lines.push(`   - first_main_image: ${crawled.mainImages[0]}`);
      } else if (item.cardImage) {
        lines.push(`   - card_image: ${item.cardImage}`);
      }
      lines.push(`   - url: ${crawled && crawled.url || item.url || ''}`);
    });
    lines.push('');
    lines.push('## Product Page Data By product_id');
    if (!state.coupangShopCrawledProducts.length) {
      lines.push('- none_crawled_yet');
    }
    state.coupangShopCrawledProducts.forEach((item) => {
      lines.push(`- ${item.productId}:`);
      lines.push(`  - title: ${item.title || ''}`);
      lines.push(`  - options: ${item.options.length}`);
      lines.push(`  - main_images: ${item.mainImages.length}`);
      lines.push(`  - detail_images: ${item.detailImages.length}`);
      if (item.url) {
        lines.push(`  - url: ${item.url}`);
      }
    });
    lines.push('');
    lines.push('## Collector Notes');
    lines.push('- Coupang shop pages are used only as product URL indexes. Trusted product data is saved by product_id after opening each product page and running the normal Coupang product collector.');
    lines.push('- Current output contains visible shop links plus any product pages already crawled by the button.');
    return lines.join('\n');
  }

  function buildText(data) {
    if (SITE === '1688-shop') {
      return build1688ShopMarkdown(data);
    }
    if (SITE === 'coupang-shop') {
      return buildCoupangShopMarkdown(data);
    }
    const lines = [];
    lines.push('标题');
    lines.push('');
    lines.push(data.title || '');
    lines.push('');
    lines.push(`来源：${data.source.platform}`);
    lines.push(`链接：${data.source.url}`);
    lines.push(`采集时间：${data.source.capturedAt}`);
    if (SITE === 'tmall-shop' && data.tmallShopMeta) {
      lines.push(`已截获商品数：${data.tmallShopMeta.itemCount || 0}`);
      if (data.tmallShopMeta.captureSource) {
        lines.push(`采集来源：${data.tmallShopMeta.captureSource}`);
      }
    }
    if (SITE === 'tmall-shop' && data.tmallShopMeta) {
      lines.push(`- captured_item_count: ${data.tmallShopMeta.itemCount || 0}`);
      if (data.tmallShopMeta.captureSource) {
        lines.push(`- capture_source: ${data.tmallShopMeta.captureSource}`);
      }
    }
    if (SITE === 'naver-smartstore' && data.naverSmartstoreMeta) {
      lines.push(`스토어：${data.naverSmartstoreMeta.storeName || ''}`);
      lines.push(`상품ID：${data.naverSmartstoreMeta.productId || ''}`);
      if (data.naverSmartstoreMeta.basePrice) {
        lines.push(`기본가격：${data.naverSmartstoreMeta.basePrice}`);
      }
    }
    if (SITE === 'tmall-shop' && data.tmallShopMeta) {
      lines.push(`已截获商品数：${data.tmallShopMeta.itemCount || 0}`);
      if (data.tmallShopMeta.captureSource) {
        lines.push(`采集来源：${data.tmallShopMeta.captureSource}`);
      }
    }
    if (SITE === 'naver-smartstore' && data.naverSmartstoreMeta) {
      lines.push(`- store_name: ${data.naverSmartstoreMeta.storeName || ''}`);
      lines.push(`- product_id: ${data.naverSmartstoreMeta.productId || ''}`);
      if (data.naverSmartstoreMeta.basePrice) {
        lines.push(`- base_price: ${data.naverSmartstoreMeta.basePrice}`);
      }
    }
    if (SITE === 'temu' && data.temuMeta) {
      lines.push(`商品ID：${data.temuMeta.goodsId || ''}`);
      if (data.temuMeta.spuId) {
        lines.push(`SPU：${data.temuMeta.spuId}`);
      }
      if (data.temuMeta.specGalleryId) {
        lines.push(`spec_gallery_id：${data.temuMeta.specGalleryId}`);
      }
      if (data.temuMeta.captureSource) {
        lines.push(`采集来源：${data.temuMeta.captureSource}`);
      }
    }
    if (SITE === 'pinduoduo' && data.pddMeta) {
      lines.push(`商品ID：${data.pddMeta.goodsId || ''}`);
      if (data.pddMeta.spuId) {
        lines.push(`SPU：${data.pddMeta.spuId}`);
      }
      if (data.pddMeta.captureSource) {
        lines.push(`采集来源：${data.pddMeta.captureSource}`);
      }
    }
    if (SITE === 'zhaojiafang') {
      lines.push(`SPU：${data.zhaojiafangMeta && data.zhaojiafangMeta.spuId ? data.zhaojiafangMeta.spuId : ''}`);
      lines.push(`当前SKU：${data.zhaojiafangMeta && data.zhaojiafangMeta.currentSkuId ? data.zhaojiafangMeta.currentSkuId : ''}`);
      if (data.zhaojiafangMeta && data.zhaojiafangMeta.currentColorName) {
        lines.push(`当前颜色：${data.zhaojiafangMeta.currentColorName}`);
      }
      if (data.zhaojiafangMeta && data.zhaojiafangMeta.currentSizeName) {
        lines.push(`当前尺码：${data.zhaojiafangMeta.currentSizeName}`);
      }
    }
    lines.push('');
    lines.push(`运费：${data.shipping || ''}`);
    lines.push('');
    if (data.mainImages && data.mainImages.length) {
      lines.push('主图/副图');
      lines.push(`一共 ${data.mainImages.length} 张：`);
      lines.push('');
      data.mainImages.forEach((url) => {
        lines.push(url);
      });
      lines.push('');
    }

    lines.push(SITE === '1688' ? '1688 SKU 选项' : SITE === 'tmall-shop' ? '淘宝/天猫店铺商品ID' : SITE === 'naver-smartstore' ? 'Naver SmartStore 选项' : SITE === 'cafe24' ? 'Cafe24 选项' : SITE === 'shopify' ? 'Shopify SKU 选项' : SITE === 'temu' ? 'Temu SKU 选项' : SITE === 'pinduoduo' ? '拼多多 SKU 选项' : SITE === 'zhaojiafang' ? '找家纺 SKU 选项' : SITE === 'onch3' ? 'Onch3 选项表' : SITE === 'taobao' ? '淘宝颜色选项' : '已抓到的选项（当前页面可见部分）');
    lines.push('');
    data.options.forEach((option) => {
      lines.push(formatOptionLine(option));
    });
    if (SITE === 'taobao' && data.options.length === 0) {
      lines.push('未从页面初始化数据或点击记录中采到选项。');
    }
    if (SITE === 'onch3' && data.options.length === 0) {
      lines.push(data.optionsLocked ? 'Onch3 当前账号/商品审批状态下选项价格不可见。' : '未在当前页面 DOM 中采到 Onch3 选项价格。');
    }
    lines.push('');
    lines.push('详情图');
    lines.push(`一共提到 ${data.detailImages.length} 张主详情图链接：`);
    lines.push('');
    data.detailImages.forEach((url) => {
      lines.push(url);
    });
    return lines.join('\n');
  }

  function buildAiMarkdown(data) {
    if (SITE === '1688-shop') {
      return build1688ShopMarkdown(data);
    }
    if (SITE === 'coupang-shop') {
      return buildCoupangShopMarkdown(data);
    }
    const lines = [];
    lines.push('# AI_PRODUCT_CAPTURE_V1');
    lines.push('');
    lines.push('## Source');
    lines.push(`- platform: ${data.source.platform}`);
    lines.push(`- url: ${data.source.url}`);
    lines.push(`- captured_at: ${data.source.capturedAt}`);
    lines.push('');
    lines.push('## Processing Scope');
    lines.push(`- ${AI_CURRENT_PRODUCT_PROMPT}`);
    if (SITE === 'coupang') {
      lines.push(`- ${COUPANG_TRUSTED_SOURCE_SCOPE_PROMPT}`);
    }
    lines.push('');
    lines.push('## Product');
    lines.push(`- title: ${data.title || ''}`);
    if (data.brand) {
      lines.push(`- brand: ${data.brand}`);
    }
    if (data.productVideoUrl) {
      lines.push(`- product_video_url: ${data.productVideoUrl}`);
    }
    if (SITE === 'coupang' && data.coupangMeta) {
      lines.push(`- product_id: ${data.coupangMeta.productId || ''}`);
      lines.push(`- item_id: ${data.coupangMeta.itemId || ''}`);
      lines.push(`- vendor_item_id: ${data.coupangMeta.vendorItemId || ''}`);
      if (data.coupangMeta.vendorId) {
        lines.push(`- vendor_id: ${data.coupangMeta.vendorId}`);
      }
    }
    if (SITE === 'coupang' && data.openWingStats) {
      lines.push(`- pv_source: ${data.openWingStats.source || 'openwing_front'}`);
      if (data.openWingStats.pvLast28Day) {
        lines.push(`- pv_last_28_day: ${data.openWingStats.pvLast28Day}`);
      }
      if (data.openWingStats.salesLast28d) {
        lines.push(`- sales_last_28d: ${data.openWingStats.salesLast28d}`);
      }
      if (data.openWingStats.cvr) {
        lines.push(`- cvr: ${data.openWingStats.cvr}`);
      }
      if (data.openWingStats.serviceFeeRatio) {
        lines.push(`- service_fee_ratio: ${data.openWingStats.serviceFeeRatio}`);
      }
      if (!data.openWingStats.pvLast28Day && data.openWingStats.status) {
        lines.push(`- pv_source_status: ${data.openWingStats.status}`);
      }
    }
    if (SITE === '1688' && data.alibaba1688Meta) {
      lines.push(`- offer_id: ${data.alibaba1688Meta.offerId || ''}`);
      if (data.alibaba1688Meta.detailUrl) {
        lines.push(`- detail_url: ${data.alibaba1688Meta.detailUrl}`);
      }
      if (data.alibaba1688Meta.rangePrices && data.alibaba1688Meta.rangePrices.length) {
        lines.push('- price_ranges:');
        data.alibaba1688Meta.rangePrices.forEach((item) => {
          lines.push(`  - begin_amount: ${item.beginAmount || ''}; price: ${item.price || ''}`);
        });
      }
    }
    if (SITE === 'tmall-shop' && data.tmallShopMeta) {
      lines.push(`已截获商品数：${data.tmallShopMeta.itemCount || 0}`);
      if (data.tmallShopMeta.captureSource) {
        lines.push(`采集来源：${data.tmallShopMeta.captureSource}`);
      }
    }
    if (SITE === 'naver-smartstore' && data.naverSmartstoreMeta) {
      lines.push(`스토어：${data.naverSmartstoreMeta.storeName || ''}`);
      lines.push(`상품ID：${data.naverSmartstoreMeta.productId || ''}`);
      if (data.naverSmartstoreMeta.basePrice) {
        lines.push(`기본가격：${data.naverSmartstoreMeta.basePrice}`);
      }
    }
    if (SITE === 'cafe24' && data.cafe24Meta) {
      lines.push(`- product_no: ${data.cafe24Meta.productNo || ''}`);
      if (data.cafe24Meta.basePrice) {
        lines.push(`- base_price: ${data.cafe24Meta.basePrice}`);
      }
      if (data.cafe24Meta.originalPrice) {
        lines.push(`- original_price: ${data.cafe24Meta.originalPrice}`);
      }
      if (data.cafe24Meta.purchaseUnit) {
        lines.push(`- purchase_unit: ${data.cafe24Meta.purchaseUnit}`);
      }
      if (data.cafe24Meta.vat) {
        lines.push(`- vat: ${data.cafe24Meta.vat}`);
      }
    }
    if (SITE === 'shopify' && data.shopifyMeta) {
      if (data.shopifyMeta.productId) {
        lines.push(`- product_id: ${data.shopifyMeta.productId}`);
      }
      if (data.shopifyMeta.handle) {
        lines.push(`- handle: ${data.shopifyMeta.handle}`);
      }
      if (data.shopifyMeta.vendor) {
        lines.push(`- vendor: ${data.shopifyMeta.vendor}`);
      }
      if (data.shopifyMeta.currency) {
        lines.push(`- currency: ${data.shopifyMeta.currency}`);
      }
      if (data.shopifyMeta.selectedVariantId) {
        lines.push(`- current_variant_id: ${data.shopifyMeta.selectedVariantId}`);
      }
    }
    if (SITE === 'temu' && data.temuMeta) {
      lines.push(`- goods_id: ${data.temuMeta.goodsId || ''}`);
      if (data.temuMeta.spuId) {
        lines.push(`- spu_id: ${data.temuMeta.spuId}`);
      }
      if (data.temuMeta.specGalleryId) {
        lines.push(`- spec_gallery_id: ${data.temuMeta.specGalleryId}`);
      }
      if (data.temuMeta.captureSource) {
        lines.push(`- capture_source: ${data.temuMeta.captureSource}`);
      }
    }
    if (SITE === 'pinduoduo' && data.pddMeta) {
      lines.push(`- goods_id: ${data.pddMeta.goodsId || ''}`);
      if (data.pddMeta.spuId) {
        lines.push(`- spu_id: ${data.pddMeta.spuId}`);
      }
      if (data.pddMeta.captureSource) {
        lines.push(`- capture_source: ${data.pddMeta.captureSource}`);
      }
    }
    if (SITE === 'zhaojiafang' && data.zhaojiafangMeta) {
      lines.push(`- spu_id: ${data.zhaojiafangMeta.spuId || ''}`);
      lines.push(`- current_sku_id: ${data.zhaojiafangMeta.currentSkuId || ''}`);
      if (data.zhaojiafangMeta.currentColorName) {
        lines.push(`- current_color: ${data.zhaojiafangMeta.currentColorName}`);
      }
      if (data.zhaojiafangMeta.currentSizeName) {
        lines.push(`- current_size: ${data.zhaojiafangMeta.currentSizeName}`);
      }
      if (data.zhaojiafangMeta.priceRange) {
        lines.push(`- price_range: ${normalizeCny(data.zhaojiafangMeta.priceRange)}`);
      }
      if (data.zhaojiafangMeta.totalStock || data.zhaojiafangMeta.totalStock === 0) {
        lines.push(`- total_stock: ${data.zhaojiafangMeta.totalStock}`);
      }
      if (data.zhaojiafangMeta.weight) {
        lines.push(`- current_weight: ${data.zhaojiafangMeta.weight}`);
      }
      if (data.zhaojiafangMeta.imageDownloadCount) {
        lines.push(`- image_download_count: ${data.zhaojiafangMeta.imageDownloadCount}`);
      }
      if (data.zhaojiafangMeta.filter) {
        lines.push(`- sku_filter: ${data.zhaojiafangMeta.filter.filteredOptionCount}/${data.zhaojiafangMeta.filter.rawOptionCount} included`);
        if (data.zhaojiafangMeta.filter.excludedColors && data.zhaojiafangMeta.filter.excludedColors.length) {
          lines.push(`- excluded_colors: ${data.zhaojiafangMeta.filter.excludedColors.join(', ')}`);
        }
        if (data.zhaojiafangMeta.filter.excludedSizes && data.zhaojiafangMeta.filter.excludedSizes.length) {
          lines.push(`- excluded_sizes: ${data.zhaojiafangMeta.filter.excludedSizes.join(', ')}`);
        }
      }
    }
    if (data.productCode) {
      lines.push(`- product_code: ${data.productCode}`);
    }
    lines.push(`- shipping: ${data.shipping || ''}`);
    if (data.listingConstraints) {
      lines.push('');
      lines.push('## Listing Constraints');
      if (data.listingConstraints.source) {
        lines.push(`- 来源：${data.listingConstraints.source === 'manual' ? '手动选择' : '自动识别'}`);
      }
      lines.push(`- 商品类型：${data.listingConstraints.productType || ''}`);
      lines.push(`- 标题规则：${data.listingConstraints.titleRule || ''}`);
      lines.push(`- 属性拆分：${data.listingConstraints.attributeSplit || ''}`);
      lines.push(`- 色卡规则：${data.listingConstraints.swatchRule || ''}`);
      lines.push(`- 价格规则：${data.listingConstraints.pricingRule || ''}`);
      lines.push(`- 图片规则：${data.listingConstraints.imageRule || ''}`);
    }
    lines.push('');
    lines.push('## Options');
    if (data.options.length) {
      data.options.forEach((option, index) => {
        if (SITE === 'tmall-shop') {
          lines.push(`${index + 1}. item_id: ${option.itemId || ''}`);
          return;
        }
        lines.push(`${index + 1}. name: ${option.name || ''}`);
        if (SITE === '1688') {
          if (option.colorName) {
            lines.push(`   - color: ${option.colorName}`);
          }
          if (option.sizeName) {
            lines.push(`   - ${is1688SizeDimension(option) ? 'size' : 'spec'}: ${option.sizeName}`);
          }
          if (option.skuId) {
            lines.push(`   - sku_id: ${option.skuId}`);
          }
          lines.push(`   - sale_price: ${option.salePrice || ''}`);
          if (option.stockQuantity || option.stockQuantity === 0) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'coupang') {
          if (option.color) {
            lines.push(`   - color: ${option.color}`);
          }
          if (option.size) {
            lines.push(`   - size: ${option.size}`);
          }
          if (option.itemId) {
            lines.push(`   - item_id: ${option.itemId}`);
          }
          if (option.vendorItemId) {
            lines.push(`   - vendor_item_id: ${option.vendorItemId}`);
          }
          lines.push(`   - sale_price: ${option.price || ''}`);
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'naver-smartstore') {
          lines.push(`   - price: ${option.price || option.salePrice || ''}`);
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
        } else if (SITE === 'cafe24') {
          lines.push(`   - sale_price: ${option.salePrice || ''}`);
          if (option.originalPrice) {
            lines.push(`   - original_price: ${option.originalPrice}`);
          }
          if (option.addPrice) {
            lines.push(`   - add_price: ${option.addPrice}`);
          }
          if (option.optionValue) {
            lines.push(`   - option_value: ${option.optionValue}`);
          }
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
        } else if (SITE === 'shopify') {
          if (option.skuId) {
            lines.push(`   - variant_id: ${option.skuId}`);
          }
          if (option.sku) {
            lines.push(`   - sku: ${option.sku}`);
          }
          if (option.barcode) {
            lines.push(`   - barcode: ${option.barcode}`);
          }
          lines.push(`   - sale_price: ${option.salePrice || ''}`);
          if (option.originalPrice) {
            lines.push(`   - original_price: ${option.originalPrice}`);
          }
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'onch3') {
          lines.push(`   - compliance_price: ${option.compliancePrice || ''}`);
          lines.push(`   - seller_price: ${option.sellerPrice || option.price || ''}`);
          if (option.stockQuantity) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.status) {
            lines.push(`   - status: ${option.status}`);
          }
        } else if (SITE === 'taobao') {
          if (option.skuId) {
            lines.push(`   - sku_id: ${option.skuId}`);
          }
          lines.push(`   - sale_price: ${option.salePrice ? `￥${option.salePrice}` : ''}`);
          if (option.optionCode) {
            lines.push(`   - option_code: ${option.optionCode}`);
          }
          if (option.originalPrice) {
            lines.push(`   - original_price: ￥${option.originalPrice}`);
          }
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockQuantity || option.stockQuantity === 0) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.confirmed) {
            lines.push('   - confirmed_by_click: true');
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'temu') {
          if (option.skuId) {
            lines.push(`   - sku_id: ${option.skuId}`);
          }
          lines.push(`   - sale_price: ${option.salePrice || ''}`);
          if (option.originalPrice) {
            lines.push(`   - original_price: ${option.originalPrice}`);
          }
          if (option.stockQuantity) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'pinduoduo') {
          if (option.colorName) {
            lines.push(`   - color: ${option.colorName}`);
          }
          if (option.skuId) {
            lines.push(`   - sku_id: ${option.skuId}`);
          }
          lines.push(`   - sale_price: ${option.salePrice || ''}`);
          if (option.originalPrice) {
            lines.push(`   - original_price: ${option.originalPrice}`);
          }
          if (option.stockQuantity) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'zhaojiafang') {
          if (option.skuId) {
            lines.push(`   - sku_id: ${option.skuId}`);
          }
          lines.push(`   - sale_price: ${option.price || normalizeCny(option.salePrice)}`);
          if (option.stockQuantity || option.stockQuantity === 0) {
            lines.push(`   - stock_quantity: ${option.stockQuantity}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.weight) {
            lines.push(`   - weight: ${option.weight}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else if (SITE === 'coupang') {
          if (option.color) {
            lines.push(`   - color: ${option.color}`);
          }
          if (option.size) {
            lines.push(`   - size: ${option.size}`);
          }
          if (option.itemId) {
            lines.push(`   - item_id: ${option.itemId}`);
          }
          if (option.vendorItemId) {
            lines.push(`   - vendor_item_id: ${option.vendorItemId}`);
          }
          lines.push(`   - sale_price: ${option.price || ''}`);
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
          if (option.stockStatus) {
            lines.push(`   - stock_status: ${option.stockStatus}`);
          }
          if (option.image) {
            lines.push(`   - sku_image: ${option.image}`);
          }
        } else {
          lines.push(`   - price: ${option.price || ''}`);
          if (option.note) {
            lines.push(`   - note: ${option.note}`);
          }
          if (option.stockText) {
            lines.push(`   - stock: ${option.stockText}`);
          }
        }
      });
    } else {
      lines.push('- none_collected');
    }
    if (SITE === 'taobao' && data.taobaoSizes && data.taobaoSizes.length) {
      lines.push('');
      lines.push('## Sizes');
      data.taobaoSizes.forEach((size, index) => {
        lines.push(`${index + 1}. ${size.name}`);
        if (size.optionCode) {
          lines.push(`   - option_code: ${size.optionCode}`);
        }
      });
    }
    if (SITE === 'taobao' && data.taobaoSkuMatrix && data.taobaoSkuMatrix.length) {
      lines.push('');
      lines.push('## SKU Matrix');
      data.taobaoSkuMatrix.forEach((sku, index) => {
        lines.push(`${index + 1}. name: ${sku.name || [sku.color, sku.size].filter(Boolean).join(' / ')}`);
        lines.push(`   - sku_id: ${sku.skuId || ''}`);
        if (sku.salePrice) {
          lines.push(`   - sale_price: ￥${sku.salePrice}`);
        }
        if (sku.stockText) {
          lines.push(`   - stock: ${sku.stockText}`);
        }
        if (sku.stockQuantity || sku.stockQuantity === 0) {
          lines.push(`   - stock_quantity: ${sku.stockQuantity}`);
        }
        if (sku.stockStatus) {
          lines.push(`   - stock_status: ${sku.stockStatus}`);
        }
        if (sku.propPath) {
          lines.push(`   - prop_path: ${sku.propPath}`);
        }
        if (sku.image) {
          lines.push(`   - sku_image: ${sku.image}`);
        }
      });
    }
    if (SITE !== '1688') {
      lines.push('');
      lines.push('## Main Images');
      (data.mainImages || []).forEach((url, index) => lines.push(`${index + 1}. ${url}`));
      if (!data.mainImages || data.mainImages.length === 0) {
        lines.push('- none_collected');
      }
    }
    lines.push('');
    lines.push('## Detail Images');
    data.detailImages.forEach((url, index) => lines.push(`${index + 1}. ${url}`));
    if (!data.detailImages.length) {
      lines.push('- none_collected');
    }
    if (data.selectedSideChatDetailImages && data.selectedSideChatDetailImages.length) {
      lines.push('');
      lines.push('## Side Chat Images');
      data.selectedSideChatDetailImages.forEach((url, index) => lines.push(`${index + 1}. ${url}`));
      lines.push('');
      lines.push('## Side Chat Image Instructions');
      lines.push('- The images listed in Side Chat Images are the default source images for AI translation/redrawing work.');
      lines.push('- Translate or redraw the Chinese text/content in these selected detail images, preserving product layout and visual style as much as possible.');
      lines.push('- In the final detail page, replace the original selected Chinese detail images with the processed Side Chat Image results.');
      lines.push('- Do not replace unselected Detail Images unless explicitly instructed.');
    }
    if (data.selectedSizeChartDetailImages && data.selectedSizeChartDetailImages.length) {
      lines.push('');
      lines.push('## Size Chart / Structured Info Source Images');
      data.selectedSizeChartDetailImages.forEach((url, index) => lines.push(`${index + 1}. ${url}`));
      lines.push('');
      lines.push('## Structured Product Information Instructions');
      lines.push('- Identify whether each selected image contains size/measurement, composition/material/structure, specification, or another product attribute.');
      lines.push('- Translate or extract only the relevant structured information and convert it into usable product fields.');
      lines.push('- If the selected images include both size/measurement and other attributes, treat them as one combined product-information set: translate and typeset them together into one coherent replacement information graphic, preserving their relationships.');
      lines.push('- Do not treat the whole selected image as a normal translated detail image unless it is also selected as a Side Chat Image.');
    }
    if (SITE === 'naver-smartstore' && data.naverSmartstoreDetailHtmlEnabled && data.naverSmartstoreDetailHtml) {
      lines.push('');
      lines.push('## Detail HTML');
      lines.push('```html');
      lines.push(data.naverSmartstoreDetailHtml);
      lines.push('```');
    }
    if (SITE === 'zhaojiafang') {
      lines.push('');
      lines.push('## Download Package');
      if (data.zhaojiafangMeta && data.zhaojiafangMeta.quickImageRarUrl) {
        lines.push(`- quick_image_rar_url: ${data.zhaojiafangMeta.quickImageRarUrl}`);
      } else {
        lines.push('- quick_image_rar_url: pending');
      }
    }
    lines.push('');
    lines.push('## Collector Notes');
    lines.push('- Only collected values are included. Missing SKU/options are intentionally omitted instead of guessed.');
    lines.push('- Public image URLs are preserved as source URLs for downstream AI/listing workflows.');
    const markdown = lines.join('\n');
    return SITE === 'taobao' ? stripTaobaoSummarySections(markdown) : markdown;
  }

  function buildJsonData(data) {
    if (SITE === '1688-shop') {
      return build1688ShopJson(data);
    }
    if (SITE === 'coupang-shop') {
      const crawledById = new Map((state.coupangShopCrawledProducts || []).map((item) => [item.productId, item]));
      return {
        schema: 'AI_PRODUCT_CAPTURE_V1',
        source: data.source,
        shop: data.coupangShopMeta || {},
        products: (data.coupangShopProducts || []).map((item) => {
          const crawled = crawledById.get(item.productId) || null;
          return {
            product_id: item.productId,
            status: crawled ? 'product_page_crawled' : 'visible_link_only',
            card_title: item.cardTitle || '',
            card_price: item.cardPrice || '',
            card_image: item.cardImage || '',
            url: item.url || '',
            product_page_data: crawled || null
          };
        }),
        crawl_errors: state.coupangShopCrawlErrors || []
      };
    }
    const result = {
      schema: 'AI_PRODUCT_CAPTURE_V1',
      source: data.source,
      processing_scope: AI_CURRENT_PRODUCT_PROMPT,
      source_id_scope: SITE === 'coupang' ? COUPANG_TRUSTED_SOURCE_SCOPE_PROMPT : '',
      product: {
        title: data.title || '',
        brand: data.brand || '',
        product_id: SITE === 'coupang' && data.coupangMeta ? data.coupangMeta.productId || '' : '',
        item_id: SITE === 'coupang' && data.coupangMeta ? data.coupangMeta.itemId || '' : '',
        vendor_item_id: SITE === 'coupang' && data.coupangMeta ? data.coupangMeta.vendorItemId || '' : '',
        vendor_id: SITE === 'coupang' && data.coupangMeta ? data.coupangMeta.vendorId || '' : '',
        pv_source: SITE === 'coupang' && data.openWingStats ? data.openWingStats.source || 'openwing_front' : '',
        pv_last_28_day: SITE === 'coupang' && data.openWingStats ? data.openWingStats.pvLast28Day || '' : '',
        sales_last_28d: SITE === 'coupang' && data.openWingStats ? data.openWingStats.salesLast28d || '' : '',
        cvr: SITE === 'coupang' && data.openWingStats ? data.openWingStats.cvr || '' : '',
        service_fee_ratio: SITE === 'coupang' && data.openWingStats ? data.openWingStats.serviceFeeRatio || '' : '',
        pv_source_status: SITE === 'coupang' && data.openWingStats ? data.openWingStats.status || '' : '',
        product_video_url: data.productVideoUrl || '',
        offer_id: data.alibaba1688Meta && data.alibaba1688Meta.offerId ? data.alibaba1688Meta.offerId : '',
        detail_url: data.alibaba1688Meta && data.alibaba1688Meta.detailUrl ? data.alibaba1688Meta.detailUrl : '',
        price_ranges: data.alibaba1688Meta && data.alibaba1688Meta.rangePrices ? data.alibaba1688Meta.rangePrices.map((item) => ({ begin_amount: item.beginAmount || '', price: item.price || '' })) : [],
        product_code: data.productCode || '',
        product_no: data.cafe24Meta && data.cafe24Meta.productNo ? data.cafe24Meta.productNo : '',
        base_price: data.cafe24Meta && data.cafe24Meta.basePrice ? data.cafe24Meta.basePrice : '',
        original_price: data.cafe24Meta && data.cafe24Meta.originalPrice ? data.cafe24Meta.originalPrice : '',
        purchase_unit: data.cafe24Meta && data.cafe24Meta.purchaseUnit ? data.cafe24Meta.purchaseUnit : '',
        vat: data.cafe24Meta && data.cafe24Meta.vat ? data.cafe24Meta.vat : '',
        shopify_product_id: data.shopifyMeta && data.shopifyMeta.productId ? data.shopifyMeta.productId : '',
        shopify_handle: data.shopifyMeta && data.shopifyMeta.handle ? data.shopifyMeta.handle : '',
        vendor: data.shopifyMeta && data.shopifyMeta.vendor ? data.shopifyMeta.vendor : '',
        currency: data.shopifyMeta && data.shopifyMeta.currency ? data.shopifyMeta.currency : '',
        current_variant_id: data.shopifyMeta && data.shopifyMeta.selectedVariantId ? data.shopifyMeta.selectedVariantId : '',
        captured_item_count: data.tmallShopMeta && data.tmallShopMeta.itemCount ? data.tmallShopMeta.itemCount : 0,
        store_name: data.naverSmartstoreMeta && data.naverSmartstoreMeta.storeName ? data.naverSmartstoreMeta.storeName : '',
        product_id: data.naverSmartstoreMeta && data.naverSmartstoreMeta.productId ? data.naverSmartstoreMeta.productId : '',
        goods_id: data.temuMeta && data.temuMeta.goodsId ? data.temuMeta.goodsId : data.pddMeta && data.pddMeta.goodsId ? data.pddMeta.goodsId : '',
        spu_id: data.temuMeta && data.temuMeta.spuId ? data.temuMeta.spuId : data.pddMeta && data.pddMeta.spuId ? data.pddMeta.spuId : data.zhaojiafangMeta && data.zhaojiafangMeta.spuId ? data.zhaojiafangMeta.spuId : '',
        current_sku_id: data.zhaojiafangMeta && data.zhaojiafangMeta.currentSkuId ? data.zhaojiafangMeta.currentSkuId : '',
        current_color: data.zhaojiafangMeta && data.zhaojiafangMeta.currentColorName ? data.zhaojiafangMeta.currentColorName : '',
        current_size: data.zhaojiafangMeta && data.zhaojiafangMeta.currentSizeName ? data.zhaojiafangMeta.currentSizeName : '',
        price_range: data.zhaojiafangMeta && data.zhaojiafangMeta.priceRange ? data.zhaojiafangMeta.priceRange : '',
        quick_image_rar_url: data.zhaojiafangMeta && data.zhaojiafangMeta.quickImageRarUrl ? data.zhaojiafangMeta.quickImageRarUrl : '',
        image_download_count: data.zhaojiafangMeta && data.zhaojiafangMeta.imageDownloadCount ? data.zhaojiafangMeta.imageDownloadCount : '',
        sku_filter: (data.zhaojiafangMeta && data.zhaojiafangMeta.filter) || (data.alibaba1688Meta && data.alibaba1688Meta.filter) ? {
          raw_option_count: ((data.zhaojiafangMeta && data.zhaojiafangMeta.filter) || (data.alibaba1688Meta && data.alibaba1688Meta.filter)).rawOptionCount || 0,
          filtered_option_count: ((data.zhaojiafangMeta && data.zhaojiafangMeta.filter) || (data.alibaba1688Meta && data.alibaba1688Meta.filter)).filteredOptionCount || 0,
          excluded_colors: ((data.zhaojiafangMeta && data.zhaojiafangMeta.filter) || (data.alibaba1688Meta && data.alibaba1688Meta.filter)).excludedColors || [],
          excluded_sizes: ((data.zhaojiafangMeta && data.zhaojiafangMeta.filter) || (data.alibaba1688Meta && data.alibaba1688Meta.filter)).excludedSizes || []
        } : null,
        spec_gallery_id: data.temuMeta && data.temuMeta.specGalleryId ? data.temuMeta.specGalleryId : '',
        shipping: data.shipping || '',
        listing_constraints: data.listingConstraints || null,
        sizes: SITE === 'taobao' ? (data.taobaoSizes || []).map((size) => ({
          name: size.name || '',
          option_code: size.optionCode || '',
          pid: size.pid || '',
          vid: size.vid || ''
        })) : [],
        taobao_sku_count: data.taobaoMeta && data.taobaoMeta.skuCount ? data.taobaoMeta.skuCount : 0,
        taobao_capture_source: data.taobaoMeta && data.taobaoMeta.captureSource ? data.taobaoMeta.captureSource : '',
        options_locked: Boolean(data.optionsLocked)
      },
      options: data.options.map((option) => {
        if (SITE === 'tmall-shop') {
          return {
            item_id: option.itemId || ''
          };
        }
        if (SITE === '1688') {
          return {
            name: option.name || '',
            raw_name: option.rawName || '',
            color: option.colorName || '',
            size: is1688SizeDimension(option) ? option.sizeName || '' : '',
            spec: !is1688SizeDimension(option) ? option.specName || option.sizeName || '' : '',
            dimension_names: option.dimensionNames || [],
            sku_id: option.skuId || '',
            spec_id: option.specId || '',
            sale_price: option.salePrice || '',
            stock_quantity: option.stockQuantity || '',
            sale_count: option.saleCount || '',
            sku_image: option.image || ''
          };
        }
        if (SITE === 'naver-smartstore') {
          return {
            name: option.name || '',
            price: option.price || option.salePrice || '',
            stock: option.stockText || '',
            stock_status: option.stockStatus || ''
          };
        }
        if (SITE === 'cafe24') {
          return {
            name: option.name || '',
            raw_name: option.rawName || '',
            option_value: option.optionValue || '',
            sale_price: option.salePrice || '',
            original_price: option.originalPrice || '',
            add_price: option.addPrice || '',
            stock: option.stockText || '',
            stock_status: option.stockStatus || ''
          };
        }
        if (SITE === 'shopify') {
          return {
            name: option.name || '',
            variant_id: option.skuId || '',
            sku: option.sku || '',
            barcode: option.barcode || '',
            sale_price: option.salePrice || '',
            original_price: option.originalPrice || '',
            stock: option.stockText || '',
            stock_status: option.stockStatus || '',
            sku_image: option.image || ''
          };
        }
        if (SITE === 'onch3') {
          return {
            name: option.name || '',
            compliance_price: option.compliancePrice || '',
            seller_price: option.sellerPrice || option.price || '',
            stock_quantity: option.stockQuantity || '',
            status: option.status || '',
            raw_text: option.rawText || ''
          };
        }
        if (SITE === 'taobao') {
          return {
            name: option.name || '',
            sku_id: option.skuId || '',
            sale_price: option.salePrice ? `￥${option.salePrice}` : '',
            option_code: option.optionCode || '',
            pid: option.pid || '',
            vid: option.vid || '',
            original_price: option.originalPrice ? `￥${option.originalPrice}` : '',
            stock: option.stockText || '',
            stock_quantity: option.stockQuantity || option.stockQuantity === 0 ? option.stockQuantity : '',
            stock_status: option.stockStatus || '',
            confirmed_by_click: Boolean(option.confirmed),
            sku_image: option.image || ''
          };
        }
        if (SITE === 'temu') {
          return {
            name: option.name || '',
            sku_id: option.skuId || '',
            sale_price: option.salePrice || '',
            original_price: option.originalPrice || '',
            stock_quantity: option.stockQuantity || '',
            stock_status: option.stockStatus || '',
            sku_image: option.image || ''
          };
        }
        if (SITE === 'pinduoduo') {
          return {
            name: option.name || '',
            color: option.colorName || '',
            sku_id: option.skuId || '',
            sale_price: option.salePrice || '',
            original_price: option.originalPrice || '',
            stock_quantity: option.stockQuantity || '',
            stock_status: option.stockStatus || '',
            sku_image: option.image || ''
          };
        }
        if (SITE === 'zhaojiafang') {
          return {
            name: option.name || '',
            color: option.colorName || '',
            size: option.sizeName || '',
            sku_id: option.skuId || '',
            sale_price: option.price || normalizeCny(option.salePrice),
            stock_quantity: option.stockQuantity || option.stockQuantity === 0 ? option.stockQuantity : '',
            stock_status: option.stockStatus || '',
            weight: option.weight || '',
            sku_image: option.image || ''
          };
        }
        if (SITE === 'coupang') {
          return {
            name: option.name || '',
            color: option.color || '',
            size: option.size || '',
            item_id: option.itemId || '',
            vendor_item_id: option.vendorItemId || '',
            sale_price: option.price || '',
            stock: option.stockText || '',
            stock_status: option.stockStatus || '',
            sku_image: option.image || ''
          };
        }
        return {
          name: option.name || '',
          price: option.price || '',
          note: option.note || '',
          stock: option.stockText || ''
        };
      }),
      sku_matrix: SITE === 'taobao' ? (data.taobaoSkuMatrix || []).map((sku) => ({
        name: sku.name || '',
        color: sku.color || '',
        size: sku.size || '',
        sku_id: sku.skuId || '',
        prop_path: sku.propPath || '',
        color_option_code: sku.colorOptionCode || '',
        size_option_code: sku.sizeOptionCode || '',
        sale_price: sku.salePrice ? `￥${sku.salePrice}` : '',
        stock: sku.stockText || '',
        stock_quantity: sku.stockQuantity || sku.stockQuantity === 0 ? sku.stockQuantity : '',
        stock_status: sku.stockStatus || '',
        sku_image: sku.image || ''
      })) : [],
      images: {
        main: data.mainImages || [],
        sku: (SITE === 'coupang' || SITE === '1688' || SITE === 'tmall-shop' || SITE === 'taobao' || SITE === 'cafe24' || SITE === 'shopify' || SITE === 'zhaojiafang' || SITE === 'pinduoduo' || SITE === 'temu') ? data.options.map((option) => option.image).filter(Boolean) : [],
        detail: data.detailImages || [],
        raw_detail: data.rawDetailImages || data.detailImages || [],
        excluded_detail: Array.from(state.excludedDetailImages || []),
        side_chat_detail: data.selectedSideChatDetailImages || [],
        size_chart_source_detail: data.selectedSizeChartDetailImages || []
      },
      detail_html: SITE === 'naver-smartstore' && data.naverSmartstoreDetailHtmlEnabled ? (data.naverSmartstoreDetailHtml || '') : '',
      side_chat_image_instruction: data.selectedSideChatDetailImages && data.selectedSideChatDetailImages.length ? {
        purpose: 'translate_or_redraw_selected_detail_images',
        rule: 'Use selected side_chat_detail images as the source for AI image translation/redrawing. Replace only those original Chinese detail images in the final detail page with the processed results; keep unselected detail images unchanged.'
      } : null,
      size_chart_instruction: data.selectedSizeChartDetailImages && data.selectedSizeChartDetailImages.length ? {
        purpose: 'extract_or_translate_structured_product_information',
        information_types: ['size_measurement', 'composition', 'material', 'structure', 'specification', 'attribute'],
        rule: 'The selected images contain structured product information. Identify whether each image contains size/measurement, composition/material/structure, specification, or another product attribute; translate or extract only that information into usable structured fields. If size/measurement and other attributes are both selected, combine them into one coherent translated/typeset replacement information graphic while preserving their relationships. Do not use the whole source image as a translated detail image unless it is also selected as side_chat_detail.'
      } : null,
      collector_notes: [
        'Only collected values are included. Missing SKU/options are intentionally omitted instead of guessed.',
        'Public image URLs are preserved as source URLs for downstream AI/listing workflows.'
      ]
    };
    if (SITE === 'taobao') {
      result.product.taobao_capture_mode = data.taobaoMode || state.taobaoCaptureMode;
      if (isTaobaoMatrixMode(data)) {
        delete result.product.sizes;
        delete result.options;
      } else {
        delete result.sku_matrix;
      }
    }
    return result;
  }

  function collectData() {
    if (SITE === '1688-shop') {
      const options = extract1688ShopOptions();
      const alibabaShopMeta = extract1688ShopMeta();
      const source = {
        platform: '1688-shop',
        url: getCanonicalSourceUrl(),
        capturedAt: new Date().toISOString()
      };
      const data = {
        title: normalize(document.title || '').replace(/\s*-\s*阿里巴巴.*$/i, ''),
        brand: '', productVideoUrl: '', productCode: '', shipping: '',
        listingConstraints: null, options, optionsLocked: false,
        rawDetailImages: [], detailImages: [], selectedSideChatDetailImages: [],
        selectedSizeChartDetailImages: [], mainImages: [],
        alibabaShopMeta, source
      };
      data.text = buildText(data);
      data.aiText = buildAiMarkdown(data);
      data.jsonData = buildJsonData(data);
      data.jsonText = JSON.stringify(data.jsonData, null, 2);
      data.fileBaseName = sanitizeFileName(`1688-shop-${location.hostname}`);
      return data;
    }
    const alibaba1688Data = SITE === '1688' ? get1688RootData() : null;
    const alibaba1688RawOptions = SITE === '1688' ? extract1688Options(alibaba1688Data) : [];
    const alibaba1688FilteredOptions = SITE === '1688' ? apply1688OptionFilter(alibaba1688RawOptions) : [];
    const alibaba1688Meta = SITE === '1688' ? { ...extract1688Meta(alibaba1688Data), filter: extract1688FilterMeta(alibaba1688RawOptions, alibaba1688FilteredOptions) } : null;
    const tmallShopPayload = SITE === 'tmall-shop' ? getTmallShopCapturedPayload() : null;
    const tmallShopMeta = SITE === 'tmall-shop' ? extractTmallShopMeta(tmallShopPayload) : null;
    const zhaojiafangGoodsInfo = SITE === 'zhaojiafang' ? getZhaojiafangGoodsInfo() : null;
    const zhaojiafangImages = SITE === 'zhaojiafang' ? extractZhaojiafangImages(zhaojiafangGoodsInfo) : null;
    const zhaojiafangRawOptions = SITE === 'zhaojiafang' ? extractZhaojiafangOptions(zhaojiafangGoodsInfo) : [];
    const zhaojiafangFilteredOptions = SITE === 'zhaojiafang' ? applyZhaojiafangOptionFilter(zhaojiafangRawOptions) : [];
    const zhaojiafangMeta = SITE === 'zhaojiafang' ? { ...extractZhaojiafangMeta(zhaojiafangGoodsInfo), filter: extractZhaojiafangFilterMeta(zhaojiafangGoodsInfo, zhaojiafangRawOptions, zhaojiafangFilteredOptions) } : null;
    const pddPayload = SITE === 'pinduoduo' ? getPddCapturedPayload() : null;
    const pddMeta = SITE === 'pinduoduo' ? extractPddMeta(pddPayload) : null;
    const temuPayload = SITE === 'temu' ? getTemuCapturedPayload() : null;
    const temuMeta = SITE === 'temu' ? extractTemuMeta(temuPayload) : null;
    const taobaoMode = SITE === 'taobao' ? state.taobaoCaptureMode : '';
    const taobaoInitialData = SITE === 'taobao' ? extractTaobaoInitialData() : null;
    const taobaoVisibleSizes = SITE === 'taobao' ? extractTaobaoVisibleSizes() : [];
    const taobaoSizes = SITE === 'taobao' && taobaoMode === 'selected' ? ((taobaoInitialData && taobaoInitialData.sizes && taobaoInitialData.sizes.length) ? taobaoInitialData.sizes : taobaoVisibleSizes) : [];
    const taobaoRawSkuMatrix = SITE === 'taobao' && taobaoMode === 'matrix' && taobaoInitialData ? taobaoInitialData.skuMatrix || [] : [];
    const taobaoSkuMatrix = applyTaobaoOptionFilter(taobaoRawSkuMatrix);
    const taobaoRawSelectedOptions = SITE === 'taobao' && taobaoMode === 'selected' ? getTaobaoSelectedOptions() : [];
    const taobaoFilteredOptions = applyTaobaoOptionFilter(taobaoRawSelectedOptions);
    const taobaoFilterSource = taobaoMode === 'matrix' ? taobaoRawSkuMatrix : taobaoRawSelectedOptions;
    const taobaoFilterResult = taobaoMode === 'matrix' ? taobaoSkuMatrix : taobaoFilteredOptions;
    const taobaoMeta = SITE === 'taobao' && taobaoInitialData ? { ...(taobaoInitialData.meta || {}), captureMode: taobaoMode, filter: extractTaobaoFilterMeta(taobaoFilterSource, taobaoFilterResult) } : SITE === 'taobao' ? { captureMode: taobaoMode, filter: extractTaobaoFilterMeta(taobaoFilterSource, taobaoFilterResult) } : null;
    const naverSmartstoreMeta = SITE === 'naver-smartstore' ? extractNaverSmartstoreMeta() : null;
    const naverSmartstoreDetailHtml = SITE === 'naver-smartstore' ? extractNaverSmartstoreDetailHtml() : '';
    const cafe24Meta = SITE === 'cafe24' ? extractCafe24Meta() : null;
    const shopifyProduct = SITE === 'shopify' ? getShopifyStructuredProduct() : null;
    const shopifyMeta = SITE === 'shopify' ? extractShopifyMeta(shopifyProduct) : null;
    const coupangRawOptions = SITE === 'coupang' ? normalizeCoupangOptionDimensions(extractOptions()) : [];
    const coupangFilteredOptions = SITE === 'coupang' ? applyCoupangOptionFilter(coupangRawOptions) : [];
    const coupangMeta = SITE === 'coupang' ? { ...extractCoupangMeta(), filter: extractCoupangFilterMeta(coupangRawOptions, coupangFilteredOptions) } : null;
    const openWingStats = SITE === 'coupang' ? extractOpenWingStats() : null;
    const coupangShopProducts = SITE === 'coupang-shop' ? extractCoupangShopProductLinks() : [];
    const coupangShopMeta = SITE === 'coupang-shop' ? extractCoupangShopMeta() : null;
    const title = SITE === 'shopify' ? extractShopifyTitle(shopifyProduct) : SITE === 'coupang-shop' && coupangShopMeta ? coupangShopMeta.sellerName || document.title : extractTitle();
    const brand = SITE === 'coupang' ? extractCoupangBrand() : SITE === 'shopify' && shopifyMeta && shopifyMeta.vendor ? shopifyMeta.vendor : '';
    const productVideoUrl = SITE === 'taobao' ? extractTaobaoVideoUrl() : SITE === 'zhaojiafang' ? extractZhaojiafangVideoUrl(zhaojiafangGoodsInfo) : '';
    const shipping = extractShipping();
    const productCode = SITE === 'onch3' ? extractOnch3Field('상품코드') : SITE === 'cafe24' ? extractCafe24ProductNo() : '';
    const listingConstraints = SITE === 'taobao' || SITE === 'coupang' ? extractListingConstraints() : null;
    const options = SITE === 'coupang-shop'
      ? []
      : SITE === '1688'
      ? alibaba1688FilteredOptions
      : SITE === 'tmall-shop'
      ? extractTmallShopOptions(tmallShopPayload)
      : SITE === 'naver-smartstore'
      ? extractNaverSmartstoreOptions()
      : SITE === 'cafe24'
      ? extractCafe24Options()
      : SITE === 'shopify'
      ? extractShopifyOptions(shopifyProduct)
      : SITE === 'temu'
        ? extractTemuOptions(temuPayload)
      : SITE === 'pinduoduo'
        ? extractPddOptions(pddPayload)
      : SITE === 'onch3'
        ? extractOnch3Options()
        : SITE === 'zhaojiafang'
        ? zhaojiafangFilteredOptions
        : SITE === 'taobao'
          ? (taobaoMode === 'selected' ? taobaoFilteredOptions : [])
          : SITE === 'coupang'
            ? coupangFilteredOptions
            : extractOptions();
    const mainImages = SITE === 'coupang-shop' ? [] : SITE === '1688' ? extract1688MainImages(alibaba1688Data) : SITE === 'tmall-shop' ? extractTmallShopOptions(tmallShopPayload).map((item) => item.image).filter(Boolean) : SITE === 'naver-smartstore' ? extractNaverSmartstoreMainImages() : SITE === 'cafe24' ? extractCafe24MainImages() : SITE === 'shopify' ? extractShopifyMainImages(shopifyProduct) : SITE === 'temu' ? extractTemuMainImages(temuPayload) : SITE === 'pinduoduo' ? extractPddMainImages(pddPayload) : SITE === 'zhaojiafang' ? zhaojiafangImages.mainImages : SITE === 'onch3' ? extractOnch3MainImages() : SITE === 'taobao' ? extractTaobaoMainImages() : SITE === 'coupang' ? extractCoupangMainImages() : [];
    const collectedDetailImages = SITE === 'coupang-shop' ? [] : SITE === '1688' ? extract1688RenderedDetailImages(alibaba1688Data) : SITE === 'tmall-shop' ? [] : SITE === 'naver-smartstore' ? extractNaverSmartstoreDetailImages() : SITE === 'cafe24' ? extractCafe24DetailImages() : SITE === 'shopify' ? extractShopifyDetailImages() : SITE === 'temu' ? extractTemuDetailImages(temuPayload) : SITE === 'pinduoduo' ? extractPddDetailImages(pddPayload) : SITE === 'zhaojiafang' ? zhaojiafangImages.detailImages : extractDetailImages();
    const rawDetailImages = filterDetailImagesAgainstMain(collectedDetailImages, mainImages);
    const detailImages = rawDetailImages.filter((url) => !(state.excludedDetailImages && state.excludedDetailImages.has(url)));
    const selectedSideChatDetailImages = [];
    const selectedSizeChartDetailImages = detailImages.filter((url) => state.sizeChartDetailImages && state.sizeChartDetailImages.has(url));
    const optionsLocked = SITE === 'onch3' ? hasOnch3LockedOptions() : false;
    const source = {
      platform: getSourcePlatform(),
      url: getCanonicalSourceUrl(),
      capturedAt: new Date().toISOString()
    };
    const naverSmartstoreDetailHtmlEnabled = SITE === 'naver-smartstore' ? state.naverDetailHtmlEnabled : false;
    const baseData = { title, brand, productVideoUrl, productCode, shipping, listingConstraints, options, optionsLocked, rawDetailImages, detailImages, selectedSideChatDetailImages, selectedSizeChartDetailImages, mainImages, alibaba1688Meta, tmallShopMeta, zhaojiafangMeta, pddMeta, temuMeta, naverSmartstoreMeta, naverSmartstoreDetailHtml, naverSmartstoreDetailHtmlEnabled, cafe24Meta, shopifyMeta, coupangMeta, openWingStats, coupangShopMeta, coupangShopProducts, taobaoSizes, taobaoSkuMatrix, taobaoMeta, taobaoMode, source };
    const text = buildText(baseData);
    const aiText = buildAiMarkdown(baseData);
    const jsonData = buildJsonData(baseData);
    return {
      ...baseData,
      text,
      aiText,
      jsonData,
      jsonText: JSON.stringify(jsonData, null, 2),
      fileBaseName: sanitizeFileName(title || `${SITE}-product-capture`)
    };
  }

  function rebuildOutput(data) {
    if (!data) {
      return data;
    }
    const sourceDetailImages = filterDetailImagesAgainstMain(getPreviewDetailImages(data), data.mainImages || []);
    data.rawDetailImages = sourceDetailImages;
    data.detailImages = sourceDetailImages.filter((url) => !(state.excludedDetailImages && state.excludedDetailImages.has(url)));
    data.selectedSideChatDetailImages = [];
    data.selectedSizeChartDetailImages = (data.detailImages || []).filter((url) => state.sizeChartDetailImages && state.sizeChartDetailImages.has(url));
    data.text = buildText(data);
    data.aiText = buildAiMarkdown(data);
    data.jsonData = buildJsonData(data);
    data.jsonText = JSON.stringify(data.jsonData, null, 2);
    return data;
  }

  function getPreviewDetailImages(data) {
    const raw = data && Array.isArray(data.rawDetailImages) ? data.rawDetailImages : [];
    const filtered = data && Array.isArray(data.detailImages) ? data.detailImages : [];
    return uniqueList(raw.length ? raw : filtered);
  }


  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function captureFilterScrollPosition() {
    const body = root.querySelector('.coupang-capture-body');
    const scrollNodes = Array.from(root.querySelectorAll(
      '.coupang-capture-filter-chips, .coupang-capture-detail-preview-grid'
    ));
    return {
      bodyScrollTop: body ? body.scrollTop : 0,
      nodeScrollTops: scrollNodes.map((node) => node.scrollTop)
    };
  }

  function restoreFilterScrollPosition(position) {
    if (!position) {
      return;
    }
    const restore = () => {
      const body = root.querySelector('.coupang-capture-body');
      if (body) {
        body.scrollTop = position.bodyScrollTop;
      }
      Array.from(root.querySelectorAll(
        '.coupang-capture-filter-chips, .coupang-capture-detail-preview-grid'
      )).forEach((node, index) => {
        if (position.nodeScrollTops[index] !== undefined) {
          node.scrollTop = position.nodeScrollTops[index];
        }
      });
    };
    restore();
    requestAnimationFrame(restore);
    // 1688 may finish its detail-image hydration after the first refresh has
    // completed and repaint the filter host once more.  Re-apply the same
    // position after those asynchronous repaints as well.
    setTimeout(restore, 80);
    setTimeout(restore, 400);
  }

  function refreshDataPreservingFilterScroll() {
    const position = captureFilterScrollPosition();
    return refreshData().then(() => {
      restoreFilterScrollPosition(position);
    });
  }

  function toggleZhaojiafangFilter(kind, value) {
    if (SITE !== 'zhaojiafang') {
      return;
    }
    const filter = state.zhaojiafangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    if (target.has(value)) {
      target.delete(value);
    } else {
      target.add(value);
    }
    state.zhaojiafangFilter = filter;
    saveZhaojiafangFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function resetZhaojiafangFilter() {
    if (SITE !== 'zhaojiafang') {
      return;
    }
    state.zhaojiafangFilter = { excludedColors: new Set(), excludedSizes: new Set() };
    saveZhaojiafangFilter(state.zhaojiafangFilter);
    refreshDataPreservingFilterScroll();
  }

  function setZhaojiafangFilterDimension(kind, mode) {
    if (SITE !== 'zhaojiafang') {
      return;
    }
    const meta = state.data && state.data.zhaojiafangMeta && state.data.zhaojiafangMeta.filter ? state.data.zhaojiafangMeta.filter : null;
    const items = kind === 'color' ? meta && meta.colors : meta && meta.sizes;
    const filter = state.zhaojiafangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    target.clear();
    if (mode === 'exclude') {
      (items || []).forEach((item) => {
        if (item && item.name) {
          target.add(item.name);
        }
      });
    }
    state.zhaojiafangFilter = filter;
    saveZhaojiafangFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function renderZhaojiafangFilterPanel() {
    if (SITE !== 'zhaojiafang' || !state.data || !state.data.zhaojiafangMeta || !state.data.zhaojiafangMeta.filter) {
      return '';
    }
    const meta = state.data.zhaojiafangMeta.filter;
    const excludedColors = new Set(meta.excludedColors || []);
    const excludedSizes = new Set(meta.excludedSizes || []);
    const renderChip = (kind, item, excluded) => `
      <button type="button" class="coupang-capture-filter-chip ${excluded ? 'is-excluded' : ''}" data-zjf-filter-kind="${kind}" data-zjf-filter-value="${escapeHtml(item.name)}" title="${excluded ? '点击恢复' : '点击剔除'}：${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <b>${excluded ? '已剔除' : '保留'}</b>
      </button>
    `;
    return `
      <div class="coupang-capture-filter-panel">
        <div class="coupang-capture-filter-head">
          <div>
            <div class="coupang-capture-filter-title">找家纺 SKU 筛选</div>
            <div class="coupang-capture-filter-subtitle">剔除颜色 = 删除该颜色全部尺码；剔除尺码 = 删除所有颜色下该尺码</div>
          </div>
          <button type="button" class="coupang-capture-btn coupang-capture-filter-reset" data-action="zjf-reset-filter">重置筛选</button>
        </div>
        <div class="coupang-capture-filter-count">当前保留 ${meta.filteredOptionCount || 0} / ${meta.rawOptionCount || 0} 个 SKU</div>
        <div class="coupang-capture-filter-group">
          <div class="coupang-capture-filter-group-head">
            <div class="coupang-capture-filter-label">颜色</div>
            <div class="coupang-capture-filter-group-actions">
              <button type="button" data-zjf-filter-dimension="color" data-zjf-filter-mode="include">颜色全选</button>
              <button type="button" data-zjf-filter-dimension="color" data-zjf-filter-mode="exclude">颜色全不选</button>
            </div>
          </div>
          <div class="coupang-capture-filter-chips">
            ${(meta.colors || []).map((item) => renderChip('color', item, excludedColors.has(item.name) || excludedColors.has(item.id))).join('') || '<span class="coupang-capture-filter-empty">无颜色维度</span>'}
          </div>
        </div>
        <div class="coupang-capture-filter-group">
          <div class="coupang-capture-filter-group-head">
            <div class="coupang-capture-filter-label">尺码</div>
            <div class="coupang-capture-filter-group-actions">
              <button type="button" data-zjf-filter-dimension="size" data-zjf-filter-mode="include">尺码全选</button>
              <button type="button" data-zjf-filter-dimension="size" data-zjf-filter-mode="exclude">尺码全不选</button>
            </div>
          </div>
          <div class="coupang-capture-filter-chips">
            ${(meta.sizes || []).map((item) => renderChip('size', item, excludedSizes.has(item.name) || excludedSizes.has(item.id))).join('') || '<span class="coupang-capture-filter-empty">无尺码维度</span>'}
          </div>
        </div>
      </div>
    `;
  }

  function updateZhaojiafangFilterPanel() {
    const host = root.querySelector('.coupang-capture-zjf-filter-host');
    if (!host) {
      return;
    }
    host.innerHTML = renderZhaojiafangFilterPanel();
    host.querySelectorAll('[data-zjf-filter-kind]').forEach((button) => {
      button.addEventListener('click', () => toggleZhaojiafangFilter(button.getAttribute('data-zjf-filter-kind'), button.getAttribute('data-zjf-filter-value')));
    });
    host.querySelectorAll('[data-zjf-filter-dimension]').forEach((button) => {
      button.addEventListener('click', () => setZhaojiafangFilterDimension(button.getAttribute('data-zjf-filter-dimension'), button.getAttribute('data-zjf-filter-mode')));
    });
    const resetButton = host.querySelector('[data-action="zjf-reset-filter"]');
    if (resetButton) {
      resetButton.addEventListener('click', resetZhaojiafangFilter);
    }
  }

  function toggle1688Filter(kind, value) {
    if (SITE !== '1688') {
      return;
    }
    const filter = state.alibaba1688Filter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    if (target.has(value)) {
      target.delete(value);
    } else {
      target.add(value);
    }
    state.alibaba1688Filter = filter;
    save1688Filter(filter);
    refreshDataPreservingFilterScroll();
  }

  function reset1688Filter() {
    if (SITE !== '1688') {
      return;
    }
    state.alibaba1688Filter = { excludedColors: new Set(), excludedSizes: new Set() };
    save1688Filter(state.alibaba1688Filter);
    refreshDataPreservingFilterScroll();
  }

  function set1688FilterDimension(kind, mode) {
    if (SITE !== '1688') {
      return;
    }
    const meta = state.data && state.data.alibaba1688Meta && state.data.alibaba1688Meta.filter ? state.data.alibaba1688Meta.filter : null;
    const items = kind === 'color' ? meta && meta.colors : meta && meta.sizes;
    const filter = state.alibaba1688Filter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    target.clear();
    if (mode === 'exclude') {
      (items || []).forEach((item) => {
        if (item && item.name) {
          target.add(item.name);
        }
      });
    }
    state.alibaba1688Filter = filter;
    save1688Filter(filter);
    refreshDataPreservingFilterScroll();
  }

  function render1688FilterPanel() {
    if (SITE !== '1688' || !state.data || !state.data.alibaba1688Meta || !state.data.alibaba1688Meta.filter) {
      return '';
    }
    const meta = state.data.alibaba1688Meta.filter;
    const excludedColors = new Set(meta.excludedColors || []);
    const excludedSizes = new Set(meta.excludedSizes || []);
    const renderChip = (kind, item, excluded) => `
      <button type="button" class="coupang-capture-filter-chip ${excluded ? 'is-excluded' : ''}" data-1688-filter-kind="${kind}" data-1688-filter-value="${escapeHtml(item.name)}" title="${excluded ? '点击恢复' : '点击剔除'}：${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <b>${excluded ? '已剔除' : '保留'}</b>
      </button>
    `;
    return `
      <div class="coupang-capture-filter-panel">
        <div class="coupang-capture-filter-head">
          <div>
            <div class="coupang-capture-filter-title">1688 SKU 筛选</div>
            <div class="coupang-capture-filter-subtitle">剔除颜色 = 删除该颜色全部规格；剔除尺码/规格 = 删除所有颜色下该规格</div>
          </div>
          <button type="button" class="coupang-capture-btn coupang-capture-filter-reset" data-action="1688-reset-filter">重置筛选</button>
        </div>
        <div class="coupang-capture-filter-count">当前保留 ${meta.filteredOptionCount || 0} / ${meta.rawOptionCount || 0} 个 SKU</div>
        <div class="coupang-capture-filter-group">
          <div class="coupang-capture-filter-group-head">
            <div class="coupang-capture-filter-label">颜色/款式</div>
            <div class="coupang-capture-filter-group-actions">
              <button type="button" data-1688-filter-dimension="color" data-1688-filter-mode="include">颜色全选</button>
              <button type="button" data-1688-filter-dimension="color" data-1688-filter-mode="exclude">颜色全不选</button>
            </div>
          </div>
          <div class="coupang-capture-filter-chips">
            ${(meta.colors || []).map((item) => renderChip('color', item, excludedColors.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无颜色/款式维度</span>'}
          </div>
        </div>
        <div class="coupang-capture-filter-group">
          <div class="coupang-capture-filter-group-head">
              <div class="coupang-capture-filter-label">${escapeHtml(meta.secondDimensionLabel || '尺码/规格')}</div>
            <div class="coupang-capture-filter-group-actions">
              <button type="button" data-1688-filter-dimension="size" data-1688-filter-mode="include">尺码全选</button>
              <button type="button" data-1688-filter-dimension="size" data-1688-filter-mode="exclude">尺码全不选</button>
            </div>
          </div>
          <div class="coupang-capture-filter-chips">
            ${(meta.sizes || []).map((item) => renderChip('size', item, excludedSizes.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无尺码/规格维度</span>'}
          </div>
        </div>
      </div>
    `;
  }

  function update1688FilterPanel() {
    const host = root.querySelector('.coupang-capture-1688-filter-host');
    if (!host) {
      return;
    }
    host.innerHTML = render1688FilterPanel();
    host.querySelectorAll('[data-1688-filter-kind]').forEach((button) => {
      button.addEventListener('click', () => toggle1688Filter(button.getAttribute('data-1688-filter-kind'), button.getAttribute('data-1688-filter-value')));
    });
    host.querySelectorAll('[data-1688-filter-dimension]').forEach((button) => {
      button.addEventListener('click', () => set1688FilterDimension(button.getAttribute('data-1688-filter-dimension'), button.getAttribute('data-1688-filter-mode')));
    });
    const resetButton = host.querySelector('[data-action="1688-reset-filter"]');
    if (resetButton) {
      resetButton.addEventListener('click', reset1688Filter);
    }
  }

  function isCoupangOptionExcluded(option) {
    const filter = state.coupangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return filter.excludedColors.has(option.color)
      || filter.excludedSizes.has(option.size);
  }

  function applyCoupangOptionFilter(options) {
    if (SITE !== 'coupang') {
      return options;
    }
    return (options || []).filter((option) => !isCoupangOptionExcluded(option));
  }

  function extractCoupangFilterMeta(rawOptions, filteredOptions) {
    const filter = state.coupangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return {
      colors: getUniqueDimensionItemsFromOptions(rawOptions, 'color', 0),
      sizes: getUniqueDimensionItemsFromOptions(rawOptions, 'size', 1),
      excludedColors: Array.from(filter.excludedColors || []),
      excludedSizes: Array.from(filter.excludedSizes || []),
      rawOptionCount: rawOptions ? rawOptions.length : 0,
      filteredOptionCount: filteredOptions ? filteredOptions.length : 0
    };
  }

  function toggleCoupangFilter(kind, value) {
    if (SITE !== 'coupang') {
      return;
    }
    const filter = state.coupangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    if (target.has(value)) {
      target.delete(value);
    } else {
      target.add(value);
    }
    state.coupangFilter = filter;
    saveCoupangFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function resetCoupangFilter() {
    if (SITE !== 'coupang') {
      return;
    }
    state.coupangFilter = { excludedColors: new Set(), excludedSizes: new Set() };
    saveCoupangFilter(state.coupangFilter);
    refreshDataPreservingFilterScroll();
  }

  function setCoupangFilterDimension(kind, mode) {
    if (SITE !== 'coupang') {
      return;
    }
    const meta = state.data && state.data.coupangMeta && state.data.coupangMeta.filter;
    const items = kind === 'color' ? meta && meta.colors : meta && meta.sizes;
    const filter = state.coupangFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    target.clear();
    if (mode === 'exclude') {
      (items || []).forEach((item) => {
        if (item && item.name) {
          target.add(item.name);
        }
      });
    }
    state.coupangFilter = filter;
    saveCoupangFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function renderCoupangFilterPanel() {
    if (SITE !== 'coupang' || !state.data || !state.data.coupangMeta || !state.data.coupangMeta.filter) {
      return '';
    }
    const meta = state.data.coupangMeta.filter;
    const excludedColors = new Set(meta.excludedColors || []);
    const excludedSizes = new Set(meta.excludedSizes || []);
    const renderChip = (kind, item, excluded) => `
      <button type="button" class="coupang-capture-filter-chip ${excluded ? 'is-excluded' : ''}" data-coupang-filter-kind="${kind}" data-coupang-filter-value="${escapeHtml(item.name)}" title="${excluded ? '点击恢复' : '点击剔除'}：${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span><b>${excluded ? '已剔除' : '保留'}</b>
      </button>`;
    return `
      <div class="coupang-capture-filter-panel">
        <div class="coupang-capture-filter-head">
          <div><div class="coupang-capture-filter-title">Coupang SKU 筛选</div><div class="coupang-capture-filter-subtitle">剔除颜色会删除该颜色全部尺码；剔除尺码会删除所有颜色下该尺码</div></div>
          <button type="button" class="coupang-capture-btn coupang-capture-filter-reset" data-action="coupang-reset-filter">重置筛选</button>
        </div>
        <div class="coupang-capture-filter-count">当前保留 ${meta.filteredOptionCount || 0} / ${meta.rawOptionCount || 0} 个 SKU</div>
        <div class="coupang-capture-filter-group"><div class="coupang-capture-filter-group-head"><div class="coupang-capture-filter-label">颜色</div><div class="coupang-capture-filter-group-actions"><button type="button" data-coupang-filter-dimension="color" data-coupang-filter-mode="include">颜色全选</button><button type="button" data-coupang-filter-dimension="color" data-coupang-filter-mode="exclude">颜色全不选</button></div></div><div class="coupang-capture-filter-chips">${(meta.colors || []).map((item) => renderChip('color', item, excludedColors.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无颜色维度</span>'}</div></div>
        <div class="coupang-capture-filter-group"><div class="coupang-capture-filter-group-head"><div class="coupang-capture-filter-label">尺码</div><div class="coupang-capture-filter-group-actions"><button type="button" data-coupang-filter-dimension="size" data-coupang-filter-mode="include">尺码全选</button><button type="button" data-coupang-filter-dimension="size" data-coupang-filter-mode="exclude">尺码全不选</button></div></div><div class="coupang-capture-filter-chips">${(meta.sizes || []).map((item) => renderChip('size', item, excludedSizes.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无尺码维度</span>'}</div></div>
      </div>`;
  }

  function updateCoupangFilterPanel() {
    const host = root.querySelector('.coupang-capture-coupang-filter-host');
    if (!host) {
      return;
    }
    host.innerHTML = renderCoupangFilterPanel();
    host.querySelectorAll('[data-coupang-filter-kind]').forEach((button) => {
      button.addEventListener('click', () => toggleCoupangFilter(button.getAttribute('data-coupang-filter-kind'), button.getAttribute('data-coupang-filter-value')));
    });
    host.querySelectorAll('[data-coupang-filter-dimension]').forEach((button) => {
      button.addEventListener('click', () => setCoupangFilterDimension(button.getAttribute('data-coupang-filter-dimension'), button.getAttribute('data-coupang-filter-mode')));
    });
    const resetButton = host.querySelector('[data-action="coupang-reset-filter"]');
    if (resetButton) {
      resetButton.addEventListener('click', resetCoupangFilter);
    }
  }

  function isTaobaoOptionExcluded(option) {
    const filter = state.taobaoFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return filter.excludedColors.has(option.color)
      || filter.excludedSizes.has(option.size);
  }

  function applyTaobaoOptionFilter(options) {
    if (SITE !== 'taobao') {
      return options;
    }
    return (options || []).filter((option) => !isTaobaoOptionExcluded(option));
  }

  function extractTaobaoFilterMeta(rawOptions, filteredOptions) {
    const filter = state.taobaoFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    return {
      colors: getUniqueDimensionItemsFromOptions(rawOptions, 'color', 0),
      sizes: getUniqueDimensionItemsFromOptions(rawOptions, 'size', 1),
      excludedColors: Array.from(filter.excludedColors || []),
      excludedSizes: Array.from(filter.excludedSizes || []),
      rawOptionCount: rawOptions ? rawOptions.length : 0,
      filteredOptionCount: filteredOptions ? filteredOptions.length : 0
    };
  }

  function toggleTaobaoFilter(kind, value) {
    const filter = state.taobaoFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    if (target.has(value)) {
      target.delete(value);
    } else {
      target.add(value);
    }
    state.taobaoFilter = filter;
    saveTaobaoFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function resetTaobaoFilter() {
    state.taobaoFilter = { excludedColors: new Set(), excludedSizes: new Set() };
    saveTaobaoFilter(state.taobaoFilter);
    refreshDataPreservingFilterScroll();
  }

  function setTaobaoFilterDimension(kind, mode) {
    const meta = state.data && state.data.taobaoMeta && state.data.taobaoMeta.filter;
    const items = kind === 'color' ? meta && meta.colors : meta && meta.sizes;
    const filter = state.taobaoFilter || { excludedColors: new Set(), excludedSizes: new Set() };
    const target = kind === 'color' ? filter.excludedColors : filter.excludedSizes;
    target.clear();
    if (mode === 'exclude') {
      (items || []).forEach((item) => item && item.name && target.add(item.name));
    }
    state.taobaoFilter = filter;
    saveTaobaoFilter(filter);
    refreshDataPreservingFilterScroll();
  }

  function renderTaobaoFilterPanel() {
    if (SITE !== 'taobao' || !state.data || !state.data.taobaoMeta || !state.data.taobaoMeta.filter) {
      return '';
    }
    const meta = state.data.taobaoMeta.filter;
    const excludedColors = new Set(meta.excludedColors || []);
    const excludedSizes = new Set(meta.excludedSizes || []);
    const renderChip = (kind, item, excluded) => `<button type="button" class="coupang-capture-filter-chip ${excluded ? 'is-excluded' : ''}" data-taobao-filter-kind="${kind}" data-taobao-filter-value="${escapeHtml(item.name)}" title="${excluded ? '点击恢复' : '点击剔除'}：${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><b>${excluded ? '已剔除' : '保留'}</b></button>`;
    return `<div class="coupang-capture-filter-panel"><div class="coupang-capture-filter-head"><div><div class="coupang-capture-filter-title">淘宝 SKU 筛选</div><div class="coupang-capture-filter-subtitle">剔除颜色会删除该颜色全部尺码；剔除尺码会删除所有颜色下该尺码</div></div><button type="button" class="coupang-capture-btn coupang-capture-filter-reset" data-action="taobao-reset-filter">重置筛选</button></div><div class="coupang-capture-filter-count">当前保留 ${meta.filteredOptionCount || 0} / ${meta.rawOptionCount || 0} 个 SKU</div><div class="coupang-capture-filter-group"><div class="coupang-capture-filter-group-head"><div class="coupang-capture-filter-label">颜色</div><div class="coupang-capture-filter-group-actions"><button type="button" data-taobao-filter-dimension="color" data-taobao-filter-mode="include">颜色全选</button><button type="button" data-taobao-filter-dimension="color" data-taobao-filter-mode="exclude">颜色全不选</button></div></div><div class="coupang-capture-filter-chips">${(meta.colors || []).map((item) => renderChip('color', item, excludedColors.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无颜色维度</span>'}</div></div><div class="coupang-capture-filter-group"><div class="coupang-capture-filter-group-head"><div class="coupang-capture-filter-label">尺码</div><div class="coupang-capture-filter-group-actions"><button type="button" data-taobao-filter-dimension="size" data-taobao-filter-mode="include">尺码全选</button><button type="button" data-taobao-filter-dimension="size" data-taobao-filter-mode="exclude">尺码全不选</button></div></div><div class="coupang-capture-filter-chips">${(meta.sizes || []).map((item) => renderChip('size', item, excludedSizes.has(item.name))).join('') || '<span class="coupang-capture-filter-empty">无尺码维度</span>'}</div></div></div>`;
  }

  function updateTaobaoFilterPanel() {
    const host = root.querySelector('.coupang-capture-taobao-filter-host');
    if (!host) {
      return;
    }
    host.innerHTML = renderTaobaoFilterPanel();
    host.querySelectorAll('[data-taobao-filter-kind]').forEach((button) => button.addEventListener('click', () => toggleTaobaoFilter(button.getAttribute('data-taobao-filter-kind'), button.getAttribute('data-taobao-filter-value'))));
    host.querySelectorAll('[data-taobao-filter-dimension]').forEach((button) => button.addEventListener('click', () => setTaobaoFilterDimension(button.getAttribute('data-taobao-filter-dimension'), button.getAttribute('data-taobao-filter-mode'))));
    const resetButton = host.querySelector('[data-action="taobao-reset-filter"]');
    if (resetButton) {
      resetButton.addEventListener('click', resetTaobaoFilter);
    }
  }

  function refreshDetailImageStateStatus(message) {
    if (!state.data) {
      return;
    }
    rebuildOutput(state.data);
    const textarea = root.querySelector('.coupang-capture-text');
    if (textarea) {
      textarea.value = state.data.aiText || state.data.text;
    }
    updateDetailImagePreview(state.data);
    setStatus(message, 'is-success');
  }

  function toggleDetailImageIncluded(url) {
    if (!url) {
      return;
    }
    const excluded = state.excludedDetailImages || new Set();
    if (excluded.has(url)) {
      excluded.delete(url);
    } else {
      excluded.add(url);
      if (state.sideChatDetailImages) {
        state.sideChatDetailImages.delete(url);
        saveSideChatDetailImages(state.sideChatDetailImages);
      }
      if (state.sizeChartDetailImages) {
        state.sizeChartDetailImages.delete(url);
        saveSizeChartDetailImages(state.sizeChartDetailImages);
      }
    }
    state.excludedDetailImages = excluded;
    saveExcludedDetailImages(excluded);
    refreshDetailImageStateStatus(excluded.has(url) ? '已从 Detail Images 中剔除' : '已恢复到 Detail Images');
  }

  function toggleSideChatDetailImage(url) {
    if (!url) {
      return;
    }
    if (state.excludedDetailImages && state.excludedDetailImages.has(url)) {
      return;
    }
    const selected = state.sideChatDetailImages || new Set();
    if (selected.has(url)) {
      selected.delete(url);
    } else {
      selected.add(url);
    }
    state.sideChatDetailImages = selected;
    saveSideChatDetailImages(selected);
    refreshDetailImageStateStatus(selected.has(url) ? '已标记为 Side Chat Image' : '已取消 Side Chat Image 标记');
  }

  function toggleSizeChartDetailImage(url) {
    if (!url) {
      return;
    }
    if (state.excludedDetailImages && state.excludedDetailImages.has(url)) {
      return;
    }
    const selected = state.sizeChartDetailImages || new Set();
    if (selected.has(url)) {
      selected.delete(url);
    } else {
      selected.add(url);
    }
    state.sizeChartDetailImages = selected;
    saveSizeChartDetailImages(selected);
    refreshDetailImageStateStatus(selected.has(url) ? '已标记：该图包含需提取/翻译的商品信息' : '已取消商品信息处理标记');
  }

  function setAllDetailImagesIncluded(includeAll) {
    const detailImages = getPreviewDetailImages(state.data);
    const excluded = state.excludedDetailImages || new Set();
    excluded.clear();
    if (!includeAll) {
      detailImages.forEach((url) => excluded.add(url));
      if (state.sideChatDetailImages) {
        state.sideChatDetailImages.clear();
        saveSideChatDetailImages(state.sideChatDetailImages);
      }
      if (state.sizeChartDetailImages) {
        state.sizeChartDetailImages.clear();
        saveSizeChartDetailImages(state.sizeChartDetailImages);
      }
    }
    state.excludedDetailImages = excluded;
    saveExcludedDetailImages(excluded);
    refreshDetailImageStateStatus(includeAll ? '详情图已全选' : '详情图已全不选');
  }

  function clearMissingDetailImageSelections(detailImages) {
    const valid = new Set(detailImages || []);
    let changed = false;
    [
      ['sideChatDetailImages', saveSideChatDetailImages],
      ['excludedDetailImages', saveExcludedDetailImages],
      ['sizeChartDetailImages', saveSizeChartDetailImages]
    ].forEach(([key, saver]) => {
      const selected = state[key] || new Set();
      let bucketChanged = false;
      Array.from(selected).forEach((url) => {
        if (!valid.has(url)) {
          selected.delete(url);
          changed = true;
          bucketChanged = true;
        }
      });
      state[key] = selected;
      if (bucketChanged) {
        saver(selected);
      }
    });
  }

  function updateDetailImagePreview(data) {
    const preview = root.querySelector('.coupang-capture-detail-preview');
    if (!preview) {
      return;
    }
    const body = root.querySelector('.coupang-capture-body');
    const detailGrid = preview.querySelector('.coupang-capture-detail-preview-grid');
    const bodyScrollTop = body ? body.scrollTop : 0;
    const detailGridScrollTop = detailGrid ? detailGrid.scrollTop : 0;
    const detailImages = getPreviewDetailImages(data);
    clearMissingDetailImageSelections(detailImages);
    if (!detailImages.length) {
      const meta = data && data.alibaba1688Meta;
      if (SITE === '1688' && meta && meta.detailLoading) {
        preview.innerHTML = '<div class="coupang-capture-preview-empty">1688 详情图正在加载，稍候会显示可点击挑选的图片。</div>';
      } else if (SITE === '1688' && meta && meta.detailError) {
        preview.innerHTML = `<div class="coupang-capture-preview-empty">1688 详情图暂未获取：${escapeHtml(meta.detailError)}。可点击“重新采集”再试。</div>`;
      } else {
        preview.innerHTML = '';
      }
      return;
    }
    const excluded = state.excludedDetailImages || new Set();
    const sizeChartSelected = state.sizeChartDetailImages || new Set();
    preview.innerHTML = `
      <div class="coupang-capture-detail-preview-head">
        <div class="coupang-capture-preview-title">详情图预览（详情图 / 商品信息处理）</div>
        <div class="coupang-capture-detail-preview-actions">
          <button type="button" data-detail-bulk-include="all">详情全选</button>
          <button type="button" data-detail-bulk-include="none">详情全不选</button>
        </div>
      </div>
      <div class="coupang-capture-detail-preview-grid">
        ${detailImages.slice(0, 80).map((url, index) => {
          const isExcluded = excluded.has(url);
          const isSizeChart = sizeChartSelected.has(url) && !isExcluded;
          return `
            <div class="coupang-capture-detail-card ${isExcluded ? 'is-excluded' : 'is-selected'} ${isSizeChart ? 'is-size-chart' : ''}" title="${escapeHtml(url)}">
              <img src="${escapeHtml(url)}" alt="detail image ${index + 1}" title="点击图片切换是否传入详情图" loading="lazy" data-detail-image-url="${escapeHtml(url)}">
              <div class="coupang-capture-detail-card-controls">
                <label><input type="checkbox" data-detail-include-url="${escapeHtml(url)}" ${isExcluded ? '' : 'checked'}> 详情图</label>
                <label><input type="checkbox" data-size-chart-detail-url="${escapeHtml(url)}" ${isSizeChart ? 'checked' : ''} ${isExcluded ? 'disabled' : ''}> 信息处理</label>
              </div>
              <span>${index + 1}${isExcluded ? ' · 不传' : ''}${isSizeChart ? ' · 尺码源' : ''}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    preview.querySelectorAll('[data-detail-include-url]').forEach((checkbox) => {
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => toggleDetailImageIncluded(checkbox.getAttribute('data-detail-include-url')));
    });
    preview.querySelectorAll('[data-detail-image-url]').forEach((image) => {
      image.addEventListener('click', () => toggleDetailImageIncluded(image.getAttribute('data-detail-image-url')));
    });
    preview.querySelectorAll('[data-detail-bulk-include]').forEach((button) => {
      button.addEventListener('click', () => setAllDetailImagesIncluded(button.getAttribute('data-detail-bulk-include') === 'all'));
    });
    preview.querySelectorAll('[data-size-chart-detail-url]').forEach((checkbox) => {
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => toggleSizeChartDetailImage(checkbox.getAttribute('data-size-chart-detail-url')));
    });
    if (body) {
      body.scrollTop = bodyScrollTop;
    }
    const refreshedGrid = preview.querySelector('.coupang-capture-detail-preview-grid');
    if (refreshedGrid) {
      refreshedGrid.scrollTop = detailGridScrollTop;
      requestAnimationFrame(() => {
        if (body) {
          body.scrollTop = bodyScrollTop;
        }
        refreshedGrid.scrollTop = detailGridScrollTop;
      });
    }
  }

  function getColorImagePreviewSource(options) {
    const unique = [];
    const seen = new Set();
    (options || []).filter((option) => option && option.image).forEach((option) => {
      const colorName = option.colorName || normalize(String(option.name || '').split('/')[0]) || option.name || '';
      const key = `${colorName}|${option.image}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push({
        ...option,
        name: colorName
      });
    });
    return unique;
  }

  function updateSkuPreview(data) {
    const preview = root.querySelector('.coupang-capture-sku-preview');
    if (!preview) {
      return;
    }
    const previewSource = SITE === 'taobao' && data && data.taobaoMode === 'matrix'
      ? (data.taobaoSkuMatrix || []).map((sku) => ({ name: sku.color || sku.name || '', image: sku.image || '' }))
      : (SITE === 'pinduoduo' || SITE === '1688')
        ? getColorImagePreviewSource((data && data.options) || [])
        : ((data && data.options) || []);
    const imageOptions = previewSource.filter((option) => option.image);
    if (!imageOptions.length) {
      preview.innerHTML = SITE === 'taobao'
        ? '<div class="coupang-capture-preview-empty">暂无 SKU 图预览；矩阵模式只显示初始化数据图片，选择采集模式显示点击记录图片。</div>'
        : '';
      return;
    }
    const unique = [];
    const seen = new Set();
    imageOptions.forEach((option) => {
      const key = (SITE === 'pinduoduo' || SITE === '1688') ? `${option.name}|${option.image}` : `${option.name}|${option.image}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(option);
    });
    preview.innerHTML = `
      <div class="coupang-capture-preview-title">SKU 图预览（仅用于核对，JSON 仍只复制图片链接）</div>
      <div class="coupang-capture-preview-grid">
        ${unique.slice(0, 24).map((option) => `
          <div class="coupang-capture-preview-card" title="${escapeHtml(option.name)}">
            <img src="${escapeHtml(option.image)}" alt="${escapeHtml(option.name)}" loading="lazy">
            <div class="coupang-capture-preview-name">${escapeHtml(option.name)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function mergeTmallShopPayloadItems(basePayload, extraItems, source) {
    const merged = new Map();
    const baseItems = basePayload && Array.isArray(basePayload.items) ? basePayload.items : [];
    baseItems.forEach((item) => {
      if (item && item.itemId) {
        merged.set(String(item.itemId), item);
      }
    });
    (Array.isArray(extraItems) ? extraItems : []).forEach((item) => {
      if (!item || !item.itemId) {
        return;
      }
      const key = String(item.itemId);
      const old = merged.get(key) || {};
      merged.set(key, { ...old, ...item, itemId: key });
    });
    return {
      __captureSource: source || (basePayload && basePayload.__captureSource) || '',
      __capturedAt: new Date().toISOString(),
      shopUrl: location.href,
      items: Array.from(merged.values())
    };
  }

  async function hydrateTmallShopItemsFromPerformance(data) {
    if (SITE !== 'tmall-shop' || !data) {
      return data;
    }
    const urls = getTmallShopItemFetchUrls();
    if (!urls.length) {
      return data;
    }
    let payload = getTmallShopCapturedPayload() || {
      __captureSource: '',
      __capturedAt: '',
      shopUrl: location.href,
      items: []
    };
    let changed = false;
    for (const url of urls.slice().reverse()) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        const text = await response.text();
        const items = parseTmallShopItemsFromText(text, `content-resource-fetch:${url}`);
        if (!items.length) {
          continue;
        }
        const before = new Set((payload.items || []).map((item) => String(item.itemId || '')).filter(Boolean));
        payload = mergeTmallShopPayloadItems(payload, items, `content-resource-fetch:${url}`);
        const afterCount = (payload.items || []).filter((item) => item && item.itemId).length;
        if (afterCount > before.size) {
          changed = true;
        }
      } catch (error) {
        console.warn('[Product AI Capture] shop item fetch hydrate failed', error);
      }
    }
    if (changed || !data.options.length) {
      window.__PRODUCT_AI_CAPTURE_TMALL_SHOP__ = payload;
      try {
        document.documentElement.setAttribute('data-product-ai-tmall-shop-summary', JSON.stringify(payload).slice(0, 500000));
      } catch (error) {}
      data.tmallShopMeta = extractTmallShopMeta(payload);
      data.options = extractTmallShopOptions(payload);
      data.mainImages = data.options.map((item) => item.image).filter(Boolean);
      rebuildOutput(data);
    }
    return data;
  }

  async function hydrate1688DetailImages(data) {
    if (SITE !== '1688' || !data || !data.alibaba1688Meta || !data.alibaba1688Meta.detailUrl || data.alibaba1688Meta.detailLoading || data.alibaba1688Meta.detailHtml) {
      return data;
    }
    data.alibaba1688Meta.detailLoading = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'fetch-1688-detail',
        payload: { detailUrl: data.alibaba1688Meta.detailUrl }
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : '1688 详情获取失败');
      }
      data.alibaba1688Meta.detailHtml = response.content || response.html || '';
      data.alibaba1688Meta.detailError = '';
      const hydratedImages = Array.isArray(response.images) && response.images.length
        ? filter1688DetailImages(response.images, data.mainImages || [])
        : extract1688DetailImagesFromHtml(response.text || response.html || response.content || '', data.mainImages || []);
      const existingPreviewImages = getPreviewDetailImages(data);
      data.rawDetailImages = uniqueList(hydratedImages.length ? hydratedImages : existingPreviewImages);
      data.detailImages = data.rawDetailImages.filter((url) => !(state.excludedDetailImages && state.excludedDetailImages.has(url)));
    } catch (error) {
      data.alibaba1688Meta.detailError = error.message || String(error);
      console.warn('[Product AI Capture] 1688 detail hydrate failed', error);
    } finally {
      data.alibaba1688Meta.detailLoading = false;
      rebuildOutput(data);
    }
    return data;
  }

  async function hydrateZhaojiafangQuickImageRar(data) {
    if (SITE !== 'zhaojiafang' || !data || !data.zhaojiafangMeta) {
      return data;
    }
    const meta = data.zhaojiafangMeta;
    if (!meta.currentSkuId || !meta.spuId || meta.quickImageRarUrl || meta.quickImageRarLoading) {
      return data;
    }
    meta.quickImageRarLoading = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'zhaojiafang-quick-image-rar',
        payload: {
          goodsId: meta.currentSkuId,
          goodsCommonid: meta.spuId
        }
      });
      if (!response || !response.ok || !response.quickImageRarUrl) {
        throw new Error(response && response.error ? response.error : '快速下图 RAR 链接获取失败');
      }
      meta.quickImageRarUrl = response.quickImageRarUrl;
      meta.quickImageRarError = '';
    } catch (error) {
      meta.quickImageRarError = error.message || String(error);
      console.warn('[Product AI Capture] quick image rar failed', error);
    } finally {
      meta.quickImageRarLoading = false;
      rebuildOutput(data);
    }
    return data;
  }

  function setStatus(message, type = '') {
    state.status = message;
    const node = root.querySelector('.coupang-capture-status');
    if (!node) {
      return;
    }
    node.textContent = message || '';
    node.className = 'coupang-capture-status';
    if (type) {
      node.classList.add(type);
    }
  }

  async function refreshData() {
    try {
      const data = collectData();
      state.data = data;
      if (SITE === 'zhaojiafang') {
        hydrateZhaojiafangQuickImageRar(data).then((updatedData) => {
          if (state.data !== updatedData) {
            return;
          }
          const textarea = root.querySelector('.coupang-capture-text');
          if (textarea) {
            textarea.value = updatedData.aiText || updatedData.text;
          }
          updateSkuPreview(updatedData)
          updateDetailImagePreview(updatedData);
          updateZhaojiafangFilterPanel();
          const suffix = updatedData.zhaojiafangMeta && updatedData.zhaojiafangMeta.quickImageRarUrl ? '，已获取快速下图RAR' : '';
          const rawCount = updatedData.zhaojiafangMeta && updatedData.zhaojiafangMeta.filter ? updatedData.zhaojiafangMeta.filter.rawOptionCount : updatedData.options.length;
          setStatus(`已提取：${updatedData.options.length}/${rawCount} 个找家纺 SKU，${updatedData.mainImages.length} 张当前SKU图，${updatedData.detailImages.length} 张详情/副图${suffix}`, updatedData.zhaojiafangMeta && updatedData.zhaojiafangMeta.quickImageRarError ? 'is-error' : 'is-success');
        });
      }
      if (SITE === 'tmall-shop') {
        hydrateTmallShopItemsFromPerformance(data).then((updatedData) => {
          if (state.data !== updatedData) {
            return;
          }
          const textarea = root.querySelector('.coupang-capture-text');
          if (textarea) {
            textarea.value = updatedData.aiText || updatedData.text;
          }
          updateSkuPreview(updatedData);
          updateDetailImagePreview(updatedData);
          const sourceText = updatedData.tmallShopMeta && updatedData.tmallShopMeta.captureSource ? `，来源：${updatedData.tmallShopMeta.captureSource.split(':')[0]}` : '';
          setStatus(`已截获：${updatedData.options.length} 个淘宝/天猫商品ID${sourceText}`, updatedData.options.length ? 'is-success' : 'is-error');
        });
      }
      if (SITE === '1688') {
        hydrate1688DetailImages(data).then((updatedData) => {
          if (state.data !== updatedData) {
            return;
          }
          const textarea = root.querySelector('.coupang-capture-text');
          if (textarea) {
            textarea.value = updatedData.aiText || updatedData.text;
          }
          updateSkuPreview(updatedData);
          updateDetailImagePreview(updatedData);
          update1688FilterPanel();
          updateTaobaoFilterPanel();
          updateCoupangFilterPanel();
          const suffix = updatedData.alibaba1688Meta && updatedData.alibaba1688Meta.detailError ? `，详情获取失败：${updatedData.alibaba1688Meta.detailError}` : '';
          const rawCount = updatedData.alibaba1688Meta && updatedData.alibaba1688Meta.filter ? updatedData.alibaba1688Meta.filter.rawOptionCount : updatedData.options.length;
          setStatus(`已提取：${updatedData.options.length}/${rawCount} 个 1688 SKU，${updatedData.mainImages.length} 张主副图，${updatedData.detailImages.length} 张详情图${suffix}`, updatedData.alibaba1688Meta && updatedData.alibaba1688Meta.detailError ? 'is-error' : rawCount ? 'is-success' : 'is-error');
        });
      }
      const textarea = root.querySelector('.coupang-capture-text');
      if (textarea) {
        textarea.value = data.aiText || data.text;
      }
      updateSkuPreview(data)
      updateDetailImagePreview(data);
      updateZhaojiafangFilterPanel();
      update1688FilterPanel();
      updateTaobaoFilterPanel();
      updateCoupangFilterPanel();
      if (SITE === '1688-shop') {
        const sourceText = data.alibabaShopMeta && data.alibabaShopMeta.captureSource ? `，来源：${data.alibabaShopMeta.captureSource.split(':')[0]}` : '';
        setStatus(`已累计：${data.options.length} 个 1688 新品 offer_id${sourceText}`, data.options.length ? 'is-success' : 'is-error');
      } else if (SITE === 'coupang-shop') {
        const crawled = state.coupangShopCrawledProducts.length;
        const total = data.coupangShopProducts ? data.coupangShopProducts.length : 0;
        setStatus(`店铺页：发现 ${total} 个 product_id，已采集详情 ${crawled} 个${state.coupangShopCrawlRunning ? '，正在采集中…' : ''}`, total ? 'is-success' : 'is-error');
      } else if (SITE === '1688') {
        const rawCount = data.alibaba1688Meta && data.alibaba1688Meta.filter ? data.alibaba1688Meta.filter.rawOptionCount : data.options.length;
        setStatus(`已提取：${data.options.length}/${rawCount} 个 1688 SKU，${data.mainImages.length} 张主副图，${data.detailImages.length} 张详情图${data.alibaba1688Meta && data.alibaba1688Meta.detailUrl ? '，正在补全详情' : ''}`, rawCount ? 'is-success' : 'is-error');
      } else if (SITE === 'tmall-shop') {
        const sourceText = data.tmallShopMeta && data.tmallShopMeta.captureSource ? `，来源：${data.tmallShopMeta.captureSource.split(':')[0]}` : '';
        setStatus(`已截获：${data.options.length} 个淘宝/天猫商品ID${sourceText}`, data.options.length ? 'is-success' : 'is-error');
      } else if (SITE === 'naver-smartstore') {
        setStatus(`已提取：${data.options.length} 个 SmartStore 选项，${data.mainImages.length} 张主副图，${data.detailImages.length} 张详情图`, 'is-success');
      } else if (SITE === 'cafe24') {
        setStatus(`已提取：${data.options.length} 个 Cafe24 选项，${data.mainImages.length} 张主副图，${data.detailImages.length} 张详情图`, data.options.length || data.mainImages.length ? 'is-success' : 'is-error');
      } else if (SITE === 'temu') {
        const sourceText = data.temuMeta && data.temuMeta.captureSource ? `，来源：${data.temuMeta.captureSource}` : '';
        setStatus(`已提取：${data.options.length} 个 Temu SKU，${data.mainImages.length} 张主图，${data.detailImages.length} 张详情图${sourceText}`, data.options.length || data.mainImages.length || data.detailImages.length ? 'is-success' : 'is-error');
      } else if (SITE === 'pinduoduo') {
        const sourceText = data.pddMeta && data.pddMeta.captureSource ? `，来源：${data.pddMeta.captureSource}` : '';
        setStatus(`已提取：${data.options.length} 个 PDD SKU，${data.mainImages.length} 张主图，${data.detailImages.length} 张详情图${sourceText}`, data.options.length || data.detailImages.length ? 'is-success' : 'is-error');
      } else if (SITE === 'taobao') {
        if (data.taobaoMode === 'selected') {
          setStatus(`选择采集：${data.options.length} 个已点击选项，${data.taobaoSizes ? data.taobaoSizes.length : 0} 个尺码，${data.mainImages.length} 张主图，${data.detailImages.length} 张详情图`, data.options.length ? 'is-success' : 'is-error');
        } else {
          const filter = data.taobaoMeta && data.taobaoMeta.filter;
          const matrixCount = data.taobaoSkuMatrix ? data.taobaoSkuMatrix.length : 0;
          const matrixTotal = filter ? filter.rawOptionCount : matrixCount;
          setStatus(`SKU矩阵：${matrixCount}/${matrixTotal} 个唯一SKU，${data.mainImages.length} 张主图，${data.detailImages.length} 张详情图`, matrixCount || matrixTotal ? 'is-success' : 'is-error');
        }
      } else if (SITE === 'zhaojiafang') {
        const rawCount = data.zhaojiafangMeta && data.zhaojiafangMeta.filter ? data.zhaojiafangMeta.filter.rawOptionCount : data.options.length;
        setStatus(`已提取：${data.options.length}/${rawCount} 个找家纺 SKU，${data.mainImages.length} 张当前SKU图，${data.detailImages.length} 张详情/副图`, 'is-success');
      } else if (SITE === 'onch3') {
        const lockedText = data.optionsLocked ? '，选项受权限限制' : '';
        setStatus(`已提取：${data.options.length} 个 Onch3 选项，${data.mainImages.length} 张主图，${data.detailImages.length} 张详情图${lockedText}`, data.optionsLocked ? 'is-error' : 'is-success');
      } else {
        setStatus(`已提取：${data.options.length} 个选项，${data.detailImages.length} 张详情图`, 'is-success');
      }
    } catch (error) {
      console.error('[Coupang Capture] refresh failed', error);
      setStatus(`提取失败：${error.message || error}`, 'is-error');
    }
  }

  async function copyText() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    if (!confirmCopyWithoutSizeChart()) {
      return;
    }
    await navigator.clipboard.writeText(state.data.aiText || state.data.text);
    setStatus('AI 文本已复制', 'is-success');
  }

  async function copyTmallShopProductIds() {
    if (SITE !== 'tmall-shop') {
      return;
    }
    if (!state.data) {
      await refreshData();
    }
    const ids = Array.from(new Set(
      ((state.data && state.data.options) || [])
        .map((item) => String(item.itemId || '').trim())
        .filter(Boolean)
    ));
    if (!ids.length) {
      setStatus('当前还没有截获产品 ID，请先滚动或点击刷新采集', 'is-error');
      return;
    }
    await navigator.clipboard.writeText(ids.join('\n'));
    setStatus(`已复制 ${ids.length} 个产品 ID`, 'is-success');
  }

  async function copy1688ShopProductIds() {
    if (SITE !== '1688-shop') return;
    const ids = extract1688ShopOptions().map((item) => item.itemId);
    if (!ids.length) {
      setStatus('当前还没有采集到 1688 新品 ID，请先下拉或点击刷新采集', 'is-error');
      return;
    }
    await navigator.clipboard.writeText(ids.join('\n'));
    setStatus(`已复制 ${ids.length} 个 1688 产品 ID`, 'is-success');
  }

  async function copy1688ShopProductLinks() {
    if (SITE !== '1688-shop') return;
    const links = Array.from(new Set(
      extract1688ShopOptions().map((item) => item.url).filter(Boolean)
    ));
    if (!links.length) {
      setStatus('当前还没有采集到 1688 新品链接，请先下拉或点击刷新采集', 'is-error');
      return;
    }
    await navigator.clipboard.writeText(links.join('\n'));
    setStatus(`已复制 ${links.length} 个 1688 商品链接`, 'is-success');
  }

  function clear1688ShopProducts() {
    if (SITE !== '1688-shop') return;
    window.postMessage({ source: 'product-ai-capture-1688-shop-clear' }, '*');
    window.__PRODUCT_AI_CAPTURE_1688_SHOP__ = {
      items: [], __captureSource: 'manual-clear', __capturedAt: new Date().toISOString()
    };
    refreshData();
    setStatus('已清空本页累计的 1688 新品', 'is-success');
  }

  function getSimplifiedCurrentPageUrl() {
    const current = new URL(String(location.href || '').trim());

    // Taobao/Tmall pages often contain affiliate, tracking and selected-SKU
    // parameters.  They are not needed to identify the SPU and make copied
    // links noisy or session-dependent, so keep only the stable item id.
    if (SITE === 'taobao' && current.searchParams.get('id')) {
      const itemId = current.searchParams.get('id');
      const isTmall = current.hostname.includes('tmall.com');
      return `${isTmall ? 'https://detail.tmall.com/item.htm' : 'https://item.taobao.com/item.htm'}?id=${encodeURIComponent(itemId)}`;
    }

    return current.toString();
  }

  async function copyCurrentPageUrl() {
    const url = getSimplifiedCurrentPageUrl();
    if (!url) {
      setStatus('当前页面没有可复制的链接', 'is-error');
      return;
    }
    await navigator.clipboard.writeText(url);
    setStatus('当前页面链接已复制', 'is-success');
  }

  async function loadMoreTmallShopProducts() {
    if (SITE !== 'tmall-shop') {
      return;
    }
    const before = state.data && state.data.options ? state.data.options.length : 0;
    setStatus(`正在尝试加载更多产品（当前 ${before} 个）…`);
    // Do not reload or navigate. Repeatedly reaching the page bottom lets
    // Taobao's own lazy loader/pagination issue the next request if one exists.
    for (let index = 0; index < 6; index += 1) {
      window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      window.scrollBy(0, -160);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await refreshData();
    const after = state.data && state.data.options ? state.data.options.length : 0;
    if (after > before) {
      setStatus(`已追加 ${after - before} 个产品 ID，当前共 ${after} 个`, 'is-success');
    } else {
      setStatus(`淘宝页面未返回更多产品，当前仍为 ${after} 个；如页面有“下一页”，请先点击后再采集`, 'is-error');
    }
  }

  function confirmCopyWithoutSizeChart() {
    const detailImages = getPreviewDetailImages(state.data);
    const sizeChartImages = state.data && state.data.selectedSizeChartDetailImages || [];
    if (!detailImages.length || sizeChartImages.length) {
      return true;
    }
    const confirmed = window.confirm('当前没有勾选任何“信息处理”详情图，确定仍要复制吗？\n\n点击“取消”不会修改勾选状态，你可以返回详情图勾选需要识别、翻译或提取的图片。');
    if (!confirmed) {
      setStatus('已取消复制：请先确认是否需要处理详情图中的商品信息', 'is-error');
    }
    return confirmed;
  }

  function stripTaobaoSummarySections(text) {
    const value = String(text || '');
    if (!isTaobaoMatrixMode()) {
      return value;
    }
    return value.replace(/\n## Options\n[\s\S]*?(?=\n## SKU Matrix\n|\n## Main Images\n)/i, '\n');
  }

  function trimAiTextBeforeDetailImages(text) {
    const value = String(text || '');
    const detailIndex = value.search(/\n## Detail Images\b/i);
    if (detailIndex >= 0) {
      return value.slice(0, detailIndex).replace(/\s+$/g, '') + '\n';
    }
    return value;
  }

  function trimAiTextBeforeMainImages(text) {
    const value = String(text || '');
    const mainIndex = value.search(/\n## Main Images\b/i);
    if (mainIndex >= 0) {
      return value.slice(0, mainIndex).replace(/\s+$/g, '') + '\n';
    }
    return value;
  }

  function trimAiTextBeforeCollectorNotes(text) {
    const value = String(text || '');
    const notesIndex = value.search(/\n## Collector Notes\b/i);
    if (notesIndex >= 0) {
      return value.slice(0, notesIndex).replace(/\s+$/g, '') + '\n';
    }
    return value;
  }

  function append1688MainImagesForExplicitCopy(text, data) {
    if (SITE !== '1688' || !data) {
      return text;
    }
    const value = String(text || '').replace(/\s+$/g, '');
    const lines = ['', '## Main Images'];
    (data.mainImages || []).forEach((url, index) => lines.push(`${index + 1}. ${url}`));
    if (!data.mainImages || data.mainImages.length === 0) {
      lines.push('- none_collected');
    }
    return `${value}${lines.join('\n')}\n`;
  }

  async function copyTextUntilOptions() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    if (!confirmCopyWithoutSizeChart()) {
      return;
    }
    const partialText = trimAiTextBeforeMainImages(state.data.aiText || state.data.text);
    await navigator.clipboard.writeText(partialText);
    setStatus(SITE === 'taobao' && state.taobaoCaptureMode === 'matrix' ? '已复制到 SKU Matrix，不含 Main/Detail Images' : '已复制到 Options，不含图片', 'is-success');
  }

  async function copyTextUntilMainImages() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    if (!confirmCopyWithoutSizeChart()) {
      return;
    }
    const partialText = append1688MainImagesForExplicitCopy(trimAiTextBeforeDetailImages(state.data.aiText || state.data.text), state.data);
    await navigator.clipboard.writeText(partialText);
    setStatus(SITE === '1688' ? '已复制到 Main Images（1688 面板默认隐藏主图）' : '已复制到 Main Images，不含 Detail Images', 'is-success');
  }

  async function copyTextUntilDetailImages() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    if (!confirmCopyWithoutSizeChart()) {
      return;
    }
    const partialText = trimAiTextBeforeCollectorNotes(state.data.aiText || state.data.text);
    await navigator.clipboard.writeText(partialText);
    setStatus('已复制到 Detail Images，不含 Collector Notes', 'is-success');
  }

  function downloadLocalFile(filename, content, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function copyJson() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    if (!confirmCopyWithoutSizeChart()) {
      return;
    }
    await navigator.clipboard.writeText(state.data.jsonText);
    setStatus('JSON 已复制', 'is-success');
  }

  async function downloadTxt() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    downloadLocalFile(`${state.data.fileBaseName}.txt`, state.data.aiText || state.data.text, 'text/markdown;charset=utf-8');
    setStatus('AI TXT 已下载', 'is-success');
  }

  async function downloadPackage() {
    if (!state.data) {
      await refreshData();
    }
    if (!state.data) {
      return;
    }
    setStatus('正在下载数据包，请稍等…');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'download-files',
        payload: {
          title: state.data.title,
          text: state.data.text,
          aiText: state.data.aiText,
          jsonText: state.data.jsonText,
          detailImages: state.data.detailImages,
          mainImages: state.data.mainImages || [],
          skuImages: (state.data.options || []).map((option) => option.image).filter(Boolean),
          fileBaseName: state.data.fileBaseName
        }
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : '下载失败');
      }
      setStatus(`数据包已开始下载到目录：${response.folderName}`, 'is-success');
    } catch (error) {
      console.error('[Coupang Capture] package failed', error);
      setStatus(`数据包下载失败：${error.message || error}`, 'is-error');
    }
  }

  async function crawlCoupangShopDetails() {
    if (SITE !== 'coupang-shop') {
      return;
    }
    if (!state.data) {
      await refreshData();
    }
    const links = extractCoupangShopProductLinks();
    if (!links.length) {
      setStatus('没有发现可采集的 Coupang 商品链接', 'is-error');
      return;
    }
    state.coupangShopCrawlRunning = true;
    await refreshData();
    setStatus(`正在逐个打开商品详情页采集：${links.length} 个 product_id…`);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'crawl-coupang-shop-products',
        payload: {
          urls: links.map((item) => item.url),
          limit: Math.min(links.length, 30)
        }
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : '详情采集失败');
      }
      mergeCoupangShopCrawledProducts(response.products || []);
      state.coupangShopCrawlErrors = response.errors || [];
      state.coupangShopCrawlRunning = false;
      await refreshData();
      setStatus(`详情采集完成：${state.coupangShopCrawledProducts.length}/${links.length} 个 product_id${state.coupangShopCrawlErrors.length ? `，失败 ${state.coupangShopCrawlErrors.length} 个` : ''}`, state.coupangShopCrawledProducts.length ? 'is-success' : 'is-error');
    } catch (error) {
      state.coupangShopCrawlRunning = false;
      await refreshData();
      setStatus(`详情采集失败：${error.message || error}`, 'is-error');
    }
  }

  function savePanelCollapsedState() {
    try {
      localStorage.setItem(PANEL_COLLAPSED_STORAGE_KEY, state.collapsed ? 'true' : 'false');
    } catch (error) {
      // Ignore private-mode or storage permission edge cases.
    }
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    savePanelCollapsedState();
    render();
  }

  function clearTaobaoCollectedSkus() {
    state.taobaoCollectedSkus.clear();
    state.taobaoLastImageOption = null;
    refreshData();
    setStatus('已清空淘宝/天猫选择采集记录', 'is-success');
  }

  function switchTaobaoCaptureMode(mode) {
    if (SITE !== 'taobao' || !['matrix', 'selected'].includes(mode)) {
      return;
    }
    state.taobaoCaptureMode = mode;
    saveTaobaoCaptureMode(mode);
    refreshData();
    render();
  }

  function switchListingConstraintProfile(profile) {
    if (SITE !== 'taobao' && SITE !== 'coupang') {
      return;
    }
    const value = profile === 'none' || LISTING_CONSTRAINT_PROFILES[profile] ? profile : 'auto';
    state.listingConstraintProfile = value;
    saveListingConstraintProfile(value);
    refreshData();
    render();
  }

  function renderListingConstraintSelector() {
    if (SITE !== 'taobao' && SITE !== 'coupang') {
      return '';
    }
    const selected = state.listingConstraintProfile || 'auto';
    const profileOptions = Object.entries(LISTING_CONSTRAINT_PROFILES).map(([key, profile]) => (
      `<option value="${key}" ${selected === key ? 'selected' : ''}>${profile.label}</option>`
    )).join('');
    return `
      <div class="coupang-capture-field-row">
        <label class="coupang-capture-field-label" for="coupang-capture-listing-profile">上架提示词</label>
        <select id="coupang-capture-listing-profile" class="coupang-capture-select" data-action="listing-profile">
          <option value="auto" ${selected === 'auto' ? 'selected' : ''}>自动识别</option>
          <option value="none" ${selected === 'none' ? 'selected' : ''}>不输出</option>
          ${profileOptions}
        </select>
      </div>
    `;
  }

  function updateNaverDetailHtmlToggle() {
    const button = root.querySelector('[data-action="naver-detail-html"]');
    if (!button) {
      return;
    }
    const enabled = Boolean(state.naverDetailHtmlEnabled);
    button.textContent = `详情 HTML：${enabled ? 'ON' : 'OFF'}`;
    button.classList.toggle('is-active', enabled);
    button.title = enabled ? '已输出 .se-main-container HTML，点击关闭' : '默认只输出详情图片，点击开启 HTML 详情';
  }

  function toggleNaverDetailHtml() {
    if (SITE !== 'naver-smartstore') {
      return;
    }
    state.naverDetailHtmlEnabled = !state.naverDetailHtmlEnabled;
    saveNaverDetailHtmlEnabled(state.naverDetailHtmlEnabled);
    if (state.data) {
      state.data.naverSmartstoreDetailHtmlEnabled = state.naverDetailHtmlEnabled;
      rebuildOutput(state.data);
      const textarea = root.querySelector('.coupang-capture-text');
      if (textarea) {
        textarea.value = state.data.aiText || state.data.text;
      }
    }
    updateNaverDetailHtmlToggle();
    setStatus(state.naverDetailHtmlEnabled ? '已开启 Naver 详情 HTML 输出' : '已关闭 Naver 详情 HTML 输出', 'is-success');
  }

  function render() {
    if (state.collapsed) {
      root.innerHTML = `
        <div class="coupang-capture-collapsed">
          <span>已折叠采集面板</span>
          <button type="button" data-action="toggle">展开</button>
        </div>
      `;
      root.querySelector('[data-action="toggle"]').addEventListener('click', toggleCollapse);
      return;
    }

    root.innerHTML = `
      <div class="coupang-capture-panel">
        <div class="coupang-capture-header">
          <div>
            <div class="coupang-capture-title">${SITE === 'coupang-shop' ? 'Coupang 店铺可信源采集器' : SITE === '1688-shop' ? '1688 店铺新品采集器' : SITE === '1688' ? '1688 AI 采集器' : SITE === 'tmall-shop' ? '淘宝/天猫店铺商品ID采集器' : SITE === 'naver-smartstore' ? 'Naver SmartStore AI 采集器' : SITE === 'cafe24' ? 'Cafe24 AI 采集器' : SITE === 'shopify' ? 'Shopify AI 采集器' : SITE === 'temu' ? 'Temu AI 采集器' : SITE === 'pinduoduo' ? '拼多多 AI 采集器' : SITE === 'zhaojiafang' ? '找家纺 AI 采集器' : SITE === 'onch3' ? 'Onch3 AI 采集器' : SITE === 'taobao' ? '淘宝/天猫 AI 采集器' : 'Coupang AI 采集器'}</div>
            <div class="coupang-capture-subtitle">${SITE === 'coupang-shop' ? '店铺页列 product_id，按钮逐个打开商品详情页并按 product_id 保存' : SITE === '1688-shop' ? '只采集新品 offer_id / 商品链接；下拉、排序和懒加载后持续累计去重' : SITE === '1688' ? '读取 window.context：SKU / 阶梯价 / 库存 / 主图 / 详情图' : SITE === 'tmall-shop' ? '实验：刷新后截获淘宝/天猫店铺商品列表接口' : SITE === 'naver-smartstore' ? '读取当前页：标题 / 价格 / 运费 / 图片 / 可见选项' : SITE === 'cafe24' ? '读取当前商品：option1 / 会员价 / 主图 / 正文详情图' : SITE === 'shopify' ? '读取当前商品：variants / 当前币种价格 / 主图 / 详情图' : SITE === 'temu' ? '实验：URL保底 + 截获商品接口' : SITE === 'pinduoduo' ? '实验：读取 rawData 或截获商品接口' : SITE === 'zhaojiafang' ? '读取 __NEXT_DATA__：SPU / SKU / 价格 / 库存 / 图片' : SITE === 'onch3' ? '当前页读取选项表，不跳转' : SITE === 'taobao' ? '默认选择采集；SKU矩阵需手动开启' : '标题 / 运费 / 可见选项 / 详情图'}</div>
          </div>
          <div class="coupang-capture-header-actions">
            <button type="button" class="coupang-capture-icon-btn" data-action="refresh" title="重新采集">↻</button>
            <button type="button" class="coupang-capture-icon-btn" data-action="toggle" title="折叠">—</button>
          </div>
        </div>
        <div class="coupang-capture-body">
          ${SITE === 'taobao' || SITE === 'coupang' ? `
            ${SITE === 'taobao' ? `
            <div class="coupang-capture-tabs">
              <button type="button" class="coupang-capture-tab ${state.taobaoCaptureMode === 'matrix' ? 'is-active' : ''}" data-taobao-mode="matrix">SKU矩阵</button>
              <button type="button" class="coupang-capture-tab ${state.taobaoCaptureMode === 'selected' ? 'is-active' : ''}" data-taobao-mode="selected">选择采集</button>
            </div>
            ` : ''}
            ${renderListingConstraintSelector()}
          ` : ''}
          ${SITE === 'zhaojiafang' ? '<div class="coupang-capture-zjf-filter-host"></div>' : ''}
          ${SITE === '1688' ? '<div class="coupang-capture-1688-filter-host"></div>' : ''}
          ${SITE === 'taobao' ? '<div class="coupang-capture-taobao-filter-host"></div>' : ''}
          ${SITE === 'coupang' ? '<div class="coupang-capture-coupang-filter-host"></div>' : ''}
          ${SITE === 'naver-smartstore' ? '<button type="button" class="coupang-capture-detail-html-toggle" data-action="naver-detail-html"></button>' : ''}
          <div class="coupang-capture-actions">
            <button type="button" class="coupang-capture-btn" data-action="copy">复制AI文本</button>
            <button type="button" class="coupang-capture-btn" data-action="copy-current-url">复制当前链接</button>
            <button type="button" class="coupang-capture-btn" data-action="copy-options">${SITE === 'taobao' ? (state.taobaoCaptureMode === 'matrix' ? '复制到SKU矩阵' : '复制到选项') : '复制到选项'}</button>
            <button type="button" class="coupang-capture-btn" data-action="copy-main">复制到主图</button>
            <button type="button" class="coupang-capture-btn" data-action="copy-detail">复制到详情</button>
            <button type="button" class="coupang-capture-btn" data-action="json">复制JSON</button>
            <button type="button" class="coupang-capture-btn" data-action="txt">下载AI文本</button>
            <button type="button" class="coupang-capture-btn" data-action="zip">下载AI包</button>
            ${SITE === 'tmall-shop' ? '<button type="button" class="coupang-capture-btn" data-action="copy-tmall-shop-ids">只复制产品ID</button>' : ''}
            ${SITE === 'tmall-shop' ? '<button type="button" class="coupang-capture-btn" data-action="load-more-tmall-shop">尝试加载更多</button>' : ''}
            ${SITE === '1688-shop' ? '<button type="button" class="coupang-capture-btn" data-action="copy-1688-shop-ids">只复制产品ID</button>' : ''}
            ${SITE === '1688-shop' ? '<button type="button" class="coupang-capture-btn" data-action="copy-1688-shop-links">复制产品链接</button>' : ''}
            ${SITE === '1688-shop' ? '<button type="button" class="coupang-capture-btn" data-action="clear-1688-shop">清空累计</button>' : ''}
            ${SITE === 'coupang-shop' ? '<button type="button" class="coupang-capture-btn" data-action="crawl-coupang-shop">采集商品详情</button>' : ''}
            ${SITE === 'taobao' ? '<button type="button" class="coupang-capture-btn" data-action="clear">清空已采</button>' : ''}
          </div>
          <div class="coupang-capture-status"></div>
          <div class="coupang-capture-sku-preview"></div>
          <div class="coupang-capture-detail-preview"></div>
          <textarea class="coupang-capture-text" spellcheck="false"></textarea>
        </div>
      </div>
    `;

    updateZhaojiafangFilterPanel();
    update1688FilterPanel();
    updateTaobaoFilterPanel();
    updateCoupangFilterPanel();
    updateNaverDetailHtmlToggle();
    root.querySelectorAll('[data-taobao-mode]').forEach((button) => {
      button.addEventListener('click', () => switchTaobaoCaptureMode(button.getAttribute('data-taobao-mode')));
    });
    const listingProfileSelect = root.querySelector('[data-action="listing-profile"]');
    if (listingProfileSelect) {
      listingProfileSelect.addEventListener('change', () => switchListingConstraintProfile(listingProfileSelect.value));
    }
    const naverDetailHtmlButton = root.querySelector('[data-action="naver-detail-html"]');
    if (naverDetailHtmlButton) {
      naverDetailHtmlButton.addEventListener('click', toggleNaverDetailHtml);
    }
    root.querySelector('[data-action="refresh"]').addEventListener('click', refreshData);
    root.querySelector('[data-action="toggle"]').addEventListener('click', toggleCollapse);
    root.querySelector('[data-action="copy"]').addEventListener('click', () => copyText().catch((error) => {
      setStatus(`复制失败：${error.message || error}`, 'is-error');
    }));
    root.querySelector('[data-action="copy-current-url"]').addEventListener('click', () => copyCurrentPageUrl().catch((error) => {
      setStatus(`复制当前链接失败：${error.message || error}`, 'is-error');
    }));
    root.querySelector('[data-action="copy-options"]').addEventListener('click', () => copyTextUntilOptions().catch((error) => {
      setStatus(`复制失败：${error.message || error}`, 'is-error');
    }));
    root.querySelector('[data-action="copy-main"]').addEventListener('click', () => copyTextUntilMainImages().catch((error) => {
      setStatus(`复制失败：${error.message || error}`, 'is-error');
    }));
    root.querySelector('[data-action="copy-detail"]').addEventListener('click', () => copyTextUntilDetailImages().catch((error) => {
      setStatus(`复制失败：${error.message || error}`, 'is-error');
    }));
    const copyTmallShopIdsButton = root.querySelector('[data-action="copy-tmall-shop-ids"]');
    if (copyTmallShopIdsButton) {
      copyTmallShopIdsButton.addEventListener('click', () => copyTmallShopProductIds().catch((error) => {
        setStatus(`复制产品 ID 失败：${error.message || error}`, 'is-error');
      }));
    }
    const loadMoreTmallShopButton = root.querySelector('[data-action="load-more-tmall-shop"]');
    if (loadMoreTmallShopButton) {
      loadMoreTmallShopButton.addEventListener('click', () => loadMoreTmallShopProducts().catch((error) => {
        setStatus(`加载更多产品失败：${error.message || error}`, 'is-error');
      }));
    }
    const copy1688ShopIdsButton = root.querySelector('[data-action="copy-1688-shop-ids"]');
    if (copy1688ShopIdsButton) {
      copy1688ShopIdsButton.addEventListener('click', () => copy1688ShopProductIds().catch((error) => {
        setStatus(`复制产品 ID 失败：${error.message || error}`, 'is-error');
      }));
    }
    const copy1688ShopLinksButton = root.querySelector('[data-action="copy-1688-shop-links"]');
    if (copy1688ShopLinksButton) {
      copy1688ShopLinksButton.addEventListener('click', () => copy1688ShopProductLinks().catch((error) => {
        setStatus(`复制产品链接失败：${error.message || error}`, 'is-error');
      }));
    }
    const clear1688ShopButton = root.querySelector('[data-action="clear-1688-shop"]');
    if (clear1688ShopButton) {
      clear1688ShopButton.addEventListener('click', clear1688ShopProducts);
    }
    root.querySelector('[data-action="json"]').addEventListener('click', () => copyJson().catch((error) => {
      setStatus(`复制 JSON 失败：${error.message || error}`, 'is-error');
    }));
    root.querySelector('[data-action="txt"]').addEventListener('click', downloadTxt);
    root.querySelector('[data-action="zip"]').addEventListener('click', downloadPackage);
    const crawlCoupangShopButton = root.querySelector('[data-action="crawl-coupang-shop"]');
    if (crawlCoupangShopButton) {
      crawlCoupangShopButton.addEventListener('click', crawlCoupangShopDetails);
    }
    const clearButton = root.querySelector('[data-action="clear"]');
    if (clearButton) {
      clearButton.addEventListener('click', clearTaobaoCollectedSkus);
    }

    const textarea = root.querySelector('.coupang-capture-text');
    textarea.value = state.data ? (state.data.aiText || state.data.text) : '正在采集…';
    updateSkuPreview(state.data);
    updateDetailImagePreview(state.data);
    if (state.status) {
      const statusType = root.querySelector('.coupang-capture-status')?.classList.contains('is-error') ? 'is-error' : '';
      setStatus(state.status, statusType);
    }
  }

  function bindPddDynamicRefresh() {
    if (SITE !== 'pinduoduo') {
      return;
    }
    const schedulePddDomRefresh = (delay) => {
      clearTimeout(state.pddDomRefreshTimer);
      state.pddDomRefreshTimer = setTimeout(() => {
        const text = getPddVisibleText();
        const sectionStart = text.indexOf('已选：') >= 0 ? text.indexOf('已选：') : text.indexOf('颜色分类');
        const optionSection = sectionStart >= 0 ? text.slice(sectionStart, sectionStart + 1600) : '';
        const signature = `${optionSection}|imgs:${collectPddDomImageUrls().length}`;
        if (signature && signature !== state.pddDomSignature) {
          state.pddDomSignature = signature;
          refreshData();
        }
      }, delay || 250);
    };

    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest && event.target.closest('button, a, div, span');
      const text = normalize(target && (target.textContent || target.getAttribute('aria-label') || target.getAttribute('title')) || '');
      if (!text || /颜色|款式|尺码|已选|确定|发起拼单|单独购买|立即购买|加入购物车/.test(text)) {
        schedulePddDomRefresh(350);
        setTimeout(() => schedulePddDomRefresh(250), 1000);
      }
    }, true);

    const observer = new MutationObserver((mutations) => {
      const meaningful = mutations.some((mutation) => {
        const target = mutation.target;
        if (!target || root.contains(target)) {
          return false;
        }
        const text = normalize(target.textContent || '');
        return !text || /已选：|颜色分类|颜色|款式|尺码|尺寸|规格|型号|确定/.test(text);
      });
      if (meaningful) {
        schedulePddDomRefresh(300);
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  function bindOnch3DynamicRefresh() {
    if (SITE !== 'onch3') {
      return;
    }
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest && event.target.closest('button, a, input[type=button]');
      if (!target || !/옵션별\s*보기/.test(normalize(target.value || target.textContent || target.getAttribute('title') || ''))) {
        return;
      }
      setTimeout(refreshData, 300);
      setTimeout(refreshData, 1200);
    }, true);

    const observer = new MutationObserver(() => {
      clearTimeout(state.onch3RefreshTimer);
      state.onch3RefreshTimer = setTimeout(refreshData, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bindNaverSmartstoreDynamicRefresh() {
    if (SITE !== 'naver-smartstore' || !document.body) {
      return;
    }
    let timer = null;
    const scheduleRefresh = (delay = 450) => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshData(), delay);
    };
    const observer = new MutationObserver((mutations) => {
      const meaningful = mutations.some((mutation) => {
        const target = mutation.target;
        if (!target || root.contains(target)) {
          return false;
        }
        const added = Array.from(mutation.addedNodes || []).some((node) => {
          if (node.nodeType !== 1) {
            return false;
          }
          return node.matches('.se-main-container, [role="option"], [class*="ProductInfo"], img')
            || (node.querySelector && node.querySelector('.se-main-container, [role="option"], [class*="ProductInfo"], img'));
        });
        const changedText = normalize(target.textContent || '');
        return added || /se-main-container|ProductInfo|상품상세|상세페이지|옵션|판매가/.test(String(target.className || ''))
          || /상품상세|상세페이지|옵션|판매가/.test(changedText.slice(0, 500));
      });
      if (meaningful) {
        scheduleRefresh();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // SmartStore often mounts the product data after the first content paint.
    // These are DOM-only retries; they do not reload the page or issue a new
    // navigation, so they avoid turning a normal first visit into a refresh.
    [900, 2200, 4800, 8000, 12000].forEach((delay) => {
      setTimeout(() => scheduleRefresh(0), delay);
    });
    window.addEventListener('load', () => scheduleRefresh(250));
  }

  if (SITE === 'tmall-shop') {
    const scheduleTmallShopRefresh = (delay = 260) => {
      clearTimeout(state.tmallShopRefreshTimer);
      state.tmallShopRefreshTimer = setTimeout(refreshData, delay);
    };
    let tmallShopResourceSignature = '';
    const getTmallShopResourceSignature = () => {
      try {
        return getTmallShopItemFetchUrls().join('|');
      } catch (error) {
        return '';
      }
    };
    const scheduleTmallShopMultiRefresh = () => {
      scheduleTmallShopRefresh(250);
      setTimeout(() => scheduleTmallShopRefresh(250), 900);
      setTimeout(() => scheduleTmallShopRefresh(250), 1800);
    };
    window.addEventListener('product-ai-capture-tmall-shop-updated', () => {
      scheduleTmallShopRefresh(120);
    });
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'product-ai-capture-tmall-shop') {
        return;
      }
      window.__PRODUCT_AI_CAPTURE_TMALL_SHOP__ = event.data.payload;
      scheduleTmallShopRefresh(120);
    });
    window.addEventListener('scroll', () => scheduleTmallShopRefresh(900), { passive: true });
    window.addEventListener('wheel', () => scheduleTmallShopRefresh(900), { passive: true });
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest && event.target.closest('a, button, [role="button"], li, span, div');
      const text = normalize(target && (target.textContent || target.getAttribute('title') || target.getAttribute('aria-label') || ''));
      if (/新品|上新|综合|销量|价格|分类|全部|更多|下一页|上一页|排序|筛选/.test(text)) {
        scheduleTmallShopMultiRefresh();
      }
    }, true);
    window.addEventListener('popstate', scheduleTmallShopMultiRefresh);
    window.addEventListener('hashchange', scheduleTmallShopMultiRefresh);
    setInterval(() => {
      const signature = getTmallShopResourceSignature();
      if (signature && signature !== tmallShopResourceSignature) {
        tmallShopResourceSignature = signature;
        scheduleTmallShopRefresh(220);
      }
    }, 1200);
  }

  if (SITE === '1688-shop') {
    let alibabaShopRefreshTimer = null;
    const scheduleAlibabaShopRefresh = (delay = 180) => {
      clearTimeout(alibabaShopRefreshTimer);
      alibabaShopRefreshTimer = setTimeout(() => refreshData(), delay);
    };
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'product-ai-capture-1688-shop') {
        return;
      }
      window.__PRODUCT_AI_CAPTURE_1688_SHOP__ = event.data.payload;
      scheduleAlibabaShopRefresh();
    });
    window.addEventListener('scroll', () => scheduleAlibabaShopRefresh(500), { passive: true });
    window.addEventListener('wheel', () => scheduleAlibabaShopRefresh(500), { passive: true });
    document.addEventListener('click', () => scheduleAlibabaShopRefresh(500), true);
    setInterval(() => scheduleAlibabaShopRefresh(0), 1500);
  }

  if (SITE === 'temu') {
    window.addEventListener('product-ai-capture-temu-updated', () => {
      clearTimeout(state.temuRefreshTimer);
      state.temuRefreshTimer = setTimeout(refreshData, 120);
    });
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'product-ai-capture-temu') {
        return;
      }
      window.__PRODUCT_AI_CAPTURE_TEMU__ = event.data.payload;
      clearTimeout(state.temuRefreshTimer);
      state.temuRefreshTimer = setTimeout(refreshData, 120);
    });
  }

  if (SITE === 'pinduoduo') {
    window.addEventListener('product-ai-capture-pdd-updated', () => {
      clearTimeout(state.pddRefreshTimer);
      state.pddRefreshTimer = setTimeout(refreshData, 120);
    });
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'product-ai-capture-pdd') {
        return;
      }
      window.__PRODUCT_AI_CAPTURE_PDD__ = event.data.payload;
      clearTimeout(state.pddRefreshTimer);
      state.pddRefreshTimer = setTimeout(refreshData, 120);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'product-ai-capture:collect-current-data') {
      return false;
    }
    try {
      const data = collectData();
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return false;
  });

  render();
  bindTaobaoSkuClickCapture();
  bindOnch3DynamicRefresh();
  bindNaverSmartstoreDynamicRefresh();
  bindPddDynamicRefresh();
  expandOnch3OptionPanel();
  refreshData();
  setTimeout(refreshData, 1800);
  setTimeout(refreshData, 4000);
})();
