import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SoundKind } from '../lib/sound';
import type { FormulaStep, Lesson, MatchStep, NumberStep, QuestionStep, SliderStep } from '../lib/types';
import { LessonPlayer } from './LessonPlayer';
import { MatchCard } from './MatchCard';
import { QuestionCard } from './QuestionCard';
import { SoundProvider } from './SoundContext';
import { spokenTile, tileName } from './steps/FormulaInput';

// 測試專用的題目，不依賴真實課程內容。

const M = '−'; // U+2212，磚塊上的減號

/** 20 N 推 20 公斤：20 ÷ 20 = 1。磚塊裡有兩塊「20」（和 2-1 的 full-cart-accel 一樣）。 */
const formulaStep: FormulaStep = {
  kind: 'formula',
  id: 'cart-accel',
  prompt: '用 20 N 推 20 公斤的購物車，加速度是多少？',
  tiles: ['20', '×', '20', '÷', '10', M],
  accepted: [['20', '÷', '20']],
  wrongForms: [{ tokens: ['20', '×', '20'], feedback: '力除以質量，不是乘。' }],
  answer: 1,
  unit: '公尺/秒²',
  wrongAnswers: [{ value: 400, feedback: '400 是 20 × 20，加速度要用除的。' }],
  explanation: '20 ÷ 20 = 1，加速度是 1 公尺/秒²。',
};

/** 一開始是 0：(18 − 0) ÷ 6 和省略「− 0」的 18 ÷ 6 都算對，省略的寫法要提醒正式寫法。 */
const NOTE = '正式寫法是 (18 − 0) ÷ 6：最後 − 一開始。一開始剛好是 0，才可以省略。';
const noteStep: FormulaStep = {
  kind: 'formula',
  id: 'scooter-from-rest',
  prompt: '一台機車從靜止開始加速，6 秒後速度達到每秒 18 公尺。它的加速度是多少？',
  tiles: ['0', '6', '18', '+', M, '×', '÷', '(', ')'],
  accepted: [
    ['(', '18', M, '0', ')', '÷', '6'],
    ['18', '÷', '6'],
  ],
  acceptedNotes: [{ tokens: ['18', '÷', '6'], note: NOTE }],
  wrongForms: [{ tokens: ['18', M, '0', '÷', '6'], feedback: '先算除法，再相減。' }],
  answer: 3,
  unit: '公尺/秒²',
  wrongAnswers: [{ value: 18, feedback: '還要除以時間。' }],
  explanation: '(18 − 0) ÷ 6 = 3 公尺/秒²。',
};

/** 有括號和四種符號的拼算式：(6 + 18) ÷ 2 = 12。 */
const bracketStep: FormulaStep = {
  kind: 'formula',
  id: 'scooter-average',
  prompt: '機車從每秒 6 公尺平均地加速到每秒 18 公尺，平均速度是多少？',
  tiles: ['(', '6', '+', '18', ')', '÷', '2', M, '×'],
  accepted: [['(', '6', '+', '18', ')', '÷', '2']],
  wrongForms: [{ tokens: ['(', '18', M, '6', ')', '÷', '2'], feedback: '平均速度要找正中間，不是相減。' }],
  answer: 12,
  unit: '公尺/秒',
  explanation: '(6 + 18) ÷ 2 = 12 公尺/秒。',
};

const sliderStep: SliderStep = {
  kind: 'slider',
  id: 'empty-cart-force',
  prompt: '空的購物車 10 公斤。要讓它的加速度是 2 公尺/秒²，要用多大的力推？',
  quantity: '推力',
  unit: 'N',
  min: 0,
  max: 40,
  step: 1,
  initial: 0,
  answer: 20,
  tooLow: '推力不夠：購物車加速得比 2 公尺/秒² 慢。',
  tooHigh: '推力太大：購物車加速得比 2 公尺/秒² 快。',
  explanation: '力 = 質量 × 加速度 = 10 × 2 = 20 N。',
  anim: 'cart',
};

const matchStep: MatchStep = {
  kind: 'match',
  id: 'formula-match',
  prompt: '把名稱和算法配成一對',
  pairs: [
    { left: '平均速度', right: '（一開始 + 最後）÷ 2' },
    { left: '加速度', right: '（最後 − 一開始）÷ 時間' },
    { left: '距離', right: '平均速度 × 時間' },
  ],
  explanation: '三個算法都配好了。',
};

// 按鈕在畫面換了之後的一小段時間內不會有反應（防連點，約 250 ms），所以和 LessonPlayer.test.tsx 一樣用假的時鐘：
// `user` 每個動作之前都會等 SETTLE_MS，像一般人一樣按。
const SETTLE_MS = 500;

