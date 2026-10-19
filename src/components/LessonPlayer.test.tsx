import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { Lesson } from '../lib/types';
import { LessonPlayer } from './LessonPlayer';

// 測試專用的課程資料，不依賴真實內容。

/** 觀念卡 → 有引導的選擇題（答案 c）→ 數字題（答案 3）。 */
const guidedLesson: Lesson = {
  id: 'test-guided',
  title: '測試課程',
  steps: [
    { kind: 'concept', id: 'intro', title: '開場', body: ['這是一張觀念卡。'] },
    {
      kind: 'choice',
      id: 'pick',
      prompt: '哪一個是對的？',
      options: [
        { id: 'a', label: '選項 A', feedback: '再想想 A' },
        { id: 'b', label: '選項 B', feedback: '最後一步再看一次' },
        { id: 'c', label: '選項 C' },
      ],
      answer: 'c',
      explanation: '因為 C 是對的。',
      guide: [{ kind: 'number', id: 'pick-guide', prompt: '2 + 2 是多少？', answer: 4, explanation: '2 + 2 = 4。' }],
    },
    { kind: 'number', id: 'count', prompt: '1 + 2 是多少？', answer: 3, explanation: '1 + 2 = 3。' },
  ],
};

/** 沒有引導的選擇題（答案 a）→ 有單位的數字題（答案 3）。 */
const plainLesson: Lesson = {
  id: 'test-plain',
  title: '測試課程二',
  steps: [
    {
      kind: 'choice',
      id: 'q1',
      prompt: '選出 A',
      options: [
        { id: 'a', label: '選項 A' },
        { id: 'b', label: '選項 B', feedback: 'B 不對喔' },
      ],
      answer: 'a',
      explanation: 'A 就是 A。',
    },
    { kind: 'number', id: 'q2', prompt: '3 減 0 是多少？', answer: 3, unit: '公尺', explanation: '3 − 0 = 3。' },
  ],
};

/** 一題表格題：1 秒和 2 秒是空格（答案 8、6）。 */
const tableLesson: Lesson = {
  id: 'test-table',
  title: '測試表格',
  steps: [
    {
      kind: 'table',
      id: 'speeds',
      prompt: '把表格填完',
      columns: ['0 秒', '1 秒', '2 秒', '3 秒'],
      rows: [{ label: '速度', cells: ['10', { answer: 8 }, { answer: 6 }, '4'] }],
      explanation: '每秒減 2。',
    },
  ],
};

const simLesson: Lesson = {
  id: 'test-sim',
  title: '測試模擬',
  steps: [
    { kind: 'sim', id: 'bus', sim: 'bus-ball', prompt: '動手試試看。' },
    { kind: 'concept', id: 'after', body: ['模擬之後的觀念卡。'] },
  ],
};

function renderPlayer(lesson: Lesson) {
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const user = userEvent.setup();
  render(<LessonPlayer lesson={lesson} onComplete={onComplete} onExit={onExit} />);
  return { user, onComplete, onExit };
}

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

it('完整流程：答錯 → 引導 → 重答 → 完成，並計算 XP', async () => {
  const { user, onComplete, onExit } = renderPlayer(guidedLesson);

  // 觀念卡按「繼續」
  expect(screen.getByText('這是一張觀念卡。')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await user.click(button('繼續'));

  // 選擇題選 b，按「檢查」→ 看到「還不對」和「最後一步再看一次」
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('最後一步再看一次')).toBeInTheDocument();
  expect(button('看解答')).toBeInTheDocument();
  expect(queryButton('再試一次')).not.toBeInTheDocument();

  // 按「一步一步來」→ 數字題輸入 4，按「檢查」→「答對了」→「繼續」
  await user.click(button('一步一步來'));
  expect(screen.queryByText('哪一個是對的？')).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: '2 + 2 是多少？' }), '4');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText('2 + 2 = 4。')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 回到原題（重新出現，之前的選擇和回饋都清掉了），選 c，按「檢查」→「答對了」→「繼續」
  expect(screen.getByText('哪一個是對的？')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '選項 B' })).not.toBeChecked();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText('因為 C 是對的。')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 數字題輸入「３」（全形）→「檢查」→「繼續」
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await user.type(screen.getByRole('textbox', { name: '1 + 2 是多少？' }), '３');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 看到「完成這一課」，按「回到地圖」
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText('本課獲得 15 XP')).toBeInTheDocument();
  expect(onComplete).not.toHaveBeenCalled();
  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(15); // 10 + 只有數字題第一次就答對的 5
  expect(onExit).not.toHaveBeenCalled();
});

