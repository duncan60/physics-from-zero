import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, localDayKey } from './lib/progress';
import type { Progress } from './lib/progress';
import { parseHash } from './lib/router';

// 這個檔案用真實的課程資料（第 1 站有 4 課，其他站還沒有課）。

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  // jsdom 沒有實作 scrollTo。
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = '';
});

function seedProgress(progress: Progress): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/** 地圖上某一課的那一格（鎖住的課不是連結，所以用 listitem 找）。 */
function lessonItem(title: string): HTMLElement {
  const item = screen.getByText(title).closest('li');
  if (item === null) throw new Error(`找不到「${title}」那一格`);
  return item;
}

it('顯示網站名稱', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument();
});

it('每個測試結束後會清除 DOM，標題只會出現一次', () => {
  render(<App />);
  expect(screen.getAllByRole('heading', { name: '從零開始學物理' })).toHaveLength(1);
});

it('parseHash', () => {
  expect(parseHash('#/lesson/1-2')).toEqual({ name: 'lesson', id: '1-2' });
  expect(parseHash('')).toEqual({ name: 'map' });
  expect(parseHash('#/whatever')).toEqual({ name: 'map' });
  // 其他情況也一律回到地圖
  expect(parseHash('#/')).toEqual({ name: 'map' });
  expect(parseHash('#/lesson/')).toEqual({ name: 'map' });
  expect(parseHash('#/lesson/1-2/extra')).toEqual({ name: 'map' });
  expect(parseHash('#/lesson/%E4')).toEqual({ name: 'map' }); // 壞掉的編碼
});

it('地圖：第一課可以上，第二課鎖住，第 2 站即將推出', () => {
  render(<App />);

  const first = screen.getByRole('link', { name: /慣性/ });
  expect(first).toHaveTextContent('可以上');
  expect(first).toHaveAttribute('aria-current', 'step'); // 目前這一課
  expect(first).toHaveAttribute('href', '#/lesson/1-1');

  expect(screen.queryByRole('link', { name: /速度與位置/ })).not.toBeInTheDocument();
  expect(lessonItem('速度與位置')).toHaveTextContent('鎖住');
  expect(lessonItem('往上丟的球')).toHaveTextContent('鎖住');
  expect(screen.queryByText('已完成')).not.toBeInTheDocument();

  const station1 = screen.getByRole('region', { name: /運動/ });
  expect(within(station1).queryByText('即將推出')).not.toBeInTheDocument();
  const station2 = screen.getByRole('region', { name: /力與牛頓定律/ });
  expect(within(station2).getByText('即將推出')).toBeInTheDocument();
  expect(within(station2).queryByRole('link')).not.toBeInTheDocument();
  // 7 站都有標題
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7);
});

it('網址是不存在的課程，顯示「找不到這一課」和「回到地圖」', async () => {
  window.location.hash = '#/lesson/9-9';
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole('heading', { name: '找不到這一課' })).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(screen.queryByText('找不到這一課')).not.toBeInTheDocument();
});