function setupUser() {
  return userEvent.setup({ delay: SETTLE_MS, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

type User = ReturnType<typeof setupUser>;

function renderCard(step: QuestionStep) {
  const onFinish = vi.fn();
  const user = setupUser();
  const { unmount } = render(<QuestionCard step={step} onFinish={onFinish} />);
  return { user, onFinish, unmount };
}

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

const INCOMPLETE = '算式還沒拼完：括號要成對，符號兩邊都要有數字。';
const FORMAT_HINT = '只要填數字，可以是負數（按 ±）或小數；單位已經寫好了';
const NUMBER_RETRY_HINT = '檢查一下：用的是哪個公式？正負號和小數點對嗎？';
const NUMBER_GUIDE_HINT = '檢查一下：用的是哪個公式？正負號和小數點對嗎？也可以按『一步一步來』。';

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });
const row = () => screen.getByRole('group', { name: '你的算式' });
const bank = () => screen.getByRole('group', { name: '磚塊' });
const slider = () => screen.getByRole('slider', { name: '推力' });
/** 至少 44px 高，手指才好按。 */
function expectTappable(element: HTMLElement): void {
  expect(Number.parseFloat(element.style.minHeight)).toBeGreaterThanOrEqual(44);
}
/** 一個區域裡每顆按鈕的名稱，依畫面上的順序。 */
const names = (container: HTMLElement) => within(container).queryAllByRole('button').map((b) => b.getAttribute('aria-label'));

/** 「放入 20」或有標示的「放入 20（力）」都算：數值是 token 的磚塊。 */
function placeName(token: string): RegExp {
  return new RegExp(`^放入 ${spokenTile(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(（.+）)?$`);
}

/** 依序點下方第一塊還能用的磚塊（有標示的磚塊也一樣，看的是數值）。 */
async function build(user: User, tokens: string[]): Promise<void> {
  for (const token of tokens) await user.click(within(bank()).getAllByRole('button', { name: placeName(token) })[0]);
}

/** 拼出正確算式並檢查，停在第 2 步。 */
async function solveFormula(user: User): Promise<HTMLElement> {
  await build(user, ['20', '÷', '20']);
  await user.click(button('檢查'));
  return screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

it('拼算式：點磚塊放上去、點答案列拿回來；兩塊「20」各自獨立', async () => {
  const { user } = renderCard(formulaStep);
  expect(screen.getByRole('heading', { name: '第 1 步：拼算式' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '第 2 步：算出答案' })).not.toBeInTheDocument();
  expect(names(row())).toEqual([]);
  expect(names(bank())).toEqual(['放入 20', '放入 乘', '放入 20', '放入 除以', '放入 10', '放入 減']);
  for (const tile of within(bank()).getAllByRole('button')) expectTappable(tile);

  // 放入第二塊「20」：只有那一塊離開下方，第一塊還在原位；焦點移到右邊下一塊還能用的磚塊
  await user.click(within(bank()).getAllByRole('button', { name: '放入 20' })[1]);
  expect(names(row())).toEqual(['拿回 20']);
  expect(names(bank())).toEqual(['放入 20', '放入 乘', '放入 除以', '放入 10', '放入 減']);
  expect(button('放入 除以')).toHaveFocus();

  await user.click(button('放入 除以'));
  await user.click(button('放入 20'));
  expect(names(row())).toEqual(['拿回 20', '拿回 除以', '拿回 20']);
  expect(names(bank())).toEqual(['放入 乘', '放入 10', '放入 減']);
  for (const tile of within(row()).getAllByRole('button')) expectTappable(tile);
  // 每一塊只能放一次：下方已經沒有「20」了
  expect(queryButton('放入 20')).not.toBeInTheDocument();

  // 拿回答案列的第一塊（原本的第二塊「20」）：回到「×」後面它自己的位置，第一塊「20」還留在答案列
  await user.click(within(row()).getAllByRole('button')[0]);
  expect(names(row())).toEqual(['拿回 除以', '拿回 20']);
  expect(names(bank())).toEqual(['放入 乘', '放入 20', '放入 10', '放入 減']);
  expect(button('拿回 除以')).toHaveFocus(); // 焦點留在答案列的同一個位置

  // 全部拿回：下方恢復原本的樣子
  await user.click(button('拿回 除以'));
  await user.click(button('拿回 20'));
  expect(names(row())).toEqual([]);
  expect(names(bank())).toEqual(['放入 20', '放入 乘', '放入 20', '放入 除以', '放入 10', '放入 減']);
});

it('拼算式：沒拼就檢查 → 「請先拼出算式」，不算答錯', async () => {
  const { user, onFinish } = renderCard(formulaStep);

  await user.click(button('檢查'));
  expect(screen.getByText('請先拼出算式')).toBeInTheDocument();
  expect(row()).toHaveAccessibleDescription('請先拼出算式');
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(button('檢查')).toBeInTheDocument();

  // 一放磚塊，提示就消失
  await build(user, ['20']);
  expect(screen.queryByText('請先拼出算式')).not.toBeInTheDocument();
  await build(user, ['÷', '20']);
  await user.click(button('檢查'));

  // 第 2 步和數字題一樣：多打了單位只提示，不算答錯
  const input = screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
  await user.type(input, '1 公尺/秒²');
  await user.click(button('檢查'));
  expect(screen.getByText('只要填數字，不用寫單位')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  await user.clear(input);
  await user.type(input, '１'); // 全形
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText(formulaStep.explanation)).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(true);
});

it('拼算式：拼成已知錯誤算式 → 「還不對」與那則回饋；拼對後才出現「第 2 步：算出答案」', async () => {
  const { user } = renderCard(formulaStep);

  // 亂拼（運算符號結尾）：「還不對」，加上「算式還沒拼完」的提示，不會當掉
  await build(user, ['20', M]);
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(INCOMPLETE)).toBeInTheDocument();
  expect(screen.queryByText('力除以質量，不是乘。')).not.toBeInTheDocument();
  // 再試一次：答案列清空，磚塊全部回到下方
  await user.click(button('再試一次'));
  expect(names(row())).toEqual([]);

  // 已知的錯誤算式：「還不對」加上那則回饋；按鈕和現有的題目一樣
  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('力除以質量，不是乘。')).toBeInTheDocument();
  expect(screen.queryByText(INCOMPLETE)).not.toBeInTheDocument();
  expect(button('再試一次')).toBeInTheDocument();
  expect(button('看解答')).toBeInTheDocument();
  expect(button('再試一次')).toHaveFocus();
  expect(screen.queryByRole('heading', { name: '第 2 步：算出答案' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  for (const tile of within(row()).getAllByRole('button')) expect(tile).toBeDisabled(); // 檢查完先不能動

  // 再試一次：答案列清空，每一塊都回到下方它自己原本的位置；焦點回到答案列，重新拼
  await user.click(button('再試一次'));
  expect(row()).toHaveFocus();
  expect(names(row())).toEqual([]);
  expect(names(bank())).toEqual(['放入 20', '放入 乘', '放入 20', '放入 除以', '放入 10', '放入 減']);
  await build(user, ['20', '÷', '20']);
  expect(screen.queryByRole('heading', { name: '第 2 步：算出答案' })).not.toBeInTheDocument();
  await user.click(button('檢查'));

  // 算式對了：出現第 2 步，焦點在數字輸入框（有 ± 和單位提示），算式鎖定、下方磚塊收起來
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('inputmode', 'decimal');
  expect(input).toHaveAccessibleDescription(`公尺/秒² ${FORMAT_HINT}`); // 單位和格式提示
  expect(screen.getByText(FORMAT_HINT)).toBeInTheDocument();
  expect(button('切換正負號')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '磚塊' })).not.toBeInTheDocument();
  expect(names(row())).toEqual(['20', '除以', '20']);
  for (const tile of within(row()).getAllByRole('button')) expect(tile).toBeDisabled();
  expect(button('檢查')).toBeInTheDocument();
});

it('拼算式：兩步都第一次就對 → onFinish(true)；任何一步錯過 → onFinish(false)', async () => {
  // 兩步都第一次就對
  let card = renderCard(formulaStep);
  await card.user.type(await solveFormula(card.user), '1');
  await card.user.click(button('檢查'));
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(true);
  card.unmount();

  // 算式錯過一次，之後兩步都對
  card = renderCard(formulaStep);
  await build(card.user, ['20', '×', '20']);
  await card.user.click(button('檢查'));
  await card.user.click(button('再試一次'));
  expect(names(row())).toEqual([]); // 再試一次就清空了，不用一塊一塊拿回來
  await card.user.type(await solveFormula(card.user), '1');
  await card.user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(false);
  card.unmount();

  // 算式第一次就對，第 2 步錯過一次：和數字題一樣有已知錯誤的回饋、再試一次保留輸入
  card = renderCard(formulaStep);
  const input = await solveFormula(card.user);
  await card.user.type(input, '400');
  await card.user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('400 是 20 × 20，加速度要用除的。')).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_RETRY_HINT)).not.toBeInTheDocument(); // 有對應的回饋，就不加通用提示
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  await card.user.click(button('再試一次'));
  expect(input).toHaveValue('400');
  expect(input).toHaveFocus();
  expect(names(row())).toEqual(['20', '除以', '20']); // 算式還是鎖定的，不必重拼
  await card.user.clear(input);
  await card.user.type(input, '1');
  await card.user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(false);
});

