chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'download-files') {
    buildAndDownloadPackage(message.payload)
      .then((result) => sendResponse({ ok: true, folderName: result.folderName }))
      .catch((error) => {
        console.error('[Coupang Capture] background download failed', error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  }

  if (message.type === 'fetch-1688-detail') {
    fetch1688Detail(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        console.error('[Product AI Capture] 1688 detail failed', error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  }

  if (message.type === 'zhaojiafang-quick-image-rar') {
    fetchZhaojiafangQuickImageRar(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        console.error('[Product AI Capture] zhaojiafang quick image failed', error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  }



  return false;
});

function sanitizeFileName(name) {
  return (name || 'product-ai-capture')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'product-ai-capture';
}

async function fetchImageBlob(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status} ${url}`);
  }
  return await response.blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function downloadFile({ dataUrl, filename, saveAs = false }) {
  return await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs,
    conflictAction: 'uniquify'
  });
}

function buildTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function downloadTextFile({ content, filename, type }) {
  const blob = new Blob([content || ''], { type });
  const dataUrl = await blobToDataUrl(blob);
  await downloadFile({ dataUrl, filename });
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

function uniqueList(values) {
  return Array.from(new Set((values || []).map(normalizeUrl).filter(Boolean)));
}

function parse1688DetailContent(text) {
  const source = String(text || '');
  const match = source.match(/offer_details\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) {
    return source;
  }
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && parsed.content ? parsed.content : source;
  } catch (error) {
    return source;
  }
}

function extract1688DetailImages(text) {
  const content = parse1688DetailContent(text);
  const isDetailImage = (value) => {
    const url = normalizeUrl(value);
    return /alicdn\.com/i.test(url)
      && /\.(?:jpg|jpeg|png|webp)(?:[?#_]|$)/i.test(url)
      && !/(?:logo|icon|avatar|userheader|shophead|loading|sprite|rate)/i.test(url);
  };
  const urls = [];
  const attrRe = /(?:src|data-src)=["']([^"']+)["']/ig;
  let match;
  while ((match = attrRe.exec(content)) !== null) {
    const url = normalizeUrl(match[1]);
    if (isDetailImage(url)) {
      urls.push(url);
    }
  }
  const directRe = /(?:https?:)?\/\/[^"'<>\s]+?\.(?:jpg|jpeg|png|webp)(?:_[^"'<>\s]*)?/ig;
  while ((match = directRe.exec(content)) !== null) {
    const url = normalizeUrl(match[0]);
    if (isDetailImage(url)) {
      urls.push(url);
    }
  }
  return uniqueList(urls.map((url) => url.replace(/_\.webp$/i, '').replace(/_sum\.jpg$/i, '')));
}

async function fetch1688Detail(payload = {}) {
  const detailUrl = payload.detailUrl;
  if (!detailUrl || !/^https:\/\/itemcdn\.tmall\.com\/1688offer\//i.test(detailUrl)) {
    throw new Error('缺少或不支持的 1688 详情 URL');
  }
  const response = await fetch(detailUrl, {
    headers: { 'Accept': 'text/plain,text/html,*/*' },
    credentials: 'omit'
  });
  if (!response.ok) {
    throw new Error(`1688 详情请求失败：${response.status}`);
  }
  const text = await response.text();
  const content = parse1688DetailContent(text);
  return {
    text,
    content,
    images: extract1688DetailImages(text)
  };
}

async function fetchZhaojiafangQuickImageRar(payload = {}) {
  const goodsId = payload.goodsId || payload.currentSkuId;
  const goodsCommonid = payload.goodsCommonid || payload.spuId;
  if (!goodsId || !goodsCommonid) {
    throw new Error('缺少找家纺 goods_id 或 goods_commonid');
  }

  const response = await fetch('https://api-pl.zhaojiafang.com/api/goods_detail/goods_download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      idx: 0,
      goods_id: String(goodsId),
      goods_commonid: String(goodsCommonid)
    }),
    credentials: 'omit'
  });

  if (!response.ok) {
    throw new Error(`快速下图接口失败：${response.status}`);
  }

  const data = await response.json();
  if (!data || data.ResponseStatus !== 0 || !data.datas) {
    throw new Error(data && data.ResponseMsg ? data.ResponseMsg : '快速下图接口未返回 RAR 链接');
  }

  return { quickImageRarUrl: data.datas };
}

async function buildAndDownloadPackage(payload) {
  const baseName = sanitizeFileName(payload.fileBaseName || payload.title || 'product-ai-capture');
  const folderName = `${baseName}_${buildTimestamp()}`;

  await downloadTextFile({
    content: payload.aiText || payload.text || '',
    filename: `${folderName}/ai-feed.md`,
    type: 'text/markdown;charset=utf-8'
  });

  await downloadTextFile({
    content: payload.text || '',
    filename: `${folderName}/summary.txt`,
    type: 'text/plain;charset=utf-8'
  });

  await downloadTextFile({
    content: payload.jsonText || '{}',
    filename: `${folderName}/product.json`,
    type: 'application/json;charset=utf-8'
  });

  const failures = [];
  const imageGroups = [
    {
      folder: 'main-images',
      urls: Array.isArray(payload.mainImages) ? payload.mainImages : []
    },
    {
      folder: 'sku-images',
      urls: Array.isArray(payload.skuImages) ? payload.skuImages : []
    },
    {
      folder: 'detail-images',
      urls: Array.isArray(payload.detailImages) ? payload.detailImages : []
    }
  ];

  for (const group of imageGroups) {
    const uniqueUrls = Array.from(new Set(group.urls.filter(Boolean)));
    for (let index = 0; index < uniqueUrls.length; index += 1) {
      const url = uniqueUrls[index];
      try {
        const blob = await fetchImageBlob(url);
        const dataUrl = await blobToDataUrl(blob);
        const extension = (() => {
          try {
            const pathname = new URL(url).pathname;
            const matched = pathname.match(/\.([a-zA-Z0-9]+)(?:$|_)/);
            return matched ? matched[1].toLowerCase() : 'jpg';
          } catch (error) {
            return 'jpg';
          }
        })();
        await downloadFile({
          dataUrl,
          filename: `${folderName}/${group.folder}/${String(index + 1).padStart(2, '0')}.${extension}`
        });
      } catch (error) {
        failures.push(`${group.folder}: ${url} => ${error.message || error}`);
      }
    }
  }

  if (failures.length) {
    const errorBlob = new Blob([failures.join('\n')], { type: 'text/plain;charset=utf-8' });
    const errorDataUrl = await blobToDataUrl(errorBlob);
    await downloadFile({
      dataUrl: errorDataUrl,
      filename: `${folderName}/download-errors.txt`
    });
  }

  return { folderName };
}
