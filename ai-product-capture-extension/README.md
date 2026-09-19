# ACheng AI Product Capture — Taobao / 1688 / Coupang

面向 AI 商品上架流程的浏览器采集器。

## 支持平台

- 淘宝商品页：标题、主图/副图、选项、价格、库存、SKU 信息等
- 1688 商品页及新品列表：商品信息、SKU、图片、详情等
- Coupang 商品页：标题、品牌、选项、价格、库存、图片、详情等

输出以 `AI_PRODUCT_CAPTURE_V1` 为主，保留可直接投喂 AI 的结构化字段与公网图片链接。

## 安装

1. 打开本仓库的 [Releases](https://github.com/jekki1023/acheng/releases) 页面。
2. 下载名称以 `acheng-ai-product-capture-` 开头的插件 ZIP。
3. 解压 ZIP 文件。
4. 在 Chrome 打开 `chrome://extensions/`。
5. 开启右上角的“开发者模式”。
6. 点击“加载已解压的扩展程序”。
7. 选择解压后的 `ai-product-capture-extension` 目录。

## 从源码使用

也可以直接打开本目录，使用其中的 `manifest.json` 作为 Chrome 的已解压扩展目录。