it('拼算式：括號和符號磚塊用念得出來的名稱（畫面上還是符號）；鎖住的磚塊和看解答的算式也一樣', async () => {
  const { user } = renderCard(bracketStep);
  expect(names(bank())).toEqual([
    '放入 左括號',
    '放入 6',
    '放入 加',
    '放入 18',
    '放入 右括號',
    '放入 除以',
    '放入 2',
    '放入 減',
    '放入 乘',
  ]);
  expect(within(bank()).getAllByRole('button').map((b) => b.textContent)).toEqual(bracketStep.tiles);

  await user.click(button('放入 左括號'));
  await user.click(button('放入 右括號'));
  await user.click(button('放入 除以'));
  expect(names(row())).toEqual(['拿回 左括號', '拿回 右括號', '拿回 除以']);
  expect(within(row()).getAllByRole('button').map((b) => b.textContent)).toEqual(['(', ')', '÷']);
  await user.click(button('拿回 除以'));
  await user.click(button('拿回 右括號'));
  await user.click(button('拿回 左括號'));
  expect(names(row())).toEqual([]);

  // 拼錯（算得出來，但不是要的算式）：檢查完磚塊鎖住，名稱一樣念得出來
  await build(user, ['6', '+', '18', '÷', '2']);
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.queryByText(INCOMPLETE)).not.toBeInTheDocument(); // 拼得完整，只是不對
  expect(names(row())).toEqual(['6', '加', '18', '除以', '2']);

  // 看解答：畫面上是符號，螢幕閱讀器念的是名稱
  await user.click(button('看解答'));
  expect(screen.getByText('( 6 + 18 ) ÷ 2')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByText('左括號 6 加 18 右括號 除以 2')).toHaveClass('lp-sr-only');
  expect(screen.getByText('12 公尺/秒')).toBeInTheDocument();
});

it('拼算式：括號不成對、符號在頭尾、兩個數字或符號連在一起 → 「還不對」加上「算式還沒拼完」，算一次答錯', async () => {
  const incomplete = [
    ['(', '6', '+', '18', '÷', '2'], // 括號不成對
    ['6', '+', '18', ')', '÷', '2'], // 右括號沒有左括號
    ['÷', '6'], // 符號開頭
    ['6', '18'], // 兩個數字連在一起
    ['6', '+', '×', '18'], // 兩個符號連在一起
  ];
  for (const tokens of incomplete) {
    const onCheck = vi.fn();
    const onFinish = vi.fn();
    const user = setupUser();
    const { unmount } = render(<QuestionCard step={bracketStep} onFinish={onFinish} onCheck={onCheck} />);
    await build(user, tokens);
    await user.click(button('檢查'));
    expect(screen.getByText('還不對'), tokens.join(' ')).toBeInTheDocument();
    expect(screen.getByText(INCOMPLETE), tokens.join(' ')).toBeInTheDocument();
    expect(onCheck.mock.calls).toEqual([['wrong']]);
    // 看解答之後一樣是 onFinish(false)
    await user.click(button('看解答'));
    await user.click(button('繼續'));
    expect(onFinish).toHaveBeenCalledWith(false);
    unmount();
  }

  // 認得的錯誤算式：用它自己的回饋，不是「算式還沒拼完」
  const { user } = renderCard(bracketStep);
  await build(user, ['(', '18', M, '6', ')', '÷', '2']);
  await user.click(button('檢查'));
  expect(screen.getByText('平均速度要找正中間，不是相減。')).toBeInTheDocument();
  expect(screen.queryByText(INCOMPLETE)).not.toBeInTheDocument();
});

it('拼算式：看解答顯示正確算式與答案', async () => {
  // 算式錯 → 看解答
  let card = renderCard(formulaStep);
  await build(card.user, ['20', '×', '20']);
  await card.user.click(button('檢查'));
  await card.user.click(button('看解答'));
  expect(screen.getByText('正確答案')).toBeInTheDocument();
  expect(screen.getByText('20 ÷ 20')).toBeInTheDocument();
  expect(screen.getByText('1 公尺/秒²')).toBeInTheDocument();
  expect(screen.getByText(formulaStep.explanation)).toBeInTheDocument();
  expect(queryButton('看解答')).not.toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(false);
  card.unmount();

  // 第 2 步答錯 → 看解答，也是同時顯示算式和答案
  card = renderCard(formulaStep);
  await card.user.type(await solveFormula(card.user), '2');
  await card.user.click(button('檢查'));
  await card.user.click(button('看解答'));
  expect(screen.getByText('20 ÷ 20')).toBeInTheDocument();
  expect(screen.getByText('1 公尺/秒²')).toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(false);
});

it('滑桿：沒拉過就檢查 → 「請先拉動滑桿」，不算一次作答；拉過之後才判斷（拉回原位也算）', async () => {
  const onCheck = vi.fn();
  const onFinish = vi.fn();
  const user = setupUser();
  const { unmount } = render(<QuestionCard step={sliderStep} onFinish={onFinish} onCheck={onCheck} />);

  // 按「檢查」或在滑桿上按 Enter：只提示，不是「還不對」
  await user.click(button('檢查'));
  expect(screen.getByText('請先拉動滑桿')).toBeInTheDocument();
  expect(slider()).toHaveAccessibleDescription('請先拉動滑桿');
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(screen.queryByText(sliderStep.tooLow)).not.toBeInTheDocument();
  expect(slider()).toBeEnabled();
  act(() => slider().focus());
  await user.keyboard('{Enter}');
  expect(screen.getByText('請先拉動滑桿')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(onCheck).not.toHaveBeenCalled();

  // 一拉動，提示就消失；拉到答案、第一次檢查就對 → onFinish(true)
  fireEvent.change(slider(), { target: { value: '20' } });
  expect(screen.queryByText('請先拉動滑桿')).not.toBeInTheDocument();
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(onCheck.mock.calls).toEqual([['correct']]);
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(true);
  unmount();

  // 拉過又拉回一開始的位置：是學習者選的值，照常判斷
  const card = renderCard(sliderStep);
  act(() => slider().focus());
  await card.user.keyboard('{ArrowRight}{ArrowLeft}');
  expect(slider()).toHaveValue(String(sliderStep.initial));
  await card.user.click(button('檢查'));
  expect(screen.queryByText('請先拉動滑桿')).not.toBeInTheDocument();
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(sliderStep.tooLow)).toBeInTheDocument();
});

