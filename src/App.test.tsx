import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { reviewOf, stations } from './content/stations';
import { STORAGE_KEY, emptyProgress, localDayKey } from './lib/progress';
import type { Progress } from './lib/progress';
import { parseHash, routeToHash } from './lib/router';

// 這個檔案用真實的課程資料（第 1 站有 5 課，第 2 站有 1 課，其他站還沒有課）。

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

/** 瀏覽器的上一頁／下一頁：等 popstate（jsdom 和瀏覽器一樣是非同步的），再等緊接著的 hashchange 和畫面更新。 */
async function traverse(action: () => void): Promise<void> {
  const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  action();
  await act(async () => {
    await popped;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

it('地圖：第一課可以上，第二課鎖住，第 2 站的課鎖住，第一個還沒有課的站即將推出', () => {
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
  // 第 2 站已經有課：畫出路線，但還沒上完第 1 站，課是鎖住的
  const station2 = screen.getByRole('region', { name: /力與牛頓定律/ });
  expect(within(station2).queryByText('即將推出')).not.toBeInTheDocument();
  expect(within(station2).getByText('力與加速度').closest('li')).toHaveTextContent('鎖住');
  expect(within(station2).queryByRole('link')).not.toBeInTheDocument();
  // 哪一站還沒有課，隨著新增課程改變：看第一個沒有課的站；每一站都有課了，就沒有這項要檢查
  const emptyStation = stations.find((station) => station.lessons.length === 0);
  if (emptyStation !== undefined) {
    const region = screen.getByRole('region', { name: new RegExp(emptyStation.title) });
    expect(within(region).getByText('即將推出')).toBeInTheDocument();
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  }
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
  expect(document.activeElement).toBe(screen.getByRole('main')); // 換頁後焦點在主要內容，不是 body

  // 「回到地圖」不留下歷史紀錄：按上一頁不會再看到「找不到這一課」
  await traverse(() => window.history.back());
  expect(screen.queryByText('找不到這一課')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
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
  expect(document.activeElement).toBe(screen.getByRole('main'));

  await traverse(() => window.history.back());
  expect(screen.queryByText('這一課還沒解鎖，先完成前面的課')).not.toBeInTheDocument();
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
  expect(document.activeElement).toBe(document.body); // 第一次載入不移動焦點

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  expect(window.location.hash).toBe('#/lesson/1-1');
  expect(screen.getByRole('region', { name: '慣性' })).toBeInTheDocument();
  // 進入課程時，焦點交給上課畫面自己的第一個步驟，App 不搶
  expect(screen.getByRole('region', { name: '慣性' })).toContainElement(document.activeElement as HTMLElement);
  expect(document.activeElement).not.toBe(screen.getByRole('main'));
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toBeInTheDocument();
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument(); // 頁首還在

  vi.mocked(window.scrollTo).mockClear();
  await user.click(screen.getByRole('button', { name: '離開' }));
  expect(window.location.hash).toBe('#/');
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  // 按下的「離開」已經不見了，焦點移到 <main>，不會掉回 body
  expect(document.activeElement).toBe(screen.getByRole('main'));
  // 中途離開不算完成
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('可以上');
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('按「離開」回到地圖後，按上一頁不會回到這一課', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '離開' }));
  expect(window.location.hash).toBe('#/');

  await traverse(() => window.history.back());
  expect(screen.queryByRole('region', { name: '慣性' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '離開' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
});

it('頁首顯示存起來的 XP 和連續天數；地圖標出已完成、目前這一課、鎖住', () => {
  seedProgress({ ...emptyProgress(), completed: ['1-1'], xp: 25, streak: 3, lastActiveDay: localDayKey(new Date()) });
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

it('地圖：perfect 裡的課顯示「完美」；舊的「已完成」照常顯示', () => {
  // 1-4 在 perfect 裡、卻沒有完成（存檔被改過）：不算完美，也不會因此解鎖
  seedProgress({ ...emptyProgress(), completed: ['1-1', '1-2'], perfect: ['1-1', '1-4'], xp: 60, streak: 1, lastActiveDay: localDayKey(new Date()) });
  render(<App />);

  const gold = screen.getByRole('link', { name: /慣性/ });
  expect(gold).toHaveTextContent('完美');
  expect(gold).not.toHaveTextContent('已完成');
  expect(gold).toHaveClass('path-node--perfect');
  expect(gold).not.toHaveAttribute('aria-current');

  const done = screen.getByRole('link', { name: /速度與位置/ });
  expect(done).toHaveTextContent('已完成');
  expect(done).not.toHaveTextContent('完美');
  expect(done).toHaveClass('path-node--completed');

  // 不只顏色不同：完美和已完成的圖示也不一樣
  const icon = (link: HTMLElement) => link.querySelector('.path-node-circle svg')?.innerHTML;
  expect(icon(gold)).not.toBe(icon(done));

  expect(screen.getByRole('link', { name: /加速度/ })).toHaveAttribute('aria-current', 'step');
  expect(lessonItem('往上丟的球')).toHaveTextContent('鎖住');
  expect(lessonItem('往上丟的球')).not.toHaveTextContent('完美');
  expect(screen.getAllByText('完美')).toHaveLength(1);
});

it('進度不連續時（例如以後課程順序改了），上過的課一定打得開', () => {
  // 只完成了 1-2：1-1 還沒上（目前這一課），1-3 因為 1-2 完成而解鎖，1-4 鎖住。
  seedProgress({ ...emptyProgress(), completed: ['1-2'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
  window.location.hash = '#/lesson/1-2';
  render(<App />);
  // 1-2 照解鎖規則算是鎖住的（1-1 沒完成），但上過的課可以複習
  expect(screen.getByRole('region', { name: '速度與位置' })).toBeInTheDocument();
  expect(screen.queryByText('這一課還沒解鎖，先完成前面的課')).not.toBeInTheDocument();
});

it('進度不連續時，地圖只把第一個可以上的課標成目前這一課', () => {
  seedProgress({ ...emptyProgress(), completed: ['1-2'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
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
  seedProgress({ ...emptyProgress(), completed: ['1-1'], xp: 10, streak: 5, lastActiveDay: localDayKey(threeDaysAgo) });
  render(<App />);
  expect(screen.getByText('連續 0 天')).toBeInTheDocument();
  expect(screen.getByText('10 XP')).toBeInTheDocument();
});

it('重新整理已解鎖的課程網址，直接進入那一課', () => {
  seedProgress({ ...emptyProgress(), completed: ['1-1'], xp: 10, streak: 1, lastActiveDay: localDayKey(new Date()) });
  window.location.hash = '#/lesson/1-2';
  render(<App />);
  expect(screen.getByRole('region', { name: '速度與位置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '離開' })).toBeInTheDocument();
});

it('瀏覽器的上一頁、下一頁會切換畫面', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ })); // 從地圖打開一課：會留下歷史紀錄
  expect(screen.getByRole('region', { name: '慣性' })).toBeInTheDocument();

  await traverse(() => window.history.back());
  expect(window.location.hash).not.toBe('#/lesson/1-1');
  expect(screen.queryByRole('region', { name: '慣性' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole('main'));

  await traverse(() => window.history.forward());
  expect(window.location.hash).toBe('#/lesson/1-1');
  expect(screen.getByRole('region', { name: '慣性' })).toBeInTheDocument();
});

it('手動改網址（hashchange）也會切換畫面', async () => {
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

// ---- 每站的重點總結與複習 ----

const REVIEW_LOCKED = '本站重點與複習還沒解鎖，先完成這一站的每一課';

/** 這一站所有課程的 id，依課號排序。 */
function lessonIdsOf(stationId: number): string[] {
  return stations.find((station) => station.id === stationId)?.lessons.map((lesson) => lesson.id) ?? [];
}

/** 地圖上的某一站（標題是「第 N 站 站名」）。 */
function stationRegion(stationId: number): HTMLElement {
  const station = stations.find((s) => s.id === stationId);
  if (station === undefined) throw new Error(`沒有第 ${stationId} 站`);
  return screen.getByRole('region', { name: `第 ${station.id} 站 ${station.title}` });
}

/** 某一站路線上「本站重點與複習」的那一格（鎖住時不是連結，所以用 listitem 找）。 */
function reviewItem(stationId: number): HTMLElement {
  const item = within(stationRegion(stationId)).getByText('本站重點與複習').closest('li');
  if (item === null) throw new Error(`找不到第 ${stationId} 站的「本站重點與複習」`);
  return item;
}

function reviewLink(stationId: number): HTMLElement {
  return within(stationRegion(stationId)).getByRole('link', { name: /本站重點與複習/ });
}

const today = (): string => localDayKey(new Date());

it('parseHash／routeToHash：本站重點的網址是 #/review/站號，看不懂的一律回到地圖', () => {
  expect(parseHash('#/review/1')).toEqual({ name: 'review', stationId: 1 });
  expect(parseHash('#/review/12')).toEqual({ name: 'review', stationId: 12 });
  expect(routeToHash({ name: 'review', stationId: 2 })).toBe('#/review/2');
  expect(parseHash(routeToHash({ name: 'review', stationId: 7 }))).toEqual({ name: 'review', stationId: 7 });
  for (const hash of ['#/review', '#/review/', '#/review/abc', '#/review/0', '#/review/01', '#/review/-1', '#/review/1.5', '#/review/1/extra']) {
    expect(parseHash(hash), hash).toEqual({ name: 'map' });
  }
  // 複習本身是一課：#/lesson/review-1
  expect(parseHash('#/lesson/review-1')).toEqual({ name: 'lesson', id: 'review-1' });
});

it('地圖：有課程、有複習的站，路線的最後一個節點是「本站重點與複習」；課程還沒上完時鎖住', () => {
  render(<App />);
  let withReview = 0;
  for (const station of stations) {
    const region = stationRegion(station.id);
    if (station.lessons.length === 0 || reviewOf(station.id) === undefined) {
      expect(within(region).queryByText('本站重點與複習'), `第 ${station.id} 站`).not.toBeInTheDocument();
      continue;
    }
    withReview += 1;
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(station.lessons.length + 1);
    const last = items[items.length - 1];
    expect(last).toBe(reviewItem(station.id));
    expect(last).toHaveTextContent('鎖住');
    expect(within(last).queryByRole('link')).not.toBeInTheDocument();
  }
  expect(withReview).toBeGreaterThanOrEqual(2); // 第 1 站和第 2 站都有複習
  expect(screen.getAllByText('本站重點與複習')).toHaveLength(withReview);
});

it('還沒上完整站：直接打開 #/review/1 或 #/lesson/review-1，都顯示「還沒解鎖」', async () => {
  // 只差最後一課
  seedProgress({ ...emptyProgress(), completed: lessonIdsOf(1).slice(0, -1), xp: 40, streak: 1, lastActiveDay: today() });
  window.location.hash = '#/review/1';
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole('heading', { name: REVIEW_LOCKED })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /第 1 站重點/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '開始複習' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(reviewItem(1)).toHaveTextContent('鎖住');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  // 「回到地圖」不留下歷史紀錄
  await traverse(() => window.history.back());
  expect(screen.queryByText(REVIEW_LOCKED)).not.toBeInTheDocument();

  window.location.hash = '#/lesson/review-1';
  expect(await screen.findByRole('heading', { name: REVIEW_LOCKED })).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(); // 沒有開始複習
  expect(screen.queryByRole('button', { name: '離開' })).not.toBeInTheDocument();
});

it('網址是不存在的站、或還沒有複習的站：顯示「找不到這一站的重點」', async () => {
  window.location.hash = '#/review/99';
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('heading', { name: '找不到這一站的重點' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');

  const noReview = stations.find((station) => reviewOf(station.id) === undefined);
  if (noReview !== undefined) {
    window.location.hash = `#/review/${noReview.id}`;
    expect(await screen.findByRole('heading', { name: '找不到這一站的重點' })).toBeInTheDocument();
  }
  // 不存在的複習：和不存在的課一樣
  window.location.hash = '#/lesson/review-99';
  expect(await screen.findByRole('heading', { name: '找不到這一課' })).toBeInTheDocument();
});

it('舊存檔（只有課程的完成紀錄）：整站上完，本站重點與複習變成可以上；下一站第一課仍是目前這一課', () => {
  // 版本 1 的存檔：那時還沒有複習
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, completed: lessonIdsOf(1), xp: 100, streak: 1, lastActiveDay: today() }),
  );
  render(<App />);

  const node = reviewLink(1);
  expect(node).toHaveTextContent('可以上');
  expect(node).toHaveAttribute('href', '#/review/1');
  expect(node).toHaveClass('path-node--available');
  expect(node).toHaveAccessibleName('第 1 站 本站重點與複習 可以上');
  // 複習是選擇性的：不搶「目前這一課」，下一站第一課照常解鎖
  expect(node).not.toHaveAttribute('aria-current');
  const next = screen.getByRole('link', { name: /力與加速度/ });
  expect(next).toHaveTextContent('可以上');
  expect(next).toHaveAttribute('aria-current', 'step');
  expect(screen.getAllByRole('link', { current: 'step' })).toHaveLength(1);
  expect(reviewItem(2)).toHaveTextContent('鎖住');
  // 走到「本站重點與複習」的最後一段路線，畫成走過的樣子
  const segments = stationRegion(1).querySelectorAll('.path-segment');
  expect(segments).toHaveLength(lessonIdsOf(1).length);
  expect(segments[segments.length - 1]).toHaveClass('path-segment--done');
});

it('做完複習：已完成；全對：完美（金色、星星，和課程一樣）', () => {
  seedProgress({
    ...emptyProgress(),
    completed: [...lessonIdsOf(1), 'review-1', ...lessonIdsOf(2), 'review-2'],
    perfect: ['review-2'],
    xp: 300,
    streak: 1,
    lastActiveDay: today(),
  });
  render(<App />);

  const done = reviewLink(1);
  expect(done).toHaveTextContent('已完成');
  expect(done).not.toHaveTextContent('完美');
  expect(done).toHaveClass('path-node--completed');

  const gold = reviewLink(2);
  expect(gold).toHaveTextContent('完美');
  expect(gold).not.toHaveTextContent('已完成');
  expect(gold).toHaveClass('path-node--perfect');
  expect(gold).toHaveAttribute('href', '#/review/2');

  // 不只顏色不同：圖示也不一樣
  const icon = (link: HTMLElement) => link.querySelector('.path-node-circle svg')?.innerHTML;
  expect(icon(gold)).not.toBe(icon(done));
});

it('perfect 裡有複習、卻沒有完成（存檔被改過）：不算完美，課程沒上完也打不開', () => {
  seedProgress({ ...emptyProgress(), completed: ['1-1'], perfect: ['review-1'], xp: 10, streak: 1, lastActiveDay: today() });
  render(<App />);
  expect(reviewItem(1)).toHaveTextContent('鎖住');
  expect(reviewItem(1)).not.toHaveTextContent('完美');
});

it('做過的複習一定打得開：以後這一站多了一課、還沒上，總結頁也不會變成「還沒解鎖」', () => {
  // 第 1 站最後一課沒完成，卻做過複習（例如以後第 1 站多了一課）
  seedProgress({ ...emptyProgress(), completed: [...lessonIdsOf(1).slice(0, -1), 'review-1'], xp: 60, streak: 1, lastActiveDay: today() });
  window.location.hash = '#/review/1';
  render(<App />);
  expect(screen.getByRole('heading', { name: '第 1 站重點：運動' })).toBeInTheDocument();
  expect(screen.queryByText(REVIEW_LOCKED)).not.toBeInTheDocument();
});

it('做了複習，下一站第一課照原規則：前一課沒完成就還是鎖住', () => {
  seedProgress({ ...emptyProgress(), completed: [...lessonIdsOf(1).slice(0, -1), 'review-1'], xp: 60, streak: 1, lastActiveDay: today() });
  render(<App />);
  expect(reviewLink(1)).toHaveTextContent('已完成');
  expect(lessonItem('力與加速度')).toHaveTextContent('鎖住');
  const last = stations[0].lessons[stations[0].lessons.length - 1];
  expect(screen.getByRole('link', { name: new RegExp(last.title) })).toHaveAttribute('aria-current', 'step');
});

it('整站上完：從地圖打開本站重點 → 總結頁；「開始複習」進入複習，上一頁回到總結頁', async () => {
  seedProgress({ ...emptyProgress(), completed: lessonIdsOf(1), xp: 100, streak: 1, lastActiveDay: today() });
  const user = userEvent.setup();
  render(<App />);

  await user.click(reviewLink(1));
  expect(window.location.hash).toBe('#/review/1');
  expect(screen.getByRole('heading', { level: 2, name: '第 1 站重點：運動' })).toBeInTheDocument();
  for (const name of ['重點', '公式', '常見陷阱']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole('main')); // 換頁後焦點在主要內容
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

  await user.click(screen.getByRole('button', { name: '開始複習' }));
  expect(window.location.hash).toBe('#/lesson/review-1');
  expect(screen.getByRole('region', { name: '第 1 站複習' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toBeInTheDocument();
  // 複習題下方也有「回報問題」
  expect(screen.getByRole('link', { name: /回報問題/ })).toBeInTheDocument();

  // 上一頁：回到總結頁
  await traverse(() => window.history.back());
  expect(window.location.hash).toBe('#/review/1');
  expect(screen.getByRole('heading', { name: '第 1 站重點：運動' })).toBeInTheDocument();

  // 總結頁的「回到地圖」：取代這一筆，上一頁不會再回到總結頁
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(reviewLink(1)).toHaveTextContent('可以上');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  await traverse(() => window.history.back());
  expect(screen.queryByRole('heading', { name: '第 1 站重點：運動' })).not.toBeInTheDocument();
  expect(reviewLink(1)).toBeInTheDocument();
});
