import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, localDayKey } from './lib/progress';
import type { Progress } from './lib/progress';

// App 怎麼接 LessonPlayer 的 onComplete／onExit：換成一個假的上課畫面，不用真的把一課上完。
// 真正的上課流程在 components/LessonPlayer.test.tsx 測。
vi.mock('./components/LessonPlayer', () => ({
  LessonPlayer: (props: { lesson: { id: string; title: string }; onComplete: (xp: number) => void; onExit: () => void }) => (
    <section aria-label={props.lesson.title}>
      <button type="button" onClick={() => props.onComplete(15)}>
        假裝上完
      </button>
      <button type="button" onClick={props.onExit}>
        假裝離開
      </button>
    </section>
  ),
}));

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

function storedProgress(): Progress | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Progress);
}

it('上完一課：存檔、回到 #/、頁首更新、下一課變成可以上', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  expect(window.location.hash).toBe('#/lesson/1-1');
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  expect(window.location.hash).toBe('#/');
  expect(storedProgress()).toEqual({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  const next = screen.getByRole('link', { name: /速度與位置/ });
  expect(next).toHaveTextContent('可以上');
  expect(next).toHaveAttribute('aria-current', 'step');
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
});

it('存不進去（例如空間滿了）時，這次的進度仍然顯示在畫面上', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  expect(window.location.hash).toBe('#/');
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('可以上');
});
