import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { tileName } from './components/steps/FormulaInput';
import { isLastLessonOfStation, reviewAsLesson, reviewLessonId, reviewOf, reviewStationOf, stationOf, stations } from './content/stations';
import { blankCells } from './lib/answer';
import { formulaTiles } from './lib/formula';
import { emptyStats, lessonXp, recordQuestion } from './lib/game';
import { PERFECT_BONUS_XP, STORAGE_KEY, XP_PER_FIRST_TRY, XP_PER_LESSON, emptyProgress, localDayKey } from './lib/progress';
import type { Progress } from './lib/progress';
import { RUNS_KEY, loadRun } from './lib/runs';
import type { Lesson, StationReview, Step } from './lib/types';

// 用真實的課程，透過真的 App 和真的上課畫面（不換掉 LessonPlayer）把課上完；每站的複習也一樣。
// 每一題的正確答案直接從課程資料讀出來，再用角色和名稱找到選項、輸入框和按鈕，像學習者一樣作答。

const lessons = stations.flatMap((station) => station.lessons);

/** 有複習的站的複習（有複習的站一定有課程，content.test.ts 檢查）。 */
const reviews: StationReview[] = stations.flatMap((station) => {
  const review = reviewOf(station.id);
  return review === undefined ? [] : [review];
});

// 按鈕在畫面換了之後的一小段時間內不會有反應（防連點），所以和 LessonPlayer.test.tsx 一樣用假的時鐘：
// `user` 每個動作的前後都等 SETTLE_MS，像一般人一樣按。
const SETTLE_MS = 500;

type User = ReturnType<typeof userEvent.setup>;

function setupUser(): User {
  return userEvent.setup({ delay: SETTLE_MS, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  window.location.hash = '';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); // jsdom 沒有實作 scrollTo
  // 減少動態效果：1-1 的公車與球模擬不跑動畫迴圈
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  window.localStorage.clear();
  window.location.hash = '';
});

function storedProgress(): Progress | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Progress);
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

const button = (name: string) => screen.getByRole('button', { name });

/** 地圖上某一課的連結（鎖住的課不是連結）。 */
function lessonLink(lesson: Lesson): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(lesson.title) });
}

/** 地圖上某一課的那一格。 */
function lessonItem(lesson: Lesson): HTMLElement {
  const item = screen.getByText(lesson.title).closest('li');
  if (item === null) throw new Error(`找不到「${lesson.title}」那一格`);
  return item;
}

/** 地圖上某一站路線最後的「本站重點與複習」連結。 */
function reviewLink(stationId: number): HTMLElement {
  const station = stations.find((s) => s.id === stationId);
  if (station === undefined) throw new Error(`沒有第 ${stationId} 站`);
  const region = screen.getByRole('region', { name: `第 ${station.id} 站 ${station.title}` });
  return within(region).getByRole('link', { name: /本站重點與複習/ });
}

// 題目（含配對）才算進一次答對、連續答對和完美；觀念卡和模擬不算。新增一種步驟時，這裡少了 case 就會編譯失敗。
function isQuestion(step: Step): boolean {
  switch (step.kind) {
    case 'choice':
    case 'number':
    case 'table':
    case 'formula':
    case 'slider':
    case 'match':
      return true;
    case 'concept':
    case 'sim':
      return false;
  }
}

/** 第一次就答錯：選擇題選一個錯的選項，數字題和表格題填一個差很遠的數字；按「檢查」→「看解答」→「繼續」。 */
async function playStepWrong(user: User, step: Step): Promise<void> {
  switch (step.kind) {
    case 'choice': {
      const wrong = step.options.find((option) => option.id !== step.answer);
      if (wrong === undefined) throw new Error(`${step.id}：沒有錯的選項`);
      await user.click(screen.getByRole('radio', { name: wrong.label }));
      break;
    }
    case 'number':
      await user.type(screen.getByRole('textbox', { name: step.prompt }), String(step.answer + 1000));
      break;
    case 'table':
      for (const blank of blankCells(step)) {
        const name = `${step.rows[blank.row].label}，${step.columns[blank.col]}`;
        await user.type(screen.getByRole('textbox', { name }), String(blank.answer + 1000));
      }
      break;
    default:
      throw new Error(`${step.id}：不是題目`);
  }
  await user.click(button('檢查'));
  expect(screen.getByText('還不對'), `${step.id}：應該答錯`).toBeInTheDocument();
  await user.click(button('看解答'));
  await user.click(button('繼續'));
}

