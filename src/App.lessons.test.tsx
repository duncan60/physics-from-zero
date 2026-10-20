import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { stations } from './content/stations';
import { blankCells } from './lib/answer';
import { STORAGE_KEY, XP_PER_FIRST_TRY, XP_PER_LESSON } from './lib/progress';
import type { Progress } from './lib/progress';
import type { Lesson, Step } from './lib/types';

// 用真實的課程，透過真的 App 和真的上課畫面（不換掉 LessonPlayer）把課上完。
// 每一題的正確答案直接從課程資料讀出來，再用角色和名稱找到選項、輸入框和按鈕，像學習者一樣作答。

const lessons = stations.flatMap((station) => station.lessons);

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

function isQuestion(step: Step): boolean {
  return step.kind === 'choice' || step.kind === 'number' || step.kind === 'table';
}

/** 依課程資料填入正確答案，按「檢查」，看到「答對了」再按「繼續」。觀念卡和模擬直接按「繼續」。 */
async function playStep(user: User, step: Step): Promise<void> {
  switch (step.kind) {
    case 'concept':
    case 'sim':
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
  }
  await user.click(button('檢查'));
  expect(screen.getByText('答對了'), `${step.id}：沒有答對`).toBeInTheDocument();
  await user.click(button('繼續'));
}

/** 從地圖打開一課，每一步都第一次就答對，停在完成畫面。回傳這一課得到的 XP。 */
async function playLesson(user: User, lesson: Lesson): Promise<number> {
  await user.click(lessonLink(lesson));
  expect(window.location.hash).toBe(`#/lesson/${lesson.id}`);
  expect(screen.getByRole('region', { name: lesson.title })).toBeInTheDocument();
  for (const [index, step] of lesson.steps.entries()) {
    expect(screen.getByRole('progressbar', { name: '課程進度' }), `${lesson.id} ${step.id}`).toHaveAttribute('aria-valuenow', String(index));
    await playStep(user, step);
  }
  const gained = XP_PER_LESSON + lesson.steps.filter(isQuestion).length * XP_PER_FIRST_TRY;
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText(`本課獲得 ${gained} XP`)).toBeInTheDocument();
  return gained;
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
  expect(lessonLink(first)).toHaveTextContent('已完成');
  expect(lessonLink(second)).toHaveTextContent('可以上');
  expect(screen.getByText(`${gained} XP`)).toBeInTheDocument();
});

it('依序上完每一課（每一題都第一次就答對）：每一課都會完成，並解鎖下一課', async () => {
  const user = setupUser();
  render(<App />);
  let totalXp = 0;

  for (const [index, lesson] of lessons.entries()) {
    const next = lessons[index + 1] as Lesson | undefined;
    if (next !== undefined) expect(lessonItem(next)).toHaveTextContent('鎖住');

    totalXp += await playLesson(user, lesson);
    expect(storedProgress()).toMatchObject({ completed: lessons.slice(0, index + 1).map((l) => l.id), xp: totalXp });
    expect(screen.getByText(`${totalXp} XP`)).toBeInTheDocument(); // 頁首在完成畫面就更新了

    await user.click(button('回到地圖'));
    expect(window.location.hash).toBe('#/');
    expect(lessonLink(lesson)).toHaveTextContent('已完成');
    if (next !== undefined) {
      expect(lessonLink(next)).toHaveTextContent('可以上');
      expect(lessonLink(next)).toHaveAttribute('aria-current', 'step');
    }
  }

  expect(storedProgress()).toMatchObject({ completed: lessons.map((l) => l.id), xp: totalXp, streak: 1 });
  expect(screen.queryAllByRole('link', { current: 'step' })).toHaveLength(0); // 全部上完，沒有「目前這一課」
});
