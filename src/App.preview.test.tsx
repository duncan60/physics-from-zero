import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { reviewLessonId, reviewOf, stations } from './content/stations';
import { STORAGE_KEY, emptyProgress } from './lib/progress';
import type { Progress } from './lib/progress';

// 本機預覽頁（只在開發模式有）：用真的 App 和真的上課畫面。Vitest 底下 import.meta.env.DEV 是 true；
// 正式網站的行為用 vi.stubEnv('DEV', false) 模擬。

const lessons = stations.flatMap((station) => station.lessons);

// 防連點（換畫面後 400 ms 內的按鈕不算數），和 App.lessons.test.tsx 一樣用假的時鐘。
const SETTLE_MS = 500;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  window.location.hash = '';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); // jsdom 沒有實作 scrollTo
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = '';
});

function setupUser() {
  return userEvent.setup({ delay: SETTLE_MS, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

const button = (name: string) => screen.getByRole('button', { name });

/** 上課畫面現在在第幾步（從 0 算起）：進度條的目前值。 */
function currentIndex(): number {
  return Number(screen.getByRole('progressbar', { name: '課程進度' }).getAttribute('aria-valuenow'));
}

/** 瀏覽器的上一頁：等 popstate，再等緊接著的 hashchange 和畫面更新。 */
async function goBack(): Promise<void> {
  const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  window.history.back();
  await act(async () => {
    await popped;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it('開發模式：#/preview 是預覽頁，列出每一課每一步；這一頁沒有「預覽模式」提示列', () => {
  window.location.hash = '#/preview';
  render(<App />);
  expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^從這裡開始/ }).length).toBeGreaterThan(lessons.length);
  expect(screen.queryByText('預覽模式：不會存進度')).not.toBeInTheDocument();
});

it('預覽頁的「回到地圖」回到地圖', async () => {
  window.location.hash = '#/preview';
  render(<App />);
  await setupUser().click(button('回到地圖'));
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(window.location.hash).toBe('#/');
});

it('按「從這裡開始」：從那一步開始上課（網址 #/preview/課程/步驟，步驟從 1 算起），上方有「預覽模式：不會存進度」', async () => {
  window.location.hash = '#/preview';
  render(<App />);
  const lesson = lessons[2];
  expect(lesson.steps.length).toBeGreaterThanOrEqual(4);
  await setupUser().click(button(`從這裡開始：${lesson.id} 第 4 步`));

  expect(window.location.hash).toBe(`#/preview/${lesson.id}/4`);
  expect(screen.getByText('預覽模式：不會存進度')).toBeInTheDocument();
  expect(screen.getByText(lesson.title)).toBeInTheDocument(); // 上課畫面上方的課程名稱
  expect(currentIndex()).toBe(3); // 第 4 步，進度條從 0 算起
  expect(screen.queryByRole('heading', { name: '本機預覽' })).not.toBeInTheDocument();
});

it('直接打開 #/preview/課程/步驟：從那一步開始，不管那一課解鎖了沒有（空的進度，第 2 站的課）', () => {
  const lesson = stations[1].lessons[2];
  window.location.hash = `#/preview/${lesson.id}/2`;
  render(<App />);
  expect(screen.getByText(lesson.title)).toBeInTheDocument();
  expect(screen.getByText('預覽模式：不會存進度')).toBeInTheDocument();
  expect(currentIndex()).toBe(1);
  expect(screen.queryByText(/還沒解鎖/)).not.toBeInTheDocument();
});

it('每一站的複習也能從任何一步開始（複習還沒解鎖也一樣），名稱是「第 N 站複習」', () => {
  const stationId = stations.find((station) => reviewOf(station.id) !== undefined)?.id ?? 0;
  const review = reviewOf(stationId);
  if (review === undefined) throw new Error('沒有任何一站有複習');
  window.location.hash = `#/preview/${reviewLessonId(stationId)}/3`;
  render(<App />);
  expect(screen.getByText(`第 ${stationId} 站複習`)).toBeInTheDocument();
  expect(currentIndex()).toBe(2);
});

it('預覽時不顯示「回報問題」（localhost 不該開 issue）；正常上課還是有', () => {
  window.location.hash = `#/preview/${lessons[0].id}/1`;
  const { unmount } = render(<App />);
  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument();
  expect(screen.queryByText('需要 GitHub 帳號')).not.toBeInTheDocument();
  unmount();

  window.location.hash = `#/lesson/${lessons[0].id}`;
  render(<App />);
  expect(screen.getByRole('link', { name: /回報問題/ })).toBeInTheDocument();
});

it('找不到的課或超出範圍的步驟：說明找不到，「回到預覽頁」回到預覽頁', async () => {
  for (const hash of ['#/preview/9-9/1', `#/preview/${lessons[0].id}/${lessons[0].steps.length + 1}`]) {
    window.location.hash = hash;
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: '找不到這一步' }), hash).toBeInTheDocument();
    await setupUser().click(button('回到預覽頁'));
    expect(window.location.hash).toBe('#/preview');
    expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();
    unmount();
  }
});