it('沒有輸入就按檢查，會出現提示，而且不算答錯', async () => {
  const { user, onComplete } = renderPlayer(plainLesson);

  // 選擇題：沒選就按「檢查」
  await user.click(button('檢查'));
  expect(screen.getByText('請先選一個答案')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(button('檢查')).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  expect(screen.queryByText('請先選一個答案')).not.toBeInTheDocument();
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 數字題：空白、看不懂的輸入都只會提示
  const input = screen.getByRole('textbox', { name: '3 減 0 是多少？' });
  expect(input).toHaveAttribute('inputmode', 'decimal');
  await user.click(button('檢查'));
  expect(screen.getByText('請先輸入數字')).toBeInTheDocument();
  expect(input).toBeInvalid();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  await user.type(input, '三');
  await user.click(button('檢查'));
  expect(screen.getByText('請先輸入數字')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();

  // 之後答對，XP 仍然算第一次就答對
  await user.clear(input);
  await user.type(input, '3');
  await user.click(button('檢查'));
  expect(screen.queryByText('請先輸入數字')).not.toBeInTheDocument();
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  expect(screen.getByText('本課獲得 20 XP')).toBeInTheDocument();
  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledWith(20); // 10 + 兩題都第一次就答對的 5 + 5
});

it('看解答後繼續，那一題沒有 XP', async () => {
  const { user, onComplete } = renderPlayer(plainLesson);

  // 選擇題第一次就答對
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  // 數字題答錯：沒有引導，所以是「再試一次」和「看解答」
  await user.type(screen.getByRole('textbox'), '5');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(button('再試一次')).toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();

  // 看解答：正確答案（含單位）和說明
  await user.click(button('看解答'));
  expect(screen.getByText('正確答案')).toBeInTheDocument();
  expect(screen.getByText('3 公尺')).toBeInTheDocument();
  expect(screen.getByText('3 − 0 = 3。')).toBeInTheDocument();
  expect(queryButton('看解答')).not.toBeInTheDocument();
  await user.click(button('繼續'));

  expect(screen.getByText('本課獲得 15 XP')).toBeInTheDocument();
  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledWith(15); // 10 + 選擇題的 5；看解答的數字題沒有
});

it('中途按離開，只呼叫 onExit', async () => {
  const { user, onComplete, onExit } = renderPlayer(guidedLesson);

  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  await user.click(button('離開'));

  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('表格題標出答錯的格子', async () => {
  const { user, onComplete } = renderPlayer(tableLesson);
  const first = screen.getByRole('textbox', { name: '速度，1 秒' });
  const second = screen.getByRole('textbox', { name: '速度，2 秒' });
  expect(first).toHaveAttribute('inputmode', 'decimal');

  // 只填一格：提示「請先輸入數字」，不算答錯
  await user.type(first, '8');
  await user.click(button('檢查'));
  expect(screen.getByText('請先輸入數字')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();

  // 第二格填錯：只有第二格被標出來
  await user.type(second, '7');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(first).toBeValid();
  expect(second).toBeInvalid();

  // 再試一次：游標回到答錯的格子；改過之後就不再標示
  await user.click(button('再試一次'));
  expect(second).toHaveFocus();
  expect(second).toBeInvalid();
  await user.clear(second);
  await user.type(second, '6');
  expect(second).toBeValid();
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText('每秒減 2。')).toBeInTheDocument();
  await user.click(button('繼續'));

  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledWith(10); // 答錯過一次，只有完成一課的 10
});

it('表格題看解答，空格裡顯示正確的數字', async () => {
  const { user } = renderPlayer(tableLesson);

  await user.type(screen.getByRole('textbox', { name: '速度，1 秒' }), '1');
  await user.type(screen.getByRole('textbox', { name: '速度，2 秒' }), '2');
  await user.click(button('檢查'));
  await user.click(button('看解答'));

  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.getByRole('cell', { name: '8' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '6' })).toBeInTheDocument();
  expect(screen.getByText('每秒減 2。')).toBeInTheDocument();
});

it('引導裡的題目答錯，只會顯示「再試一次」和「看解答」，看完解答回到原題', async () => {
  const { user } = renderPlayer(guidedLesson);

  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  expect(screen.getByText('再想想 A')).toBeInTheDocument();
  await user.click(button('一步一步來'));

  // 引導裡的數字題答錯
  const input = screen.getByRole('textbox', { name: '2 + 2 是多少？' });
  await user.type(input, '5');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(button('再試一次')).toBeInTheDocument();
  expect(button('看解答')).toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();

  // 再試一次：保留剛才的輸入，游標回到欄位
  await user.click(button('再試一次'));
  expect(input).toHaveValue('5');
  expect(input).toHaveFocus();
  await user.click(button('檢查'));
  await user.click(button('看解答'));
  expect(screen.getByText('正確答案')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 引導跑完，回到原題
  expect(screen.getByText('哪一個是對的？')).toBeInTheDocument();
  expect(button('檢查')).toBeInTheDocument();
});

it('模擬步驟：顯示說明和模擬，按「繼續」往下', async () => {
  // 減少動態效果：模擬不跑動畫迴圈
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
  const { user } = renderPlayer(simLesson);

  expect(screen.getByText('動手試試看。')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '公車與球的模擬' })).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(screen.getByText('模擬之後的觀念卡。')).toBeInTheDocument();
});
