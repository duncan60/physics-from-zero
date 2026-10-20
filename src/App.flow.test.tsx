import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, completeLesson, loadProgress, localDayKey, setSoundOn } from './lib/progress';
import type { Progress } from './lib/progress';

// App 怎麼接 LessonPlayer 的 onComplete／onExit：換成一個假的上課畫面，不用真的把一課上完。
// 和真的 LessonPlayer 一樣：完成畫面一出現就呼叫 onComplete（只一次），完成畫面的「回到地圖」和中途「離開」都走 onExit。
// 真正的上課流程在 components/LessonPlayer.test.tsx 和 App.lessons.test.tsx 測。
vi.mock('./components/LessonPlayer', async () => {
  const { useState } = await import('react');
  function FakeLessonPlayer(props: {
    lesson: { id: string; title: string };
    onComplete: (result: { xp: number; perfect: boolean; accuracy: number; durationMs: number }) => void;
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
            props.onComplete({ xp: 15, perfect: false, accuracy: 50, durationMs: 60_000 });
          }}
        >
          假裝上完
        </button>
        <button
          type="button"
          onClick={() => {
            setDone(true);
            props.onComplete({ xp: 30, perfect: true, accuracy: 100, durationMs: 60_000 });
          }}
        >
          假裝完美
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

/**
 * 模擬同一個瀏覽器裡的另一個分頁上完一課：和真的 App 一樣讀出儲存空間的進度、加上這一課、存回去。
 * `notify`：瀏覽器會對「其他」分頁發出 storage 事件（寫入的分頁自己收不到），這裡手動發給畫面上的 App。
 * 分頁在背景被凍結時可能收不到事件，所以也要測不發事件的情況。
 */
function otherTabCompletes(lessonId: string, xp: number, options: { notify: boolean }): void {
  const oldValue = window.localStorage.getItem(STORAGE_KEY);
  const next = completeLesson(loadProgress(window.localStorage), lessonId, xp, localDayKey(new Date()));
  const newValue = JSON.stringify(next);
  window.localStorage.setItem(STORAGE_KEY, newValue);
  if (!options.notify) return;
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue, storageArea: window.localStorage }));
  });
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
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(window.location.hash).toBe('#/');
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
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
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('可以上');
});

it('再上一次已完成的課：XP 照加，completed 不重複（舊版的存檔也先轉成版本 2）', async () => {
  // 刻意存成版本 1 的舊格式：上完課存回去後要變成版本 2，已完成的課、XP、連續天數都還在
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()) }),
  );
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 30, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
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

/** 模擬另一個分頁切換音效：讀出儲存空間的進度、改音效、存回去，並發出 storage 事件。 */
function otherTabSetsSound(on: boolean): void {
  const oldValue = window.localStorage.getItem(STORAGE_KEY);
  const newValue = JSON.stringify(setSoundOn(loadProgress(window.localStorage), on));
  window.localStorage.setItem(STORAGE_KEY, newValue);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue, storageArea: window.localStorage }));
  });
}

it('拿到完美：存進 perfect，XP 照算，地圖上那一課顯示「完美」', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝完美' }));
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: ['1-1'], xp: 30, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
  expect(screen.getByText('30 XP')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('完美');

  // 再上一次沒拿到完美：仍然是金色的「完美」
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(storedProgress()).toMatchObject({ completed: ['1-1'], perfect: ['1-1'], xp: 45 });
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('完美');
});

it('音效開關：按了切換 aria-pressed，並寫進進度；重新載入仍是關閉', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  const on = screen.getByRole('button', { name: '音效：開' });
  expect(on).toHaveAttribute('aria-pressed', 'true'); // 預設開啟

  await user.click(on);
  const off = screen.getByRole('button', { name: '音效：關' });
  expect(off).toHaveAttribute('aria-pressed', 'false');
  expect(off).toHaveFocus(); // 還是同一顆按鈕，焦點留在原處
  expect(storedProgress()).toMatchObject({ soundOn: false });

  // 重新載入
  unmount();
  render(<App />);
  expect(screen.getByRole('button', { name: '音效：關' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: '音效：開' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '音效：關' }));
  expect(screen.getByRole('button', { name: '音效：開' })).toHaveAttribute('aria-pressed', 'true');
  expect(storedProgress()).toMatchObject({ soundOn: true });
});

