import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
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