it('網址是尚未解鎖的課程，顯示「這一課還沒解鎖」', async () => {
  window.location.hash = '#/lesson/1-3';
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole('heading', { name: '這一課還沒解鎖，先完成前面的課' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '加速度' })).not.toBeInTheDocument(); // 沒有開始上課
  expect(screen.queryByRole('button', { name: '離開' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(lessonItem('加速度')).toHaveTextContent('鎖住');
});

it('localStorage 拋出例外時，地圖照常顯示', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('可以上');
  expect(lessonItem('速度與位置')).toHaveTextContent('鎖住');
  expect(screen.getByText('0 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 0 天')).toBeInTheDocument();

  // 還是可以開始上課
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  expect(screen.getByRole('region', { name: '慣性' })).toBeInTheDocument();
});

it('從地圖點第一課：網址變成 #/lesson/1-1、捲回頂端；按「離開」回到 #/', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  expect(window.location.hash).toBe('#/lesson/1-1');
  expect(screen.getByRole('region', { name: '慣性' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toBeInTheDocument();
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument(); // 頁首還在

  vi.mocked(window.scrollTo).mockClear();
  await user.click(screen.getByRole('button', { name: '離開' }));
  expect(window.location.hash).toBe('#/');
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  // 中途離開不算完成
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('可以上');
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('頁首顯示存起來的 XP 和連續天數；地圖標出已完成、目前這一課、鎖住', () => {
  seedProgress({ version: 1, completed: ['1-1'], xp: 25, streak: 3, lastActiveDay: localDayKey(new Date()) });
  render(<App />);

  expect(screen.getByText('25 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 3 天')).toBeInTheDocument();

  const done = screen.getByRole('link', { name: /慣性/ });
  expect(done).toHaveTextContent('已完成'); // 上過的課可以再上一次
  expect(done).not.toHaveAttribute('aria-current');
  const current = screen.getByRole('link', { name: /速度與位置/ });
  expect(current).toHaveTextContent('可以上');
  expect(current).toHaveAttribute('aria-current', 'step');
  expect(lessonItem('加速度')).toHaveTextContent('鎖住');
});

it('進度不連續時（例如以後課程順序改了），上過的課一定打得開', () => {
  // 只完成了 1-2：1-1 還沒上（目前這一課），1-3 因為 1-2 完成而解鎖，1-4 鎖住。
  seedProgress({ version: 1, completed: ['1-2'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
  window.location.hash = '#/lesson/1-2';
  render(<App />);
  // 1-2 照解鎖規則算是鎖住的（1-1 沒完成），但上過的課可以複習
  expect(screen.getByRole('region', { name: '速度與位置' })).toBeInTheDocument();
  expect(screen.queryByText('這一課還沒解鎖，先完成前面的課')).not.toBeInTheDocument();
});

it('進度不連續時，地圖只把第一個可以上的課標成目前這一課', () => {
  seedProgress({ version: 1, completed: ['1-2'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
  render(<App />);
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('已完成');
  const other = screen.getByRole('link', { name: /加速度/ });
  expect(other).toHaveTextContent('可以上');
  expect(other).not.toHaveAttribute('aria-current');
  expect(lessonItem('往上丟的球')).toHaveTextContent('鎖住');
  expect(screen.getAllByRole('link', { current: 'step' })).toHaveLength(1);
});

it('最後一次學習是三天前，連續天數顯示 0', () => {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  seedProgress({ version: 1, completed: ['1-1'], xp: 10, streak: 5, lastActiveDay: localDayKey(threeDaysAgo) });
  render(<App />);
  expect(screen.getByText('連續 0 天')).toBeInTheDocument();
  expect(screen.getByText('10 XP')).toBeInTheDocument();
});

it('重新整理已解鎖的課程網址，直接進入那一課', () => {
  seedProgress({ version: 1, completed: ['1-1'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
  window.location.hash = '#/lesson/1-2';
  render(<App />);
  expect(screen.getByRole('region', { name: '速度與位置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '離開' })).toBeInTheDocument();
});

it('瀏覽器的上一頁、下一頁（hashchange）會切換畫面', async () => {
  render(<App />);
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();

  window.location.hash = '#/lesson/1-1';
  expect(await screen.findByRole('region', { name: '慣性' })).toBeInTheDocument();

  window.location.hash = '#/';
  expect(await screen.findByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '慣性' })).not.toBeInTheDocument();
});

it('頁尾有署名、授權說明和 GitHub 連結', () => {
  render(<App />);
  const footer = screen.getByRole('contentinfo');
  expect(within(footer).getByText('由 duncan60 與 Claude 一起製作，課程來自真實的學習過程')).toBeInTheDocument();
  expect(footer).toHaveTextContent('MIT');
  expect(footer).toHaveTextContent('CC BY-SA 4.0');
  expect(within(footer).getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/duncan60/physics-from-zero');
});
