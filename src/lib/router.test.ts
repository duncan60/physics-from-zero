import { afterEach, expect, it, vi } from 'vitest';
import { parseHash, routeToHash } from './router';

afterEach(() => {
  vi.unstubAllEnvs();
});

// 預覽頁只在開發模式有：parseHash 的第二個參數 `dev` 預設是 import.meta.env.DEV，測試可以直接傳，也可以用 vi.stubEnv 換掉。

it('開發模式：#/preview 是預覽頁，#/preview/課程/步驟 是從那一步開始上課（步驟從 1 算起，和預覽頁上看到的編號一樣）', () => {
  expect(parseHash('#/preview', true)).toEqual({ name: 'preview' });
  expect(parseHash('#/preview/1-3/4', true)).toEqual({ name: 'preview-run', lessonId: '1-3', step: 4 });
  expect(parseHash('#/preview/1-3/1', true)).toEqual({ name: 'preview-run', lessonId: '1-3', step: 1 });
  // 每一站的複習也是一課（review-站號）
  expect(parseHash('#/preview/review-2/8', true)).toEqual({ name: 'preview-run', lessonId: 'review-2', step: 8 });
});

it('正式網站：預覽的網址一律是地圖，找不到頁面一樣', () => {
  expect(parseHash('#/preview', false)).toEqual({ name: 'map' });
  expect(parseHash('#/preview/1-3/4', false)).toEqual({ name: 'map' });
  expect(parseHash('#/preview/review-1/2', false)).toEqual({ name: 'map' });
});

it('開發模式也看不懂的預覽網址：回到地圖', () => {
  for (const hash of [
    '#/preview/',
    '#/preview/1-3', // 沒有步驟
    '#/preview/1-3/',
    '#/preview/1-3/0', // 步驟從 1 算起
    '#/preview/1-3/04', // 不接受 0 開頭，同一步只有一個網址
    '#/preview/1-3/-1',
    '#/preview/1-3/x',
    '#/preview/1-3/4/extra',
    '#/preview//4',
    '#/preview/%E4/4', // 壞掉的編碼
    '#/preview/1-3/4?x=1',
    '#/previewx',
  ]) {
    expect(parseHash(hash, true), hash).toEqual({ name: 'map' });
  }
});

it('沒有傳 dev 的時候看 import.meta.env.DEV：false 就是地圖，true 就是預覽頁', () => {
  vi.stubEnv('DEV', false);
  expect(parseHash('#/preview')).toEqual({ name: 'map' });
  expect(parseHash('#/preview/1-3/4')).toEqual({ name: 'map' });
  vi.stubEnv('DEV', true);
  expect(parseHash('#/preview')).toEqual({ name: 'preview' });
  expect(parseHash('#/preview/1-3/4')).toEqual({ name: 'preview-run', lessonId: '1-3', step: 4 });
});

it('其他網址不受 dev 影響', () => {
  for (const dev of [true, false]) {
    expect(parseHash('#/lesson/1-2', dev)).toEqual({ name: 'lesson', id: '1-2' });
    expect(parseHash('#/review/1', dev)).toEqual({ name: 'review', stationId: 1 });
    expect(parseHash('', dev)).toEqual({ name: 'map' });
    expect(parseHash('#/', dev)).toEqual({ name: 'map' });
  }
});

it('routeToHash：預覽頁和預覽中的一步，都能轉回網址再轉回來', () => {
  expect(routeToHash({ name: 'preview' })).toBe('#/preview');
  expect(routeToHash({ name: 'preview-run', lessonId: '1-3', step: 4 })).toBe('#/preview/1-3/4');
  expect(routeToHash({ name: 'preview-run', lessonId: 'review-1', step: 2 })).toBe('#/preview/review-1/2');
  for (const route of [{ name: 'preview' }, { name: 'preview-run', lessonId: 'review-2', step: 7 }] as const) {
    expect(parseHash(routeToHash(route), true)).toEqual(route);
  }
});