/**
 * 依課程資料填入正確答案，按「檢查」，看到「答對了」再按「繼續」。觀念卡和模擬直接按「繼續」。
 * 拼算式：依序點第一個可接受寫法的磚塊（一樣的磚塊點下方還沒用到的第一塊），檢查後在第 2 步填答案；
 * 拉滑桿：拉到正確值（用 change 模擬拖拉）；配對：每個左邊點完再點它的右邊，配完直接出現「答對了」，沒有「檢查」。
 */
async function playStep(user: User, step: Step): Promise<void> {
  switch (step.kind) {
    case 'concept':
    case 'sim':
      await user.click(button('繼續'));
      return;
    case 'match':
      for (const pair of step.pairs) {
        await user.click(button(pair.left));
        await user.click(button(pair.right));
      }
      expect(screen.getByText('答對了'), `${step.id}：沒有配完`).toBeInTheDocument();
      await user.click(button('繼續'));
      return;
    case 'choice': {
      const correct = step.options.find((option) => option.id === step.answer);
      if (correct === undefined) throw new Error(`${step.id}：找不到正確選項`);
      await user.click(screen.getByRole('radio', { name: correct.label }));
      break;
    }
    case 'number':
      await user.type(screen.getByRole('textbox', { name: step.prompt }), String(step.answer));
      break;
    case 'table':
      for (const blank of blankCells(step)) {
        const name = `${step.rows[blank.row].label}，${step.columns[blank.col]}`;
        await user.type(screen.getByRole('textbox', { name }), String(blank.answer));
      }
      break;
    case 'formula': {
      const bank = screen.getByRole('group', { name: '磚塊' });
      // 找下方還沒用到、寫法一樣的第一塊（有標示的磚塊在算式裡是「20|力」，按鈕名稱是「放入 20（力）」）
      const tokens = formulaTiles(step);
      const used = new Set<number>();
      for (const token of step.accepted[0]) {
        const tile = tokens.findIndex((t, i) => t === token && !used.has(i));
        used.add(tile);
        await user.click(within(bank).getAllByRole('button', { name: `放入 ${tileName(step.tiles[tile], step.tileLabels?.[tile])}` })[0]);
      }
      await user.click(button('檢查'));
      expect(screen.queryByText('還不對'), `${step.id}：算式沒有拼對`).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: /第 2 步：算出答案/ }), String(step.answer));
      break;
    }
    case 'slider':
      fireEvent.change(screen.getByRole('slider', { name: step.quantity }), { target: { value: String(step.answer) } });
      break;
  }
  await user.click(button('檢查'));
  expect(screen.getByText('答對了'), `${step.id}：沒有答對`).toBeInTheDocument();
  await user.click(button('繼續'));
}

/**
 * 從地圖打開一課，停在完成畫面。預設每一步都第一次就答對（完美）；`missFirst`：第一題故意答錯、看解答。
 * 回傳這一課得到的 XP（用 lib/game 的規則算：基本 + 一次答對 + 連續答對加分 + 完美加分）。
 */
async function playLesson(user: User, lesson: Lesson, options: { missFirst?: boolean } = {}): Promise<number> {
  await user.click(lessonLink(lesson));
  return playSteps(user, lesson, options);
}

/** 已經在這一課（或複習）的第一步：每一步作答，停在完成畫面。回傳得到的 XP。 */
async function playSteps(user: User, lesson: Lesson, options: { missFirst?: boolean } = {}): Promise<number> {
  expect(window.location.hash).toBe(`#/lesson/${lesson.id}`);
  expect(screen.getByRole('region', { name: lesson.title })).toBeInTheDocument();
  let stats = emptyStats();
  for (const [index, step] of lesson.steps.entries()) {
    expect(screen.getByRole('progressbar', { name: '課程進度' }), `${lesson.id} ${step.id}`).toHaveAttribute('aria-valuenow', String(index));
    const miss = options.missFirst === true && isQuestion(step) && stats.questions === 0;
    if (miss) await playStepWrong(user, step);
    else await playStep(user, step);
    if (isQuestion(step)) stats = recordQuestion(stats, !miss);
  }
  const gained = lessonXp(stats);
  // 複習的完成畫面寫「完成複習」「本次複習獲得 N XP」，一般的課是「完成這一課」「本課獲得 N XP」
  if (reviewStationOf(lesson.id) === undefined) {
    expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
    expect(screen.getByText(`本課獲得 ${gained} XP`)).toBeInTheDocument();
  } else {
    expect(screen.getByRole('heading', { name: '完成複習' })).toBeInTheDocument();
    expect(screen.getByText(`本次複習獲得 ${gained} XP`)).toBeInTheDocument();
  }
  if (options.missFirst === true) expect(screen.queryByText('完美！')).not.toBeInTheDocument();
  else expect(screen.getByText('完美！')).toBeInTheDocument();
  return gained;
}

