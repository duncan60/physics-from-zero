import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, localDayKey } from './lib/progress';
import type { Progress } from './lib/progress';

// App 怎麼接 LessonPlayer 的 onComplete／onExit：換成一個假的上課畫面，不用真的把一課上完。
// 和真的 LessonPlayer 一樣：完成畫面一出現就呼叫 onComplete（只一次），完成畫面的「回到地圖」和中途「離開」都走 onExit。
// 真正的上課流程在 components/LessonPlayer.test.tsx 和 App.lessons.test.tsx 測。
vi.mock('./components/LessonPlayer', async () => {
  const { useState } = await import('react');
  function FakeLessonPlayer(props: {
    lesson: { id: string; title: string };
    onComplete: (xp: number) => void;
    onExit: () => void;
  }): React.JSX.Element {
    const [done, setDone] = useState(false);
    if (done) {
      return (
        <section aria-label={props.lesson.title}>
          <h2>假的完成畫面</h2>
          <button type="button" onClick={props.onExit}>
            回到地圖
          </button>
        </section>
      );
    }
    return (
      <section aria-label={props.lesson.title}>
        <button
          type="button"
          onClick={() => {
            setDone(true);
            props.onComplete(15);
          }}
        >
          假裝上完
        </button>
        <button type="button" onClick={props.onExit}>
          假裝離開
        </button>
      </section>
    );
  }
  return { LessonPlayer: FakeLessonPlayer };
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = '';
});

/** 瀏覽器的上一頁：等 popstate，再等緊接著的 hashchange 和畫面更新。 */
async function goBack(): Promise<void> {
  const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  window.history.back();
  await act(async () => {
    await popped;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function storedProgress(): Progress | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Progress);
}

it('上完一課：完成畫面一出現就存檔、頁首更新；按「回到地圖」回到 #/，下一課變成可以上', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  expect(window.location.hash).toBe('#/lesson/1-1');
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  // 存檔、更新頁首，但不換頁：學習者還在看完成畫面
  expect(window.location.hash).toBe('#/lesson/1-1');
  expect(screen.getByRole('heading', { name: '假的完成畫面' })).toBeInTheDocument();
  expect(storedProgress()).toEqual({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(storedProgress()).toEqual({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  const next = screen.getByRole('link', { name: /速度與位置/ });
  expect(next).toHaveTextContent('可以上');
  expect(next).toHaveAttribute('aria-current', 'step');
  // 按下的按鈕跟著上課畫面一起不見了：焦點移到 <main>，不會掉回 body
  expect(document.activeElement).toBe(screen.getByRole('main'));

  // 上完回到地圖不留下歷史紀錄：按上一頁不會重新打開剛上完的課
  await goBack();
  expect(screen.queryByRole('button', { name: '假裝上完' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  expect(screen.getByText('15 XP')).toBeInTheDocument();
});

it('看到完成畫面後沒按「回到地圖」，直接按上一頁：進度已經存好', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  await goBack();
  expect(screen.queryByRole('heading', { name: '假的完成畫面' })).not.toBeInTheDocument();
  expect(storedProgress()).toEqual({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('可以上');
});

it('再上一次已完成的課：XP 照加，completed 不重複', async () => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) }),
  );
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  expect(storedProgress()).toEqual({ version: 1, completed: ['1-1'], xp: 30, streak: 1, lastActiveDay: localDayKey(new Date()) });
  expect(screen.getByText('30 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();
});

it('中途離開：不存檔，回到 #/', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝離開' }));
  expect(window.location.hash).toBe('#/');
  expect(storedProgress()).toBeNull();
  expect(screen.getByText('0 XP')).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole('main'));

  await goBack();
  expect(screen.queryByRole('button', { name: '假裝離開' })).not.toBeInTheDocument();
});

it('存不進去（例如空間滿了）時，這次的進度仍然顯示在畫面上', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));
  expect(screen.getByText('15 XP')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('可以上');
});