it('滑桿：方向鍵調整，到 min/max 不超出；太小/太大給對應回饋；對了顯示「答對了」', async () => {
  const { user, onFinish } = renderCard(sliderStep);
  const input = slider();
  expect(screen.getByText('推力')).toBeVisible(); // 看得到的標籤
  expect(input).toHaveAttribute('min', '0');
  expect(input).toHaveAttribute('max', '40');
  expect(input).toHaveAttribute('step', '1');
  expect(input).toHaveValue('0');
  expect(input).toHaveAttribute('aria-valuetext', '0 N');
  expect(screen.getByText('0 N')).toBeInTheDocument(); // 即時數值
  expectTappable(input);

  // 已經在最小值：往左、往下都不會變成負的
  act(() => input.focus());
  await user.keyboard('{ArrowLeft}{ArrowDown}');
  expect(input).toHaveValue('0');
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}');
  expect(input).toHaveValue('3');
  expect(screen.getByText('3 N')).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-valuetext', '3 N');

  // 拉動時不判斷，按「檢查」才判斷：太小
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(sliderStep.tooLow)).toBeInTheDocument();
  expect(input).toBeDisabled();
  expect(screen.queryByRole('img', { name: '購物車加速前進' })).not.toBeInTheDocument();

  // 再試一次：焦點回到滑桿；End 到最大值，再往右、往上也不會超過
  await user.click(button('再試一次'));
  expect(input).toHaveFocus();
  await user.keyboard('{End}{ArrowRight}{ArrowUp}');
  expect(input).toHaveValue('40');
  expect(screen.getByText('40 N')).toBeInTheDocument();
  await user.click(button('檢查'));
  expect(screen.getByText(sliderStep.tooHigh)).toBeInTheDocument();
  expect(screen.queryByText(sliderStep.tooLow)).not.toBeInTheDocument();

  // Home 回到最小值；拖到 21（用 change 模擬拖拉），再用方向鍵微調到 20
  await user.click(button('再試一次'));
  await user.keyboard('{Home}');
  expect(input).toHaveValue('0');
  fireEvent.change(input, { target: { value: '21' } });
  expect(screen.getByText('21 N')).toBeInTheDocument();
  await user.keyboard('{ArrowLeft}');
  expect(input).toHaveValue('20');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText(sliderStep.explanation)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '購物車加速前進' })).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(false); // 錯過兩次
});

it('滑桿：在滑桿上按 Enter 等於「檢查」；第一次就對 → onFinish(true)；看解答顯示正確的值', async () => {
  let card = renderCard(sliderStep);
  act(() => slider().focus());
  await card.user.keyboard('{PageUp}{PageUp}'); // 一次跳 10 格
  expect(slider()).toHaveValue('20');
  await card.user.keyboard('{Enter}');
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(true);
  card.unmount();

  card = renderCard(sliderStep);
  fireEvent.change(slider(), { target: { value: '5' } });
  await card.user.click(button('檢查'));
  await card.user.click(button('看解答'));
  expect(screen.getByText('正確答案')).toBeInTheDocument();
  expect(screen.getByText('20 N')).toBeInTheDocument();
  expect(screen.getByText(sliderStep.explanation)).toBeInTheDocument();
  await card.user.click(button('繼續'));
  expect(card.onFinish).toHaveBeenCalledWith(false);
});

it('滑桿：減少動態效果時不播放動畫', async () => {
  // 一般情況：答對後購物車往右加速（播放動畫）
  let card = renderCard(sliderStep);
  fireEvent.change(slider(), { target: { value: '20' } });
  await card.user.click(button('檢查'));
  expect(screen.getByRole('img', { name: '購物車加速前進' })).toHaveClass('lp-cart-anim--play');
  card.unmount();

  // 減少動態效果：購物車直接停在終點，不播放動畫
  mockReducedMotion();
  card = renderCard(sliderStep);
  fireEvent.change(slider(), { target: { value: '20' } });
  await card.user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  const cart = screen.getByRole('img', { name: '購物車加速前進' });
  expect(cart).not.toHaveClass('lp-cart-anim--play');
  expect(cart.querySelector('.lp-cart')).toHaveAttribute('transform', expect.stringMatching(/^translate\(\d+/));
});

it('配對：右欄依注入的亂數排序；配錯會恢復並使 onFinish(false)；全對 onFinish(true)', async () => {
  const onFinish = vi.fn();
  const user = setupUser();
  const { unmount } = render(<MatchCard step={matchStep} onFinish={onFinish} random={() => 0} />);

  // 亂數永遠給 0：右欄變成第 2、3、1 對的右邊（左欄不打亂）
  const order = () => screen.getAllByRole('button').map((b) => b.textContent);
  expect(order()).toEqual(['平均速度', '加速度', '距離', '（最後 − 一開始）÷ 時間', '平均速度 × 時間', '（一開始 + 最後）÷ 2']);
  for (const item of screen.getAllByRole('button')) expectTappable(item);
  expect(queryButton('檢查')).not.toBeInTheDocument();
  expect(queryButton('看解答')).not.toBeInTheDocument();

  const avg = button('平均速度');
  const accel = button('加速度');
  const dist = button('距離');
  const avgRule = button('（一開始 + 最後）÷ 2');
  const accelRule = button('（最後 − 一開始）÷ 時間');
  const distRule = button('平均速度 × 時間');

  // 先點一邊就選起來；同一邊再點別的，就改選那一個
  await user.click(avg);
  expect(avg).toHaveAttribute('aria-pressed', 'true');
  await user.click(accel);
  expect(avg).toHaveAttribute('aria-pressed', 'false');
  expect(accel).toHaveAttribute('aria-pressed', 'true');

  // 配錯：兩塊都標示錯誤，約 600 ms 後恢復成沒選的樣子
  await user.click(distRule);
  expect(accel).toHaveClass('lp-match-item--wrong');
  expect(distRule).toHaveClass('lp-match-item--wrong');
  expect(accel).toHaveAttribute('aria-pressed', 'false');
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(accel).not.toHaveClass('lp-match-item--wrong');
  expect(distRule).not.toHaveClass('lp-match-item--wrong');
  expect(accel).not.toHaveAttribute('aria-disabled');
  expect(distRule).not.toHaveAttribute('aria-disabled');

  // 先點右邊再點左邊也可以；配對成功的兩塊鎖定
  await user.click(accelRule);
  await user.click(accel);
  expect(accel).toHaveAttribute('aria-disabled', 'true');
  expect(accelRule).toHaveAttribute('aria-disabled', 'true');
  expect(accel).not.toHaveClass('lp-match-item--wrong');
  // 螢幕閱讀器聽得出哪些已經配好了；畫面上的文字不變
  expect(accel).toHaveAccessibleName('加速度（已配對）');
  expect(accelRule).toHaveAccessibleName('（最後 − 一開始）÷ 時間（已配對）');
  expect(avg).toHaveAccessibleName('平均速度');
  expect(distRule).toHaveAccessibleName('平均速度 × 時間');

  // 鎖定的再點也沒反應：接著點的右邊只是被選起來，不算一次配對
  await user.click(accel);
  await user.click(avgRule);
  expect(avgRule).toHaveAttribute('aria-pressed', 'true');
  expect(avgRule).not.toHaveClass('lp-match-item--wrong');
  await user.click(avg);
  expect(avg).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();

  // 全部配完：「答對了」＋說明＋「繼續」；有配錯過，所以 onFinish(false)
  await user.click(dist);
  await user.click(distRule);
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText(matchStep.explanation)).toBeInTheDocument();
  expect(button('繼續')).toHaveFocus();
  expect(onFinish).not.toHaveBeenCalled();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(false);
  unmount();

  // 亂數不同，右欄順序也不同（永遠接近 1：順序不變）；全部一次配對 → onFinish(true)
  const clean = vi.fn();
  render(<MatchCard step={matchStep} onFinish={clean} random={() => 0.999} />);
  expect(order()).toEqual(['平均速度', '加速度', '距離', '（一開始 + 最後）÷ 2', '（最後 − 一開始）÷ 時間', '平均速度 × 時間']);
  for (const pair of matchStep.pairs) {
    await user.click(button(pair.right));
    await user.click(button(pair.left));
  }
  await user.click(button('繼續'));
  expect(clean).toHaveBeenCalledWith(true);
});

