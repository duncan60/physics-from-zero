import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';

// 分享到社群網站、通訊軟體時的預覽：檢查 index.html 的 meta 和 public/ 裡的圖片對得上。

const SITE_URL = 'https://duncan60.github.io/physics-from-zero/';

// public/ 裡的 PNG，用 data URL 讀進來（鍵是相對於這個檔案的路徑，例如 '../public/og-image.png'）。
const publicPngs = import.meta.glob<string>('../public/*.png', { query: '?inline', import: 'default', eager: true });

const head = new DOMParser().parseFromString(indexHtml, 'text/html').head;

function meta(attribute: 'property' | 'name', key: string): string | null {
  return head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content') ?? null;
}

/** PNG 的寬高寫在 IHDR 裡：檔頭 8 bytes、長度 4、類型 4，接著是寬、高（各 4 bytes，big-endian）。 */
function pngSize(dataUrl: string): { width: number; height: number } {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('分享預覽的 meta', () => {
  it('og:url 是網站的網址', () => expect(meta('property', 'og:url')).toBe(SITE_URL));

  it('og:image 是網站底下的絕對網址（社群網站不認相對路徑），而且 public/ 裡真的有這張圖', () => {
    const image = meta('property', 'og:image');
    expect(image).not.toBeNull();
    expect(image?.startsWith(SITE_URL)).toBe(true);
    const file = `../public/${image?.slice(SITE_URL.length)}`;
    expect(Object.keys(publicPngs)).toContain(file);
  });

  it('圖片是 1200×630，和 og:image:width／height 一致，也有替代文字', () => {
    const image = meta('property', 'og:image') ?? '';
    const size = pngSize(publicPngs[`../public/${image.slice(SITE_URL.length)}`] ?? '');
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toBeTruthy();
  });

  it('twitter:card 用大圖', () => expect(meta('name', 'twitter:card')).toBe('summary_large_image'));
});