it('預覽到最後一步：完成畫面照常出現，但不存進度、不加 XP、不碰 localStorage；「回到地圖」回到預覽頁', async () => {
  const seeded: Progress = { ...emptyProgress(), completed: [lessons[0].id], xp: 55, streak: 2, lastActiveDay: '2026-10-20' };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  const before = window.localStorage.getItem(STORAGE_KEY);
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
  const clear = vi.spyOn(Storage.prototype, 'clear');

  // 最後一步是觀念卡的課：一直按「繼續」就到完成畫面
  const lesson = lessons.find((l) => l.steps[l.steps.length - 1].kind === 'concept');
  if (lesson === undefined) throw new Error('找不到最後一步是觀念卡的課');
  window.location.hash = `#/preview/${lesson.id}/${lesson.steps.length}`;
  render(<App />);
  const user = setupUser();
  expect(currentIndex()).toBe(lesson.steps.length - 1);
  await user.click(button('繼續'));

  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '看本站重點' })).not.toBeInTheDocument();
  await user.click(button('回到地圖'));
  expect(window.location.hash).toBe('#/preview');
  expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();

  expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(setItem).not.toHaveBeenCalled();
  expect(removeItem).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

it('預覽完之後沒有進度的瀏覽器，localStorage 還是空的', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const lesson = lessons.find((l) => l.steps[l.steps.length - 1].kind === 'concept');
  if (lesson === undefined) throw new Error('找不到最後一步是觀念卡的課');
  window.location.hash = `#/preview/${lesson.id}/${lesson.steps.length}`;
  render(<App />);
  const user = setupUser();
  await user.click(button('繼續'));
  await user.click(button('回到地圖'));
  expect(window.localStorage.length).toBe(0);
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
});

it('中途按「離開」：回到預覽頁，沒有存任何東西', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  window.location.hash = `#/preview/${lessons[0].id}/1`;
  render(<App />);
  await setupUser().click(button('離開'));
  expect(window.location.hash).toBe('#/preview');
  expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();
  expect(window.localStorage.length).toBe(0);
  expect(setItem).not.toHaveBeenCalled();
});

it('上一頁：從預覽中的一步回到預覽頁', async () => {
  window.location.hash = '#/preview';
  render(<App />);
  const lesson = lessons[0];
  await setupUser().click(button(`從這裡開始：${lesson.id} 第 2 步`));
  expect(currentIndex()).toBe(1);
  await goBack();
  expect(window.location.hash).toBe('#/preview');
  expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();
});

it('正式網站（DEV 是 false）：#/preview 和 #/preview/課程/步驟 都是地圖，沒有預覽頁也沒有「從這裡開始」', () => {
  vi.stubEnv('DEV', false);
  for (const hash of ['#/preview', `#/preview/${lessons[0].id}/2`, '#/preview/review-1/1']) {
    window.location.hash = hash;
    const { unmount } = render(<App />);
    expect(screen.getByRole('link', { name: /慣性/ }), hash).toBeInTheDocument(); // 地圖
    expect(screen.queryByRole('heading', { name: '本機預覽' }), hash).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /從這裡開始/ }), hash).not.toBeInTheDocument();
    expect(screen.queryByText('預覽模式：不會存進度'), hash).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar'), hash).not.toBeInTheDocument(); // 沒有進入上課
    unmount();
  }
});