it('配對：配錯時連點第二塊，不會打斷錯誤標示，也不會把它選起來', async () => {
  const user = setupUser();
  const fast = userEvent.setup({ delay: null }); // 完全不等，模擬連點
  render(<MatchCard step={matchStep} onFinish={vi.fn()} random={() => 0} />);
  const accel = button('加速度');
  const distRule = button('平均速度 × 時間');

  await user.click(accel);
  await fast.dblClick(distRule); // 第一下配錯，第二下落在正在閃的那一塊
  expect(accel).toHaveClass('lp-match-item--wrong');
  expect(distRule).toHaveClass('lp-match-item--wrong');
  expect(distRule).toHaveAttribute('aria-pressed', 'false');

  // 正在閃的另一塊也一樣不理會
  await fast.click(accel);
  expect(accel).toHaveClass('lp-match-item--wrong');
  expect(accel).toHaveAttribute('aria-pressed', 'false');

  // 約 600 ms 後兩塊都恢復成沒選的樣子
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(accel).not.toHaveClass('lp-match-item--wrong');
  expect(distRule).not.toHaveClass('lp-match-item--wrong');
  expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([]);

  // 恢復之後照常可以選
  await user.click(distRule);
  expect(distRule).toHaveAttribute('aria-pressed', 'true');
});

it('LessonPlayer：一課裡混合 formula、slider、match 能一路走到完成', async () => {
  const lesson: Lesson = {
    id: 'test-new-kinds',
    title: '測試新題型',
    steps: [
      {
        ...formulaStep,
        guide: [
          {
            kind: 'choice',
            id: 'how',
            prompt: '知道力和質量，加速度要怎麼算？',
            options: [
              { id: 'divide', label: '力 ÷ 質量' },
              { id: 'times', label: '力 × 質量' },
            ],
            answer: 'divide',
            explanation: '加速度 = 力 ÷ 質量。',
          },
        ],
      },
      sliderStep,
      matchStep,
    ],
  };
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const user = setupUser();
  render(<LessonPlayer lesson={lesson} onComplete={onComplete} onExit={onExit} />);

  // 拼算式：拼錯 → 有引導，所以是「一步一步來」→ 引導跑完回到原題（重新開始，答案列是空的）
  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  expect(screen.getByText('力除以質量，不是乘。')).toBeInTheDocument();
  expect(queryButton('再試一次')).not.toBeInTheDocument();
  await user.click(button('一步一步來'));
  await user.click(screen.getByRole('radio', { name: '力 ÷ 質量' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '第 1 步：拼算式' })).toBeInTheDocument();
  expect(names(row())).toEqual([]);
  await user.type(await solveFormula(user), '1');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 拉滑桿：第一次就對
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  act(() => slider().focus());
  await user.keyboard('{ArrowRight>20/}');
  expect(slider()).toHaveValue('20');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '購物車加速前進' })).toBeInTheDocument();
  await user.click(button('繼續'));

  // 配對：第一次就全部配對
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  for (const pair of matchStep.pairs) {
    await user.click(button(pair.left));
    await user.click(button(pair.right));
  }
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText('本課獲得 20 XP')).toBeInTheDocument();
  expect(onComplete).toHaveBeenCalledTimes(1);
  // 10 + 滑桿 5 + 配對 5；拼算式用了引導，沒有。三題兩題一次答對：67%，不是完美
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 20, perfect: false, accuracy: 67 }));
  expect(onExit).not.toHaveBeenCalled();
});

it('LessonPlayer：拼算式第 2 步答錯 → 一步一步來 → 回到原題：算式還在答案列、直接停在第 2 步；這一題仍然不算一次答對', async () => {
  const lesson: Lesson = {
    id: 'test-formula-resume',
    title: '測試接著算',
    steps: [
      {
        ...formulaStep,
        guide: [{ kind: 'number', id: 'cart-accel-count', prompt: '20 ÷ 20 是多少？', answer: 1, explanation: '20 ÷ 20 = 1。' }],
      },
      { kind: 'number', id: 'after', prompt: '1 + 1 是多少？', answer: 2, explanation: '1 + 1 = 2。' },
    ],
  };
  const onComplete = vi.fn();
  const user = setupUser();
  render(<LessonPlayer lesson={lesson} onComplete={onComplete} onExit={vi.fn()} />);

  // 算式第一次就拼對，第 2 步答錯 → 一步一步來 → 引導跑完
  await user.type(await solveFormula(user), '400');
  await user.click(button('檢查'));
  expect(screen.getByText('400 是 20 × 20，加速度要用除的。')).toBeInTheDocument();
  await user.click(button('一步一步來'));
  await user.type(screen.getByRole('textbox', { name: '20 ÷ 20 是多少？' }), '1');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  // 回到原題：拼好的算式還在答案列（鎖定，下方沒有磚塊），不用重拼；直接在第 2 步，游標在空的數字輸入框
  expect(screen.getByText(formulaStep.prompt)).toBeInTheDocument();
  expect(names(row())).toEqual(['20', '除以', '20']);
  for (const tile of within(row()).getAllByRole('button')) expect(tile).toBeDisabled();
  expect(screen.queryByRole('group', { name: '磚塊' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(button('檢查')).toBeInTheDocument();

  // 再答錯一次：引導已經走完過，主要按鈕是「再試一次」（算式還是鎖定在答案列）；按「再看一次引導」之後回來，算式也一樣還在
  await user.type(input, '400');
  await user.click(button('檢查'));
  expect(queryButton('一步一步來')).not.toBeInTheDocument();
  await user.click(button('再試一次'));
  expect(names(row())).toEqual(['20', '除以', '20']);
  expect(input).toHaveValue('400');
  await user.click(button('檢查'));
  await user.click(button('再看一次引導'));
  await user.type(screen.getByRole('textbox', { name: '20 ÷ 20 是多少？' }), '1');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(names(row())).toEqual(['20', '除以', '20']);
  await user.type(screen.getByRole('textbox', { name: /第 2 步：算出答案/ }), '1');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 下一題第一次就對；新的一題從空的開始
  await user.type(screen.getByRole('textbox', { name: '1 + 1 是多少？' }), '2');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  // 10 + 數字題 5；拼算式答錯過、用了引導，不算一次答對，所以不是完美
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 15, perfect: false, accuracy: 50 }));
});

it('LessonPlayer：配對配過一次之後按「離開」，要先確認', async () => {
  const user = setupUser();
  const onExit = vi.fn();
  render(<LessonPlayer lesson={{ id: 'test-match', title: '測試配對', steps: [matchStep] }} onComplete={vi.fn()} onExit={onExit} />);
  await user.click(button('平均速度'));
  await user.click(button('平均速度 × 時間'));
  await user.click(button('離開'));
  expect(screen.getByRole('alertdialog', { name: '要離開這一課嗎？' })).toBeInTheDocument();
  expect(onExit).not.toHaveBeenCalled();
});

// ---- 算對、但寫法省略了什麼（acceptedNotes）：在算式下面輕輕提醒正式寫法。
// 中性的提示，不說「答對了」（第 2 步還沒做完）；不影響對錯、第一次就對、XP ----

