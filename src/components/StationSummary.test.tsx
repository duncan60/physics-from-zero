import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reviewOf, stations } from '../content/stations';
import type { StationReview } from '../lib/types';
import { StationSummary } from './StationSummary';

// 測試專用的總結資料，不依賴真實內容（最後一個測試再把真實的每一站都畫一次）。
const review: StationReview = {
  stationId: 3,
  points: ['第一個重點。', '第二個重點。', '第三個重點。'],
  formulas: [
    { name: '測試公式', formula: 'F = m × a' },
    { name: '測試數值', formula: '地球 10 公尺/秒²，月球約 1.6 公尺/秒²' },
  ],
  traps: [
    { wrong: '第一個錯的想法。', right: '第一個正確的想法。' },
    { wrong: '第二個錯的想法。', right: '第二個正確的想法。' },
  ],
  steps: [
    { kind: 'number', id: 'q1', prompt: '1 + 1 是多少？', answer: 2, explanation: '1 + 1 = 2。' },
    { kind: 'number', id: 'q2', prompt: '2 + 2 是多少？', answer: 4, explanation: '2 + 2 = 4。' },
  ],
};

// jsdom 沒有實作 scrollIntoView：換成假的，記錄捲到哪裡、怎麼捲。
const scrollIntoView = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  Reflect.deleteProperty(window, 'matchMedia');
});

function mockReducedMotion(): void {
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
}

function renderSummary(data: StationReview = review, stationTitle = '測試站') {
  const onStart = vi.fn();
  const onBack = vi.fn();
  render(<StationSummary review={data} stationTitle={stationTitle} onStart={onStart} onBack={onBack} />);
  return { onStart, onBack, user: userEvent.setup() };
}

it('標題是「第 N 站重點：站名」，下面有「重點」「公式」「常見陷阱」三個區塊', () => {
  renderSummary();
  expect(screen.getByRole('heading', { level: 2, name: '第 3 站重點：測試站' })).toBeInTheDocument();
  const sections = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  expect(sections).toEqual(['重點', '公式', '常見陷阱']);
  for (const name of ['重點', '公式', '常見陷阱']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
  // 先說一聲後面有幾題，學習者知道要花多少時間
  expect(screen.getByText('看完這一站的重點、公式和常見陷阱，再做 2 題複習。')).toBeInTheDocument();
});

it('重點依序列出', () => {
  renderSummary();
  const items = within(screen.getByRole('region', { name: '重點' })).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual(review.points);
});

it('公式表：每一列是名稱和公式（數值也一樣）', () => {
  renderSummary();
  const table = screen.getByRole('region', { name: '公式' });
  expect(within(table).getAllByRole('term').map((term) => term.textContent)).toEqual(['測試公式', '測試數值']);
  expect(within(table).getAllByRole('definition').map((definition) => definition.textContent)).toEqual([
    'F = m × a',
    '地球 10 公尺/秒²，月球約 1.6 公尺/秒²',
  ]);
});

it('常見陷阱：每一個都是先「錯的想法」再「正確的想法」，用文字標出來（不只靠顏色）', () => {
  renderSummary();
  const traps = within(screen.getByRole('region', { name: '常見陷阱' })).getAllByRole('listitem');
  expect(traps).toHaveLength(2);
  for (const [index, trap] of traps.entries()) {
    const wrong = within(trap).getByText(review.traps[index].wrong).closest('.summary-trap-wrong');
    const right = within(trap).getByText(review.traps[index].right).closest('.summary-trap-right');
    if (!(wrong instanceof HTMLElement) || !(right instanceof HTMLElement)) throw new Error('找不到錯的想法或正確的想法');
    expect(within(wrong).getByText('錯的想法')).toBeInTheDocument();
    expect(within(right).getByText('正確的想法')).toBeInTheDocument();
    expect(wrong).not.toHaveTextContent('正確的想法');
    // 錯的在前、正確的在後
    expect(wrong.compareDocumentPosition(right)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  }
});

it('「開始複習」呼叫 onStart，「回到地圖」呼叫 onBack', async () => {
  const { onStart, onBack, user } = renderSummary();
  await user.click(screen.getByRole('button', { name: '開始複習' }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onBack).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '回到地圖' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledTimes(1);
});

it('最上面的「直接做複習題」：焦點移到最下面的「開始複習」並捲過去，不會直接開始', async () => {
  const { onStart, onBack, user } = renderSummary();
  const skip = screen.getByRole('button', { name: '直接做複習題' });
  // 在說明之後、「重點」之前；「開始複習」還是只有一個（捷徑不重複它的名稱）
  expect(screen.getByText('看完這一站的重點、公式和常見陷阱，再做 2 題複習。').compareDocumentPosition(skip)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(skip.compareDocumentPosition(screen.getByRole('region', { name: '重點' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getAllByRole('button', { name: /開始複習/ })).toHaveLength(1);
  const start = screen.getByRole('button', { name: '開始複習' });

  await user.click(skip);
  expect(start).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView.mock.contexts[0]).toBe(start);
  expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  expect(onStart).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();

  // 焦點在「開始複習」上，按 Enter 就開始
  await user.keyboard('{Enter}');
  expect(onStart).toHaveBeenCalledTimes(1);
});

it('「直接做複習題」用鍵盤也能用：Tab 到它按 Enter 或空白鍵', async () => {
  const { onStart, user } = renderSummary();
  const start = screen.getByRole('button', { name: '開始複習' });
  await user.tab();
  expect(screen.getByRole('button', { name: '直接做複習題' })).toHaveFocus(); // 頁面上第一個可以按的
  await user.keyboard('{Enter}');
  expect(start).toHaveFocus();
  expect(onStart).not.toHaveBeenCalled();

  // 空白鍵也可以
  act(() => screen.getByRole('button', { name: '直接做複習題' }).focus());
  await user.keyboard(' ');
  expect(start).toHaveFocus();
  expect(onStart).not.toHaveBeenCalled();
});

it('減少動態效果：「直接做複習題」直接跳過去，不平滑捲動', async () => {
  mockReducedMotion();
  const { user } = renderSummary();
  await user.click(screen.getByRole('button', { name: '直接做複習題' }));
  expect(screen.getByRole('button', { name: '開始複習' })).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
});

it('真實的每一站：重點、公式、陷阱一個不少', () => {
  for (const station of stations) {
    const data = reviewOf(station.id);
    if (data === undefined) continue;
    const { unmount } = render(<StationSummary review={data} stationTitle={station.title} onStart={() => {}} onBack={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: `第 ${station.id} 站重點：${station.title}` })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '重點' })).getAllByRole('listitem')).toHaveLength(data.points.length);
    expect(within(screen.getByRole('region', { name: '公式' })).getAllByRole('term')).toHaveLength(data.formulas.length);
    expect(within(screen.getByRole('region', { name: '常見陷阱' })).getAllByRole('listitem')).toHaveLength(data.traps.length);
    expect(screen.getAllByText('錯的想法')).toHaveLength(data.traps.length);
    expect(screen.getAllByText('正確的想法')).toHaveLength(data.traps.length);
    unmount();
  }
});
