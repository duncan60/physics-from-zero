import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { reviewAsLesson, reviewOf, stations } from '../content/stations';
import type { Lesson, Step } from '../lib/types';
import { PreviewBanner, PreviewPage } from './PreviewPage';

// 用真實的課程與複習：預覽頁就是要列出網站上所有的內容。

const KIND_LABELS: Record<Step['kind'], string> = {
  concept: '觀念卡',
  choice: '選擇題',
  number: '數字題',
  table: '表格題',
  formula: '拼算式',
  slider: '滑桿題',
  sim: '動畫',
  match: '配對',
};

/** 每一站的複習（當成一課），沒有複習的站不列。 */
const reviewLessons: Lesson[] = stations.flatMap((station) => {
  const review = reviewOf(station.id);
  return review === undefined ? [] : [reviewAsLesson(review)];
});
const lessons = stations.flatMap((station) => station.lessons);

function renderPage() {
  const onStart = vi.fn();
  const onBack = vi.fn();
  render(<PreviewPage onStart={onStart} onBack={onBack} />);
  return { onStart, onBack, user: userEvent.setup() };
}

/** 一課（或複習）的那一區，名稱是「課程 id 加標題」。 */
function lessonRegion(lesson: Lesson): HTMLElement {
  return screen.getByRole('region', { name: `${lesson.id} ${lesson.title}` });
}

it('標題「本機預覽」；說明這一頁不受解鎖限制、不存進度', () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 2, name: '本機預覽' })).toBeInTheDocument();
  expect(screen.getByText(/不受解鎖限制/)).toBeInTheDocument();
  expect(screen.getByText(/不存進度/)).toBeInTheDocument();
});

it('每一站都列出來，還沒有課的站也在（寫明還沒有課）', () => {
  renderPage();
  for (const station of stations) {
    const region = screen.getByRole('region', { name: `第 ${station.id} 站：${station.title}` });
    if (station.lessons.length === 0) expect(region).toHaveTextContent('還沒有課');
  }
  expect(stations.some((station) => station.lessons.length === 0)).toBe(true); // 這個檢查有東西可檢查
});

it('每一課都列出來，課程底下是每一步：編號（從 1 算起）、步驟 id、題型', () => {
  renderPage();
  expect(lessons.length).toBeGreaterThan(0);
  for (const lesson of lessons) {
    const items = within(lessonRegion(lesson)).getAllByRole('listitem');
    expect(items, lesson.id).toHaveLength(lesson.steps.length);
    lesson.steps.forEach((step, index) => {
      const text = items[index].textContent ?? '';
      expect(within(items[index]).getByText(String(index + 1)), `${lesson.id} ${step.id}`).toBeInTheDocument(); // 編號自己一格
      expect(text, `${lesson.id} ${step.id}`).toContain(step.id);
      expect(text, `${lesson.id} ${step.id}`).toContain(KIND_LABELS[step.kind]);
      expect(text, `${lesson.id} ${step.id}`).toContain(step.kind); // 回報問題的網址裡寫的是這個英文名稱
    });
  }
});

it('每一站的複習也列出來（review-站號），每一步一列', () => {
  renderPage();
  expect(reviewLessons.length).toBeGreaterThan(0);
  for (const lesson of reviewLessons) {
    expect(lesson.id).toMatch(/^review-\d+$/);
    const items = within(lessonRegion(lesson)).getAllByRole('listitem');
    expect(items, lesson.id).toHaveLength(lesson.steps.length);
    lesson.steps.forEach((step, index) => {
      expect(items[index].textContent, `${lesson.id} ${step.id}`).toContain(step.id);
    });
  }
});

it('每一步（課程和複習）各有一個「從這裡開始」按鈕，名稱說清楚是哪一課的第幾步', () => {
  renderPage();
  const total = [...lessons, ...reviewLessons].reduce((sum, lesson) => sum + lesson.steps.length, 0);
  const buttons = screen.getAllByRole('button', { name: /^從這裡開始/ });
  expect(buttons).toHaveLength(total);
  for (const lesson of [...lessons, ...reviewLessons]) {
    const names = within(lessonRegion(lesson))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(lesson.steps.map((_, index) => `從這裡開始：${lesson.id} 第 ${index + 1} 步`));
  }
  for (const b of buttons) expect(b).toHaveTextContent('從這裡開始'); // 看得到的字和名稱開頭一致
});

it('按「從這裡開始」：呼叫 onStart(課程 id, 步驟編號)，編號從 1 算起', async () => {
  const { onStart, user } = renderPage();
  const lesson = lessons[2];
  await user.click(screen.getByRole('button', { name: `從這裡開始：${lesson.id} 第 3 步` }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledWith(lesson.id, 3);

  const review = reviewLessons[0];
  await user.click(screen.getByRole('button', { name: `從這裡開始：${review.id} 第 1 步` }));
  expect(onStart).toHaveBeenLastCalledWith(review.id, 1);

  const last = review.steps.length;
  await user.click(screen.getByRole('button', { name: `從這裡開始：${review.id} 第 ${last} 步` }));
  expect(onStart).toHaveBeenLastCalledWith(review.id, last);
});

it('「回到地圖」呼叫 onBack', async () => {
  const { onBack, user } = renderPage();
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('PreviewBanner：預覽模式的提示列', () => {
  render(<PreviewBanner />);
  expect(screen.getByText('預覽模式：不會存進度')).toBeInTheDocument();
});