/** 提醒所在的即時區域（role="status"，一直在畫面上，沒有提醒時是空的）。 */
const noteRegion = (container: HTMLElement) => container.querySelector<HTMLElement>('.lp-note');

it('拼算式：拼成省略 − 0 的 18 ÷ 6 → 算式算對，下面出現中性的「提醒」，不說「答對了」；兩步都第一次就對，仍然是 onFinish(true)', async () => {
  const onCheck = vi.fn();
  const onFinish = vi.fn();
  const user = setupUser();
  const { container } = render(<QuestionCard step={noteStep} onFinish={onFinish} onCheck={onCheck} />);
  const region = noteRegion(container);
  expect(region).toBeInTheDocument();
  expect(region).toHaveAttribute('role', 'status');
  expect(region).toBeEmptyDOMElement(); // 一開始是空的：即時區域先在畫面上，內容出現時才會念

  await build(user, ['18', '÷', '6']);
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument(); // 按「檢查」之前不會有
  await user.click(button('檢查'));
  // 第 1 步算對了：進到第 2 步；提醒是中性的提示，題目還沒結束，所以不是「答對了」，也不是「還不對」
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  expect(region).toHaveTextContent(`提醒${NOTE}`);
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(onCheck.mock.calls).toEqual([['partial']]);
  const noteText = screen.getByText(NOTE);

  // 第 2 步答對：「答對了」和說明出現，提醒還在（同一個區域、同一段文字，不會重念一次）
  await user.type(screen.getByRole('textbox', { name: /第 2 步：算出答案/ }), '3');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText(noteStep.explanation)).toBeInTheDocument();
  expect(noteRegion(container)).toBe(region);
  expect(screen.getByText(NOTE)).toBe(noteText);
  expect(onCheck.mock.calls).toEqual([['partial'], ['correct']]);
  expect(onFinish).not.toHaveBeenCalled();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(true);
});

it('拼算式：拼成正式寫法 (18 − 0) ÷ 6 → 沒有提醒，第 1 步算對也沒有任何訊息', async () => {
  const onFinish = vi.fn();
  const user = setupUser();
  const { container } = render(<QuestionCard step={noteStep} onFinish={onFinish} />);
  await build(user, ['(', '18', M, '0', ')', '÷', '6']);
  await user.click(button('檢查'));
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  expect(screen.queryByText('提醒')).not.toBeInTheDocument();
  expect(noteRegion(container)).toBeEmptyDOMElement();
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();

  await user.type(screen.getByRole('textbox', { name: /第 2 步：算出答案/ }), '3');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  expect(noteRegion(container)).toBeEmptyDOMElement();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(true);
});

it('拼算式：第 2 步答錯、再試一次的過程中，提醒一直都在、也不重新出現；這題不再算第一次就對', async () => {
  const onFinish = vi.fn();
  const user = setupUser();
  const { container } = render(<QuestionCard step={noteStep} onFinish={onFinish} />);
  await build(user, ['18', '÷', '6']);
  await user.click(button('檢查'));
  const noteText = screen.getByText(NOTE);
  const input = screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
  await user.type(input, '18');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('還要除以時間。')).toBeInTheDocument();
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();
  expect(screen.getByText(NOTE)).toBe(noteText);

  await user.click(button('再試一次'));
  expect(screen.getByText(NOTE)).toBe(noteText);
  await user.clear(input);
  await user.type(input, '3');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText(NOTE)).toBe(noteText);
  expect(noteRegion(container)).toHaveTextContent(NOTE);
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(false);
});

it('拼算式：算式沒算對（已知錯誤、不認得的算式）沒有提醒，只有「還不對」', async () => {
  const user = setupUser();
  const { container } = render(<QuestionCard step={noteStep} onFinish={vi.fn()} />);
  await build(user, ['18', M, '0', '÷', '6']);
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('先算除法，再相減。')).toBeInTheDocument();
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  expect(noteRegion(container)).toBeEmptyDOMElement();
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '第 2 步：算出答案' })).not.toBeInTheDocument();
});

it('拼算式：引導結束回到原題（算式已拼好、鎖定在第 2 步）時，省略 − 0 的提醒還在；看解答時一樣在，正確答案顯示正式寫法', async () => {
  // tiles 的索引：18 是 2、÷ 是 6、6 是 1
  const user = setupUser();
  render(<QuestionCard step={noteStep} onFinish={vi.fn()} builtFormula={[2, 6, 1]} />);
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  expect(screen.queryByText('答對了')).not.toBeInTheDocument();

  await user.type(screen.getByRole('textbox', { name: /第 2 步：算出答案/ }), '18');
  await user.click(button('檢查'));
  await user.click(button('看解答'));
  expect(screen.getByText('正確答案')).toBeInTheDocument();
  expect(screen.getByText('( 18 − 0 ) ÷ 6')).toBeInTheDocument();
  expect(screen.getByText(NOTE)).toBeInTheDocument();
});

it('拼算式第 2 步：不接受分數（20/20 不能代替算出答案 1）→ 只提示「請算出答案，填一個數字」，不算答錯、不算一次檢查', async () => {
  const onCheck = vi.fn();
  const user = setupUser();
  const onFinish = vi.fn();
  render(<QuestionCard step={formulaStep} onFinish={onFinish} onCheck={onCheck} />);

  const input = await solveFormula(user);
  expect(onCheck.mock.calls).toEqual([['partial']]);
  for (const raw of ['20/20', '２０／２０', '2 / 2', '1/1']) {
    await user.clear(input);
    await user.type(input, raw);
    await user.click(button('檢查'));
    expect(screen.getByText('請算出答案，填一個數字'), raw).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(`公尺/秒² ${FORMAT_HINT} 請算出答案，填一個數字`); // 單位、格式提示，加上這次的提示
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('只要填數字，不用寫單位'), raw).not.toBeInTheDocument();
    expect(screen.queryByText('還不對'), raw).not.toBeInTheDocument();
    expect(screen.queryByText('答對了'), raw).not.toBeInTheDocument();
  }
  expect(onCheck.mock.calls).toEqual([['partial']]); // 只是提示，沒有算作一次檢查

  // 改成算出來的數字：仍然是第一次就答對
  await user.clear(input);
  await user.type(input, '1');
  await user.click(button('檢查'));
  expect(onCheck.mock.calls).toEqual([['partial'], ['correct']]);
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(onFinish).toHaveBeenCalledWith(true);
});

it('拼算式第 2 步：小數照常接受（0.5 這類）；數字題（不是拼算式）仍然接受分數', async () => {
  const halfStep: FormulaStep = { ...formulaStep, id: 'half', answer: 0.5, wrongAnswers: [], explanation: '10 ÷ 20 = 0.5。', accepted: [['10', '÷', '20']] };
  const user = setupUser();
  const { unmount } = render(<QuestionCard step={halfStep} onFinish={vi.fn()} />);
  await build(user, ['10', '÷', '20']);
  await user.click(button('檢查'));
  const input = screen.getByRole('textbox', { name: /第 2 步：算出答案/ });
  await user.type(input, '1/2');
  await user.click(button('檢查'));
  expect(screen.getByText('請算出答案，填一個數字')).toBeInTheDocument();
  await user.clear(input);
  await user.type(input, '0.5');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  unmount();

  const numberStep: NumberStep = { kind: 'number', id: 'half-number', prompt: '一半是多少？', answer: 0.5, explanation: '1 ÷ 2 = 0.5。' };
  render(<QuestionCard step={numberStep} onFinish={vi.fn()} />);
  await user.type(screen.getByRole('textbox'), '1/2');
  await user.click(button('檢查'));
  expect(screen.queryByText('請算出答案，填一個數字')).not.toBeInTheDocument();
  expect(screen.getByText('答對了')).toBeInTheDocument();
});