/**
 * 已經在第 N 站的總結頁：看得到重點、公式、常見陷阱，按「開始複習」，把複習題做完，停在完成畫面。回傳得到的 XP。
 */
async function playReviewFromSummary(user: User, review: StationReview, options: { missFirst?: boolean } = {}): Promise<number> {
  const station = stations.find((s) => s.id === review.stationId);
  expect(window.location.hash).toBe(`#/review/${review.stationId}`);
  expect(screen.getByRole('heading', { name: `第 ${review.stationId} 站重點：${station?.title}` })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '重點' })).getAllByRole('listitem')).toHaveLength(review.points.length);
  await user.click(button('開始複習'));
  return playSteps(user, reviewAsLesson(review), options);
}

/** 從地圖點「本站重點與複習」→ 總結頁 → 做完複習，停在完成畫面。回傳得到的 XP。 */
async function playReview(user: User, review: StationReview, options: { missFirst?: boolean } = {}): Promise<number> {
  await user.click(reviewLink(review.stationId));
  return playReviewFromSummary(user, review, options);
}

it('看到完成畫面就已經存檔：沒按「回到地圖」直接按上一頁，這一課仍算完成，下一課解鎖', async () => {
  const user = setupUser();
  render(<App />);
  const [first, second] = lessons;

  const gained = await playLesson(user, first);
  // 一出現完成畫面就存好了（直接關掉分頁也不會不見），頁首也已經更新，網址還在這一課
  expect(window.location.hash).toBe(`#/lesson/${first.id}`);
  expect(storedProgress()).toMatchObject({ completed: [first.id], xp: gained, streak: 1 });
  expect(screen.getByText(`${gained} XP`)).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();

  // Android 的返回手勢、iPhone 的往右滑：瀏覽器的上一頁
  await goBack();
  expect(screen.queryByRole('heading', { name: '完成這一課' })).not.toBeInTheDocument();
  expect(storedProgress()).toMatchObject({ completed: [first.id], xp: gained, streak: 1 });
  expect(gained).toBeGreaterThan(0);
  expect(lessonLink(first)).toHaveTextContent('完美'); // 每一題都第一次就答對
  expect(lessonLink(second)).toHaveTextContent('可以上');
  expect(screen.getByText(`${gained} XP`)).toBeInTheDocument();
});

// 每多一課，這個測試就跑得更久；GitHub Actions 的機器比本機慢，預設的 5 秒不夠。
it('依序上完每一課（每一題都第一次就答對）：每一課都會完成，並解鎖下一課；上完一站就看重點、做完複習', { timeout: 60_000 }, async () => {
  const user = setupUser();
  render(<App />);
  let totalXp = 0;
  const completed: string[] = [];

  for (const [index, lesson] of lessons.entries()) {
    const next = lessons[index + 1] as Lesson | undefined;
    if (next !== undefined) expect(lessonItem(next)).toHaveTextContent('鎖住');

    totalXp += await playLesson(user, lesson);
    completed.push(lesson.id);
    expect(storedProgress()).toMatchObject({ completed, xp: totalXp });
    expect(screen.getByText(`${totalXp} XP`)).toBeInTheDocument(); // 頁首在完成畫面就更新了

    const stationId = stationOf(lesson.id);
    const review = stationId === undefined ? undefined : reviewOf(stationId);
    if (review !== undefined && isLastLessonOfStation(lesson.id)) {
      // 上完一站的最後一課：完成畫面的「看本站重點」→ 總結頁 →「開始複習」→ 做完 → 回到地圖，節點變成完美
      await user.click(button('看本站重點'));
      totalXp += await playReviewFromSummary(user, review);
      completed.push(reviewLessonId(review.stationId));
      expect(storedProgress()).toMatchObject({ completed, xp: totalXp });
      expect(screen.queryByRole('button', { name: '看本站重點' })).not.toBeInTheDocument();
      await user.click(button('回到地圖'));
      expect(reviewLink(review.stationId)).toHaveTextContent('完美');
    } else {
      expect(screen.queryByRole('button', { name: '看本站重點' })).not.toBeInTheDocument();
      await user.click(button('回到地圖'));
    }

    expect(window.location.hash).toBe('#/');
    expect(lessonLink(lesson)).toHaveTextContent('完美');
    if (next !== undefined) {
      expect(lessonLink(next)).toHaveTextContent('可以上');
      expect(lessonLink(next)).toHaveAttribute('aria-current', 'step');
    }
  }

  // 每一站的複習都做過了
  for (const review of reviews) expect(completed).toContain(reviewLessonId(review.stationId));
  expect(storedProgress()).toMatchObject({ completed, perfect: completed, xp: totalXp, streak: 1 });
  expect(screen.queryAllByRole('link', { current: 'step' })).toHaveLength(0); // 全部上完，沒有「目前這一課」
});