it('音效開關：沒收到 storage 事件的舊分頁切換音效，不會蓋掉另一個分頁存的進度', async () => {
  const user = userEvent.setup();
  render(<App />);
  otherTabCompletes('1-1', 15, { notify: false });

  await user.click(screen.getByRole('button', { name: '音效：開' }));
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 15, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: false });
  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
});

it('另一個分頁切換音效（收到 storage 事件）：這個分頁跟著改', () => {
  render(<App />);
  otherTabSetsSound(false);
  expect(screen.getByRole('button', { name: '音效：關' })).toHaveAttribute('aria-pressed', 'false');
  otherTabSetsSound(true);
  expect(screen.getByRole('button', { name: '音效：開' })).toHaveAttribute('aria-pressed', 'true');
});

it('另一個分頁上完一課時，用的是那個分頁選的音效設定', () => {
  render(<App />);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setSoundOn(loadProgress(window.localStorage), false)));
  otherTabCompletes('1-1', 15, { notify: true });
  expect(screen.getByRole('button', { name: '音效：關' })).toBeInTheDocument();
  expect(screen.getByText('15 XP')).toBeInTheDocument();
});

it('儲存空間不能用時，音效開關照樣切換（只是記不住）', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '音效：開' }));
  expect(screen.getByRole('button', { name: '音效：關' })).toHaveAttribute('aria-pressed', 'false');
  await user.click(screen.getByRole('button', { name: '音效：關' }));
  expect(screen.getByRole('button', { name: '音效：開' })).toHaveAttribute('aria-pressed', 'true');
});

it('另一個分頁上完一課（收到 storage 事件）：這個分頁的頁首和地圖跟著更新', () => {
  render(<App />);
  expect(screen.getByText('0 XP')).toBeInTheDocument();

  otherTabCompletes('1-1', 15, { notify: true });

  expect(screen.getByText('15 XP')).toBeInTheDocument();
  expect(screen.getByText('連續 1 天')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /慣性/ })).toHaveTextContent('已完成');
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('可以上');
});

it('沒收到 storage 事件的舊分頁上完一課，不會蓋掉另一個分頁存的進度', async () => {
  const user = userEvent.setup();
  render(<App />); // 這個分頁打開時還沒有任何進度
  await user.click(screen.getByRole('link', { name: /慣性/ }));

  // 這段時間另一個分頁上完了 1-1 和 1-2，這個分頁沒收到通知
  otherTabCompletes('1-1', 15, { notify: false });
  otherTabCompletes('1-2', 15, { notify: false });

  await user.click(screen.getByRole('button', { name: '假裝上完' }));
  expect(storedProgress()).toEqual({ version: 2, completed: ['1-1', '1-2'], perfect: [], xp: 45, streak: 1, lastActiveDay: localDayKey(new Date()), soundOn: true });
  expect(screen.getByText('45 XP')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(screen.getByRole('link', { name: /速度與位置/ })).toHaveTextContent('已完成');
  expect(screen.getByRole('link', { name: /加速度/ })).toHaveTextContent('可以上');
});

it('存不進去時，連上兩課，XP 仍然在畫面上累加（不會被讀回來的空進度蓋掉）', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /慣性/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  await user.click(screen.getByRole('link', { name: /速度與位置/ }));
  await user.click(screen.getByRole('button', { name: '假裝上完' }));

  expect(screen.getByText('30 XP')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(screen.getByRole('link', { name: /加速度/ })).toHaveTextContent('可以上');
});