it('拼算式：onCheck 告訴外面這次檢查的結果（算式拼對是 partial，答案對了才是 correct）', async () => {
  const onCheck = vi.fn();
  const user = setupUser();
  render(<QuestionCard step={formulaStep} onFinish={vi.fn()} onCheck={onCheck} />);

  await user.click(button('檢查')); // 什麼都沒放：只是提示，不算一次檢查
  expect(onCheck).not.toHaveBeenCalled();
  const input = await solveFormula(user);
  expect(onCheck.mock.calls).toEqual([['partial']]);
  await user.type(input, '400');
  await user.click(button('檢查'));
  expect(onCheck.mock.calls).toEqual([['partial'], ['wrong']]);
  await user.click(button('再試一次'));
  await user.clear(input);
  await user.type(input, '1');
  await user.click(button('檢查'));
  expect(onCheck.mock.calls).toEqual([['partial'], ['wrong'], ['correct']]);
});

it('配對：onCheck 每配一次就告訴外面結果，最後一對才是 correct', async () => {
  const onCheck = vi.fn();
  const user = setupUser();
  render(<MatchCard step={matchStep} onFinish={vi.fn()} onCheck={onCheck} random={() => 0} />);

  await user.click(button('加速度'));
  await user.click(button('平均速度 × 時間'));
  expect(onCheck.mock.calls).toEqual([['wrong']]);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  for (const pair of matchStep.pairs) {
    await user.click(button(pair.left));
    await user.click(button(pair.right));
  }
  expect(onCheck.mock.calls).toEqual([['wrong'], ['partial'], ['partial'], ['correct']]);
});

it('LessonPlayer：配對每配一次播一次音效，全部配完題目區彈跳，完成時播 complete', async () => {
  const play = vi.fn<(kind: SoundKind) => void>();
  const user = setupUser();
  render(
    <SoundProvider enabled player={{ play }}>
      <LessonPlayer lesson={{ id: 'test-match-sound', title: '測試配對音效', steps: [matchStep] }} onComplete={vi.fn()} onExit={vi.fn()} />
    </SoundProvider>,
  );
  const stage = () => screen.getByText(matchStep.prompt).closest('.lp-stage');
  const kinds = () => play.mock.calls.map(([kind]) => kind);

  await user.click(button('加速度'));
  await user.click(button('平均速度 × 時間'));
  expect(kinds()).toEqual(['wrong']);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  await user.click(button(matchStep.pairs[0].left));
  await user.click(button(matchStep.pairs[0].right));
  expect(kinds()).toEqual(['wrong', 'correct']);
  expect(stage()).not.toHaveClass('lp-bounce'); // 還沒配完
  for (const pair of matchStep.pairs.slice(1)) {
    await user.click(button(pair.left));
    await user.click(button(pair.right));
  }
  expect(kinds()).toEqual(['wrong', 'correct', 'correct', 'correct']);
  expect(stage()).toHaveClass('lp-bounce');

  await user.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(kinds()).toEqual(['wrong', 'correct', 'correct', 'correct', 'complete']);
  expect(screen.getByText('正確率 0%')).toBeInTheDocument(); // 配錯過一次，這一題不算一次答對
});

it('拼算式第 2 步答錯、沒有對應的回饋：和數字題一樣是通用提示；有引導時多一句「也可以按『一步一步來』」', async () => {
  // 沒有引導：只有通用提示
  let user = setupUser();
  const { unmount } = render(<QuestionCard step={formulaStep} onFinish={vi.fn()} />);
  await user.type(await solveFormula(user), '2');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(NUMBER_RETRY_HINT)).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_GUIDE_HINT)).not.toBeInTheDocument();
  unmount();

  // 有引導
  user = setupUser();
  const guided: FormulaStep = { ...formulaStep, guide: [{ kind: 'concept', id: 'cart-guide', body: ['加速度 = 力 ÷ 質量。'] }] };
  render(<QuestionCard step={guided} onFinish={vi.fn()} onRequestGuide={vi.fn()} />);
  await user.type(await solveFormula(user), '2');
  await user.click(button('檢查'));
  expect(screen.getByText(NUMBER_GUIDE_HINT)).toBeInTheDocument();
  expect(button('一步一步來')).toBeInTheDocument();
});

it('拼算式第 1 步答錯（沒有對應的回饋）：維持原樣，不出現數字題的提示', async () => {
  const user = setupUser();
  render(<QuestionCard step={formulaStep} onFinish={vi.fn()} />);
  await build(user, ['20', M, '10']);
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_RETRY_HINT)).not.toBeInTheDocument();
  expect(screen.queryByText(FORMAT_HINT)).not.toBeInTheDocument(); // 還沒有數字輸入框
});

// ---- 試玩回饋：拼算式的操作說明、再試一次清空、方塊標示 ----

const HELP = '點方塊放進算式，點算式裡的方塊可以拿回來';

it('tileName：有標示時接在念出來的名稱後面，用全形括號；沒有標示就是念出來的名稱', () => {
  expect(tileName('20', '力')).toBe('20（力）');
  expect(tileName('1.6', '月球 g')).toBe('1.6（月球 g）');
  expect(tileName('20', undefined)).toBe('20');
  expect(tileName('÷', undefined)).toBe('除以');
  expect(tileName('(', '先算')).toBe('左括號（先算）');
});

/**
 * 和 formulaStep 一樣，但兩塊「20」分別標示「力」「質量」，陷阱「10」標示「空車質量」。
 * 有標示的磚塊在算式裡寫成「數值|標示」，照用途判斷：力 ÷ 質量才對，質量 ÷ 力不對。
 */
const ORDER_FEEDBACK = '順序反了：加速度 = 力 ÷ 質量（a = F ÷ m）。';
const labelledStep: FormulaStep = {
  ...formulaStep,
  id: 'cart-accel-labelled',
  tileLabels: ['力', undefined, '質量', undefined, '空車質量', undefined],
  accepted: [['20|力', '÷', '20|質量']],
  wrongForms: [
    { tokens: ['20|力', '×', '20|質量'], feedback: '力除以質量，不是乘。' },
    { tokens: ['20|質量', '÷', '20|力'], feedback: ORDER_FEEDBACK },
  ],
};