it('複習第一題答錯：節點是「已完成」；再做一次全對：變成「完美」；下一站第一課一直都是目前這一課', { timeout: 60_000 }, async () => {
  const [review] = reviews;
  const stationLessons = stations.find((s) => s.id === review.stationId)?.lessons.map((l) => l.id) ?? [];
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...emptyProgress(), completed: stationLessons, xp: 100, streak: 1, lastActiveDay: localDayKey(new Date()) }),
  );
  const user = setupUser();
  render(<App />);
  const nextStation = stations.find((s) => s.id === review.stationId + 1)?.lessons[0];
  const expectNextIsCurrent = (): void => {
    if (nextStation === undefined) return;
    expect(lessonLink(nextStation)).toHaveAttribute('aria-current', 'step');
  };
  expect(reviewLink(review.stationId)).toHaveTextContent('可以上');
  expectNextIsCurrent();

  const missed = await playReview(user, review, { missFirst: true });
  const reviewId = reviewLessonId(review.stationId);
  expect(storedProgress()).toMatchObject({ completed: [...stationLessons, reviewId], perfect: [], xp: 100 + missed });
  await user.click(button('回到地圖'));
  expect(reviewLink(review.stationId)).toHaveTextContent('已完成');
  expect(reviewLink(review.stationId)).not.toHaveTextContent('完美');
  expectNextIsCurrent();

  const perfect = await playReview(user, review);
  expect(perfect).toBeGreaterThan(missed); // 完美加分
  expect(storedProgress()).toMatchObject({ completed: [...stationLessons, reviewId], perfect: [reviewId], xp: 100 + missed + perfect });
  await user.click(button('回到地圖'));
  expect(reviewLink(review.stationId)).toHaveTextContent('完美');
  expectNextIsCurrent();
});

it('App：拿到完美後，地圖上那一課變成「完美」，XP 包含完美加分', async () => {
  const user = setupUser();
  render(<App />);
  const [first] = lessons;

  // 第一次：第一題答錯 → 只是「已完成」，沒有完美加分
  const missed = await playLesson(user, first, { missFirst: true });
  expect(storedProgress()).toMatchObject({ completed: [first.id], perfect: [], xp: missed });
  await user.click(button('回到地圖'));
  expect(lessonLink(first)).toHaveTextContent('已完成');
  expect(lessonLink(first)).not.toHaveTextContent('完美');

  // 重上一次，全部第一次就答對 → 完美，XP 多了完美加分
  const perfect = await playLesson(user, first);
  // 基本 + 每題一次答對 + 完美加分（題目夠多時還有連續答對加分）
  const questions = first.steps.filter(isQuestion).length;
  expect(perfect).toBeGreaterThanOrEqual(XP_PER_LESSON + questions * XP_PER_FIRST_TRY + PERFECT_BONUS_XP);
  expect(storedProgress()).toMatchObject({ completed: [first.id], perfect: [first.id], xp: missed + perfect });
  expect(screen.getByText(`${missed + perfect} XP`)).toBeInTheDocument();
  await user.click(button('回到地圖'));
  expect(lessonLink(first)).toHaveTextContent('完美');
  expect(lessonLink(first)).not.toHaveTextContent('已完成');

  // 再上一次又答錯：已經是完美的課不會變回來
  await playLesson(user, first, { missFirst: true });
  await user.click(button('回到地圖'));
  expect(storedProgress()).toMatchObject({ perfect: [first.id] });
  expect(lessonLink(first)).toHaveTextContent('完美');
});

// ---- 課內存檔：重新整理、或「離開」後再打開，從上次那一步繼續（課程和複習都一樣） ----