it('拼算式：磚塊上方一直有一行操作說明；算式拼對、磚塊收起來之後就不需要了', async () => {
  const { user } = renderCard(formulaStep);
  const help = screen.getByText(HELP);
  expect(help).toBeVisible();
  // 說明在答案列和磚塊的上方
  expect(help.compareDocumentPosition(row()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(help.compareDocumentPosition(bank()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  // 拼錯、再試一次的時候都還在
  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  expect(screen.getByText(HELP)).toBeInTheDocument();
  await user.click(button('再試一次'));
  expect(screen.getByText(HELP)).toBeInTheDocument();

  // 算式拼對：磚塊鎖住、下方收起來，說明也收起來
  await solveFormula(user);
  expect(screen.queryByText(HELP)).not.toBeInTheDocument();
});

it('拼算式：再試一次把答案列清空（拼的是不完整的算式也一樣），焦點回到空的答案列', async () => {
  const { user } = renderCard(bracketStep);
  await build(user, ['(', '6', '+', '18', '÷', '2']);
  await user.click(button('檢查'));
  expect(screen.getByText(INCOMPLETE)).toBeInTheDocument();
  await user.click(button('再試一次'));
  expect(names(row())).toEqual([]);
  expect(row()).toHaveFocus();
  expect(within(bank()).getAllByRole('button').map((b) => b.textContent)).toEqual(bracketStep.tiles);
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
});

it('拼算式：有標示的磚塊，標示用小字寫在數字下方，名稱是「放入 20（力）」「拿回 20（力）」；兩塊「20」分得出來', async () => {
  const { user } = renderCard(labelledStep);
  expect(names(bank())).toEqual(['放入 20（力）', '放入 乘', '放入 20（質量）', '放入 除以', '放入 10（空車質量）', '放入 減']);

  // 標示是磚塊裡的小字（在數字下面），磚塊還是至少 44px
  const force = button('放入 20（力）');
  const caption = within(force).getByText('力');
  expect(caption).toHaveClass('lp-tile-label');
  expect(force.textContent).toBe('20力');
  expect(within(button('放入 乘')).queryByText(/./, { selector: '.lp-tile-label' })).not.toBeInTheDocument();
  for (const tile of within(bank()).getAllByRole('button')) expectTappable(tile);

  // 放上去：答案列的名稱也帶標示；下方留下的空位也保留標示的大小（螢幕閱讀器略過）
  await user.click(button('放入 20（質量）'));
  expect(names(row())).toEqual(['拿回 20（質量）']);
  const ghost = bank().querySelector('.lp-tile--ghost');
  expect(ghost).toHaveAttribute('aria-hidden', 'true');
  expect(ghost?.querySelector('.lp-tile-label')).toHaveTextContent('質量');
  await user.click(button('放入 除以'));
  await user.click(button('放入 20（力）'));
  expect(names(row())).toEqual(['拿回 20（質量）', '拿回 除以', '拿回 20（力）']);

  // 拿回來：回到它自己的位置
  await user.click(button('拿回 20（質量）'));
  expect(names(bank())).toEqual(['放入 乘', '放入 20（質量）', '放入 10（空車質量）', '放入 減']);
  await user.click(button('拿回 除以'));
  await user.click(button('拿回 20（力）'));

  // 拼對之後算式鎖住：鎖住的磚塊名稱也帶標示
  await build(user, ['20', '÷', '20']);
  await user.click(button('檢查'));
  expect(names(row())).toEqual(['20（力）', '除以', '20（質量）']);
  expect(within(row()).getByText('力')).toHaveClass('lp-tile-label');
});

it('LessonPlayer：拼算式在第 1 步答錯 → 引導走完 → 再拼錯：主要按鈕「再試一次」會清空答案列；「再看一次引導」重新進入引導', async () => {
  const lesson: Lesson = {
    id: 'test-formula-guide-again',
    title: '測試再看一次引導',
    steps: [
      {
        ...labelledStep,
        guide: [{ kind: 'concept', id: 'cart-guide', body: ['加速度 = 力 ÷ 質量。'] }],
      },
    ],
  };
  const onComplete = vi.fn();
  const user = setupUser();
  render(<LessonPlayer lesson={lesson} onComplete={onComplete} onExit={vi.fn()} />);

  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  await user.click(button('一步一步來'));
  await user.click(button('繼續'));

  // 回到原題又拼錯
  expect(names(row())).toEqual([]);
  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  expect(button('再試一次')).toHaveFocus();
  expect(button('再看一次引導')).toBeInTheDocument();
  expect(button('看解答')).toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();
  await user.click(button('再試一次'));
  expect(names(row())).toEqual([]);

  // 再拼錯一次，改按「再看一次引導」：重新進入引導
  await build(user, ['20', M, '20']);
  await user.click(button('檢查'));
  await user.click(button('再看一次引導'));
  expect(screen.getByText('加速度 = 力 ÷ 質量。')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 回到原題拼對、算對：這一題仍然不算一次答對
  await user.type(await solveFormula(user), '1');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 10, perfect: false, accuracy: 0 }));
});

it('拼算式（有標示）：質量 ÷ 力 數值碰巧一樣也是錯的，給「順序反了」的回饋；力 ÷ 質量才進到第 2 步', async () => {
  const onCheck = vi.fn();
  const user = setupUser();
  render(<QuestionCard step={labelledStep} onFinish={vi.fn()} onCheck={onCheck} />);

  await user.click(button('放入 20（質量）'));
  await user.click(button('放入 除以'));
  await user.click(button('放入 20（力）'));
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(ORDER_FEEDBACK)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '第 2 步：算出答案' })).not.toBeInTheDocument();
  expect(onCheck.mock.calls).toEqual([['wrong']]);

  await user.click(button('再試一次'));
  await user.click(button('放入 20（力）'));
  await user.click(button('放入 除以'));
  await user.click(button('放入 20（質量）'));
  await user.click(button('檢查'));
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
  expect(names(row())).toEqual(['20（力）', '除以', '20（質量）']);
  expect(onCheck.mock.calls).toEqual([['wrong'], ['partial']]);
});

it('拼算式（有標示）：× 兩邊對調還是同一個算式，一樣認得那則回饋', async () => {
  const user = setupUser();
  render(<QuestionCard step={labelledStep} onFinish={vi.fn()} />);
  await user.click(button('放入 20（質量）'));
  await user.click(button('放入 乘'));
  await user.click(button('放入 20（力）'));
  await user.click(button('檢查'));
  expect(screen.getByText('力除以質量，不是乘。')).toBeInTheDocument();
});

it('拼算式（沒有標示）照舊：兩塊 20 分不出來，先放第二塊或第一塊都算對', async () => {
  const user = setupUser();
  render(<QuestionCard step={formulaStep} onFinish={vi.fn()} />);
  await user.click(within(bank()).getAllByRole('button', { name: '放入 20' })[1]);
  await user.click(button('放入 除以'));
  await user.click(button('放入 20'));
  await user.click(button('檢查'));
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '第 2 步：算出答案' })).toBeInTheDocument();
});

it('拼算式（有標示）看解答：正確算式寫出每一塊的標示，螢幕閱讀器念的是磚塊的名稱', async () => {
  const user = setupUser();
  render(<QuestionCard step={labelledStep} onFinish={vi.fn()} />);
  await build(user, ['20', '×', '20']);
  await user.click(button('檢查'));
  await user.click(button('看解答'));
  expect(screen.getByText('20（力） ÷ 20（質量）')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByText('20（力） 除以 20（質量）')).toHaveClass('lp-sr-only');
  expect(screen.getByText('1 公尺/秒²')).toBeInTheDocument();
});