/** 每一步都一次答對時，這一課的 XP（lib/game 的規則）。 */
function cleanXp(lesson: Lesson): number {
  let stats = emptyStats();
  for (const step of lesson.steps) if (isQuestion(step)) stats = recordQuestion(stats, true);
  return lessonXp(stats);
}

/** 從第 from 步（從 0 算起）做到 to 之前，每一步都一次答對。 */
async function playRange(user: User, lesson: Lesson, from: number, to: number): Promise<void> {
  for (let index = from; index < to; index += 1) {
    expect(screen.getByRole('progressbar', { name: '課程進度' }), `${lesson.id} 第 ${index + 1} 步`).toHaveAttribute('aria-valuenow', String(index));
    await playStep(user, lesson.steps[index]);
  }
}

it('上課上到一半重新整理：從那一步繼續；做完的 XP、完美和一次做完的一樣，存檔清掉，一般進度的格式不變', async () => {
  const [first] = lessons;
  const stop = Math.min(3, first.steps.length - 1);
  const user = setupUser();
  const page = render(<App />);
  await user.click(lessonLink(first));
  expect(screen.queryByText(/^從上次的第 \d+ 步繼續$/)).not.toBeInTheDocument();
  await playRange(user, first, 0, stop);
  expect(window.location.hash).toBe(`#/lesson/${first.id}`);

  // 重新整理：整個 App 重新掛載，網址還在這一課
  page.unmount();
  render(<App />);
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toHaveAttribute('aria-valuenow', String(stop));
  expect(screen.getByText(`從上次的第 ${stop + 1} 步繼續`)).toBeInTheDocument();
  expect(button('從頭開始')).toBeInTheDocument();
  await playRange(user, first, stop, first.steps.length);

  expect(screen.getByText('完美！')).toBeInTheDocument();
  expect(screen.getByText(`本課獲得 ${cleanXp(first)} XP`)).toBeInTheDocument();
  expect(storedProgress()).toEqual({ version: 2, completed: [first.id], perfect: [first.id], xp: cleanXp(first), streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
  expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
});

it('「離開」不再確認：直接回到地圖；從地圖再打開同一課，回到離開時的那一步；「從頭開始」回到第 1 步', async () => {
  const [first] = lessons;
  const user = setupUser();
  render(<App />);
  await user.click(lessonLink(first));
  await playRange(user, first, 0, 2);
  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(window.location.hash).toBe('#/');
  expect(storedProgress()).toBeNull(); // 還沒上完，一般進度不動

  await user.click(lessonLink(first));
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByText('從上次的第 3 步繼續')).toBeInTheDocument();

  await user.click(button('從頭開始'));
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByText(/^從上次的第 \d+ 步繼續$/)).not.toBeInTheDocument();
  expect(loadRun(window.localStorage, first.id, first.steps.length)).toBeNull();
});

it('複習（review-站號）也能續做：重新整理後從那一步繼續，做完照常記進度', async () => {
  const [review] = reviews;
  const lesson = reviewAsLesson(review);
  const stationLessons = stations.find((s) => s.id === review.stationId)?.lessons.map((l) => l.id) ?? [];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyProgress(), completed: stationLessons, xp: 100, streak: 1, lastActiveDay: localDayKey(new Date()) }));
  window.location.hash = `#/lesson/${lesson.id}`;
  const user = setupUser();
  const page = render(<App />);
  await playRange(user, lesson, 0, 2);

  page.unmount();
  render(<App />);
  expect(screen.getByText('從上次的第 3 步繼續')).toBeInTheDocument();
  await playRange(user, lesson, 2, lesson.steps.length);
  expect(screen.getByRole('heading', { name: '完成複習' })).toBeInTheDocument();
  expect(screen.getByText(`本次複習獲得 ${cleanXp(lesson)} XP`)).toBeInTheDocument();
  expect(storedProgress()).toMatchObject({ completed: [...stationLessons, lesson.id], perfect: [lesson.id], xp: 100 + cleanXp(lesson) });
  expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
});

it('localStorage 不能用時照常上課（沒有存檔，也沒有「從上次…」）', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  const [first] = lessons;
  const user = setupUser();
  const page = render(<App />);
  await user.click(lessonLink(first));
  await playRange(user, first, 0, 2);
  page.unmount();
  render(<App />);
  expect(screen.getByRole('progressbar', { name: '課程進度' })).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByText(/^從上次的第 \d+ 步繼續$/)).not.toBeInTheDocument();
});
