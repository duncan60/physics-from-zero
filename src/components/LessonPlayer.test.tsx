import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RUNS_KEY, loadRun, saveRun } from '../lib/runs';
import type { SoundKind } from '../lib/sound';
import type { Lesson } from '../lib/types';
import { LessonPlayer } from './LessonPlayer';
import { SoundProvider } from './SoundContext';

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

/** 兩張觀念卡 → 選擇題：測連點。 */
const conceptsLesson: Lesson = {
  id: 'test-concepts',
  title: '測試連點',
  steps: [
    { kind: 'concept', id: 'c1', body: ['第一張卡。'] },
    { kind: 'concept', id: 'c2', body: ['第二張卡。'] },
    {
      kind: 'choice',
      id: 'pick-one',
      prompt: '選一個',
      options: [
        { id: 'a', label: '甲' },
        { id: 'b', label: '乙' },
      ],
      answer: 'a',
      explanation: '甲才對。',
    },
  ],
};

/** 答案是負數的數字題。 */
const negativeLesson: Lesson = {
  id: 'test-negative',
  title: '測試負數',
  steps: [
    { kind: 'number', id: 'down', prompt: '往下的速度是多少？', answer: -10, unit: '公尺/秒', explanation: '往下記為負，所以是 −10 公尺/秒。' },
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

/** 數字題 n + n（答案 2n）。 */
function doubleStep(n: number): Lesson['steps'][number] {
  return { kind: 'number', id: `double-${n}`, prompt: `${n} + ${n} 是多少？`, answer: 2 * n, explanation: `${n} + ${n} = ${2 * n}。` };
}

/** 測連續答對：三題 → 觀念卡 → 兩題。 */
const comboLesson: Lesson = {
  id: 'test-combo',
  title: '測試連續答對',
  steps: [doubleStep(1), doubleStep(2), doubleStep(3), { kind: 'concept', id: 'pause', body: ['休息一下。'] }, doubleStep(4), doubleStep(5)],
};

// 按鈕在畫面換了之後的一小段時間內不會有反應（防連點，約 250 ms），所以測試用假的時鐘：
// `user` 每個動作的前後都會等 SETTLE_MS，像一般人一樣按；`fast` 完全不等，用來模擬連點。
const SETTLE_MS = 500;

interface RenderOptions {
  /** 包在 <StrictMode> 裡（和 main.tsx 一樣），開發模式下 effect 會多跑一次。 */
  strict?: boolean;
  /** 包在 <SoundProvider> 裡，用假的播放器（不會真的發出聲音）。沒給就沒有 SoundProvider（安靜）。 */
  sound?: { enabled: boolean; player: { play(kind: SoundKind): void } };
  /** 假的時鐘（毫秒），用來控制完成畫面上的「花了多久」。 */
  now?: () => number;
  /** 傳給 LessonPlayer 的 onShowStationSummary（App 只在一站的最後一課傳）。 */
  onShowStationSummary?: () => void;
  /** 傳給 LessonPlayer 的 startAt（預覽頁用：從第幾步開始，從 0 算起）。 */
  startAt?: number;
  /** 傳給 LessonPlayer 的 showReportLinks（預覽頁傳 false）。 */
  showReportLinks?: boolean;
  /** 傳給 LessonPlayer 的 isReview（App 在上某一站的複習時傳 true）。 */
  isReview?: boolean;
  /** 傳給 LessonPlayer 的 runStorage（課內存檔；App 傳 getStorage()，預覽不傳）。沒給就不存。 */
  runStorage?: Storage | null;
}

function renderPlayer(lesson: Lesson, options: RenderOptions = {}) {
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const user = userEvent.setup({ delay: SETTLE_MS, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const fast = userEvent.setup({ delay: null });
  const { strict, sound, now, onShowStationSummary, startAt, showReportLinks, isReview, runStorage } = options;
  function Wrapper(props: { children: ReactNode }): React.JSX.Element {
    const inner =
      sound === undefined ? (
        props.children
      ) : (
        <SoundProvider enabled={sound.enabled} player={sound.player}>
          {props.children}
        </SoundProvider>
      );
    return strict === true ? <StrictMode>{inner}</StrictMode> : <>{inner}</>;
  }
  const player = (
    <LessonPlayer
      lesson={lesson}
      onComplete={onComplete}
      onExit={onExit}
      now={now}
      onShowStationSummary={onShowStationSummary}
      startAt={startAt}
      showReportLinks={showReportLinks}
      isReview={isReview}
      runStorage={runStorage}
    />
  );
  const { rerender, unmount } = render(player, {
    wrapper: Wrapper,
  });
  return { user, fast, onComplete, onExit, rerender, unmount };
}

/** 假的時鐘：`clock.now()` 回傳 `clock.time`，測試直接改 `clock.time`。 */
function fakeClock(): { time: number; now: () => number } {
  const clock = { time: 0, now: () => clock.time };
  return clock;
}

/** 假的音效播放器：只記錄播了什麼。 */
function fakePlayer(): { play: ReturnType<typeof vi.fn<(kind: SoundKind) => void>>; kinds: () => SoundKind[] } {
  const play = vi.fn<(kind: SoundKind) => void>();
  return { play, kinds: () => play.mock.calls.map(([kind]) => kind) };
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

/** 讓時間經過，等過防連點的時間。 */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS);
  });
}

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  // shouldAdvanceTime：Testing Library 每個動作結束時會等一個 setTimeout(0)，假的時鐘也要跟著真實時間走才不會卡住。
  // 連點的兩下之間只過幾毫秒的真實時間，遠小於防連點的時間。
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear(); // 課內存檔的測試用真的 localStorage
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  window.localStorage.clear();
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

  // 看到「完成這一課」：完成畫面一出現就回報（App 在這時存檔），不等學習者按「回到地圖」
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText('本課獲得 15 XP')).toBeInTheDocument();
  expect(onComplete).toHaveBeenCalledTimes(1);
  // 10 + 只有數字題第一次就答對的 5；兩題只有一題一次答對，正確率 50%，不是完美
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 15, perfect: false, accuracy: 50 }));
  expect(onExit).not.toHaveBeenCalled();

  // 「回到地圖」只負責離開（和「離開」一樣走 onExit），不會再回報一次
  await user.click(button('回到地圖'));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

type User = ReturnType<typeof userEvent.setup>;

/** plainLesson 兩題都第一次就答對，停在完成畫面。最後一下「繼續」用 `fast` 按，按完不等，還在完成畫面的防連點時間內。 */
async function playPlainLesson(user: User, fast: User): Promise<void> {
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(screen.getByRole('textbox', { name: '3 減 0 是多少？' }), '3');
  await user.click(button('檢查'));
  await fast.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
}

it('完成畫面重新渲染、換了新的 onComplete、按「回到地圖」，都只回報一次', async () => {
  const { user, fast, onComplete, onExit, rerender } = renderPlayer(plainLesson);
  await playPlainLesson(user, fast);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true })); // 10 + 5 + 5 + 完美 5

  // 最後一下「繼續」連點到「回到地圖」：還在防連點的時間內，不會離開完成畫面，但進度已經回報了
  await fast.click(button('回到地圖'));
  expect(onExit).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();

  // App 存檔、頁首更新時會重新渲染，每次都傳一個新的 onComplete
  const later = vi.fn();
  rerender(<LessonPlayer lesson={plainLesson} onComplete={later} onExit={onExit} />);
  rerender(<LessonPlayer lesson={plainLesson} onComplete={(result) => later(result)} onExit={onExit} />);
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText('本課獲得 25 XP')).toBeInTheDocument();

  settle();
  await user.click(button('回到地圖'));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(later).not.toHaveBeenCalled();
});

it('StrictMode 底下（effect 會多跑一次）也只回報一次', async () => {
  const { user, fast, onComplete } = renderPlayer(plainLesson, { strict: true });
  await playPlainLesson(user, fast);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true }));
});

it('一打開就是完成畫面（沒有步驟），StrictMode 底下也只回報一次', () => {
  const { onComplete, onExit } = renderPlayer({ id: 'test-empty', title: '沒有步驟', steps: [] }, { strict: true });
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(onComplete).toHaveBeenCalledTimes(1);
  // 沒有題目：只有完成一課的 10，不算完美；時間從進入算到完成畫面出現，一打開就完成是 0
  expect(onComplete).toHaveBeenCalledWith({ xp: 10, perfect: false, accuracy: 100, durationMs: 0 });
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
  expect(button('切換正負號')).toBeInTheDocument(); // 答案是正數也有，才不會洩漏答案的正負
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

  expect(screen.getByText('本課獲得 25 XP')).toBeInTheDocument();
  await user.click(button('回到地圖'));
  // 10 + 兩題都第一次就答對的 5 + 5 + 完美 5
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true, accuracy: 100 }));
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
  // 10 + 選擇題的 5；看解答的數字題沒有
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 15, perfect: false, accuracy: 50 }));
});

it('數字後面多打了單位：提示「只要填數字，不用寫單位」，不算答錯', async () => {
  const { user } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  const input = screen.getByRole('textbox', { name: '3 減 0 是多少？' });
  await user.type(input, '3公尺');
  await user.click(button('檢查'));
  expect(screen.getByText('只要填數字，不用寫單位')).toBeInTheDocument();
  expect(screen.queryByText('請先輸入數字')).not.toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription(/只要填數字，不用寫單位/);

  // 一改輸入，提示就消失；只填數字就答對，而且仍然算第一次就答對
  await user.clear(input);
  expect(screen.queryByText('只要填數字，不用寫單位')).not.toBeInTheDocument();
  await user.type(input, '3');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(screen.getByText('本課獲得 25 XP')).toBeInTheDocument();
});

it('數字題接受分數：6/2 算對；寫不完整的分數只提示「請先輸入數字」，不是「不用寫單位」', async () => {
  const { user } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  const input = screen.getByRole('textbox', { name: '3 減 0 是多少？' });
  for (const raw of ['6/', '/2', '6//2', '6/0']) {
    await user.clear(input);
    await user.type(input, raw);
    await user.click(button('檢查'));
    expect(screen.getByText('請先輸入數字'), raw).toBeInTheDocument();
    expect(screen.queryByText('只要填數字，不用寫單位'), raw).not.toBeInTheDocument();
    expect(screen.queryByText('還不對'), raw).not.toBeInTheDocument();
  }
  // 分數加了單位：這時才是「不用寫單位」
  await user.clear(input);
  await user.type(input, '6/2 公尺');
  await user.click(button('檢查'));
  expect(screen.getByText('只要填數字，不用寫單位')).toBeInTheDocument();

  // 全形的分數也行，而且仍然算第一次就答對
  await user.clear(input);
  await user.type(input, '６／２');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(screen.getByText('本課獲得 25 XP')).toBeInTheDocument();
});

it('表格題的格子多打了單位，也提示「只要填數字，不用寫單位」', async () => {
  const { user } = renderPlayer(tableLesson);
  await user.type(screen.getByRole('textbox', { name: '速度，1 秒' }), '8 m/s');
  await user.type(screen.getByRole('textbox', { name: '速度，2 秒' }), '6');
  await user.click(button('檢查'));
  expect(screen.getByText('只要填數字，不用寫單位')).toBeInTheDocument();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
});

it('上方看得到課程名稱，和「離開」、進度條在同一列', () => {
  renderPlayer(guidedLesson);
  const title = screen.getByText('測試課程');
  expect(title).toBeVisible();
  expect(title.parentElement?.parentElement).toContainElement(button('離開'));
  expect(title.parentElement).toContainElement(screen.getByRole('progressbar'));
  expect(screen.getByRole('region', { name: '測試課程' })).toBeInTheDocument();
});

it('還沒答過題目就按「離開」：直接離開，不多問', async () => {
  const { user, onComplete, onExit } = renderPlayer(guidedLesson);

  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' })); // 選了，但還沒按「檢查」
  await user.click(button('離開'));

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('答過題目後按「離開」：直接離開，不再確認（做到哪一步已經存起來了），不算完成', async () => {
  const { user, onComplete, onExit } = renderPlayer(guidedLesson);

  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeVisible();

  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(queryButton('確定離開')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('答對、還沒按「繼續」就按「離開」：也是直接離開', async () => {
  const { user, onExit } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
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
  // 答錯過一次，只有完成一課的 10
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 10, perfect: false, accuracy: 0 }));
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
  mockReducedMotion(); // 減少動態效果：模擬不跑動畫迴圈
  const { user } = renderPlayer(simLesson);

  expect(screen.getByText('動手試試看。')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '公車與球的模擬' })).toBeInTheDocument();
  await user.click(button('繼續'));
  expect(screen.getByText('模擬之後的觀念卡。')).toBeInTheDocument();
});

it('連點「檢查」：答錯時「還不對」和回饋留在畫面上，不會直接進入引導', async () => {
  const { user, fast } = renderPlayer(guidedLesson);
  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));

  await fast.dblClick(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('最後一步再看一次')).toBeInTheDocument();
  expect(screen.queryByText('2 + 2 是多少？')).not.toBeInTheDocument();

  // 過了防連點的時間，按鈕照常有反應
  await user.click(button('一步一步來'));
  expect(screen.getByText('2 + 2 是多少？')).toBeInTheDocument();
});

it('連點「檢查」：答對時「答對了」和說明留在畫面上', async () => {
  const { user, fast } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 A' }));

  await fast.dblClick(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(screen.getByText('A 就是 A。')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

it('連點「繼續」只會往前一步，下一題的「檢查」也不會被按到', async () => {
  const { fast } = renderPlayer(conceptsLesson);
  settle();

  // 連點的第二下會落在同一個位置新出現的按鈕上，所以每一下都重新找按鈕。
  await fast.click(button('繼續'));
  await fast.click(button('繼續'));
  expect(screen.getByText('第二張卡。')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

  settle();
  await fast.click(button('繼續'));
  await fast.click(button('檢查'));
  expect(screen.getByText('選一個')).toBeInTheDocument();
  expect(screen.queryByText('請先選一個答案')).not.toBeInTheDocument();

  settle();
  await fast.click(button('檢查'));
  expect(screen.getByText('請先選一個答案')).toBeInTheDocument();
});

it('過了防連點的時間，鍵盤 Enter 照常有用', async () => {
  const { user, fast } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await fast.click(button('檢查')); // 用 fast：按完不等，下一個動作還在防連點的時間內
  expect(button('繼續')).toHaveFocus();

  await fast.keyboard('{Enter}'); // 剛換成「繼續」，還在防連點的時間內：不算
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.keyboard('{Enter}'); // 等過之後就有用
  const input = screen.getByRole('textbox', { name: '3 減 0 是多少？' });

  await user.type(input, '3');
  await user.keyboard('{Enter}'); // 在輸入框按 Enter 就是「檢查」
  expect(screen.getByText('答對了')).toBeInTheDocument();
  expect(button('繼續')).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
});

it('數字題的「±」切換正負號：答案是負數也能輸入', async () => {
  const { user, onComplete } = renderPlayer(negativeLesson);
  const input = screen.getByRole('textbox', { name: '往下的速度是多少？' });
  const sign = button('切換正負號');
  expect(sign).toHaveTextContent('±');
  expect(sign).toHaveStyle({ minHeight: '44px' });

  await user.type(input, '10');
  await user.click(sign);
  expect(input).toHaveValue('-10');
  expect(input).toHaveFocus();
  await user.click(sign);
  expect(input).toHaveValue('10'); // 按兩次回到原本的值
  await user.click(sign);
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));
  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 20, perfect: true })); // 10 + 5 + 完美 5
});

it('「±」：空白時先放負號，接著打的數字接在後面；也認得數學負號和全形負號', async () => {
  const { user } = renderPlayer(negativeLesson);
  const input = screen.getByRole('textbox');
  const sign = button('切換正負號');

  await user.click(sign);
  expect(input).toHaveValue('-');
  expect(input).toHaveFocus();
  await user.keyboard('10');
  expect(input).toHaveValue('-10');

  await user.clear(input);
  await user.type(input, '−5'); // U+2212
  await user.click(sign);
  expect(input).toHaveValue('5');

  await user.clear(input);
  await user.type(input, '－5'); // 全形
  await user.click(sign);
  expect(input).toHaveValue('5');

  await user.clear(input);
  await user.click(sign);
  await user.click(sign);
  expect(input).toHaveValue('');
});

// ---- 遊戲感：連續答對、完成成績、音效、動畫 ----

const textbox = (name: string) => screen.getByRole('textbox', { name });
const progressBar = () => screen.getByRole('progressbar', { name: '課程進度' });
/** 進度條旁邊的「連續答對 N 題！」。 */
const COMBO_TEXT = /^連續答對 \d+ 題！$/;

/** 數字題：輸入、檢查、繼續（第一次就答對）。 */
async function answerNumber(user: User, prompt: string, value: string): Promise<void> {
  await user.type(textbox(prompt), value);
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));
}

it('連續答對 3 題出現「連續答對 3 題！」，答錯後消失', async () => {
  const { user, onComplete } = renderPlayer(comboLesson);

  await answerNumber(user, '1 + 1 是多少？', '2');
  await answerNumber(user, '2 + 2 是多少？', '4');
  expect(screen.queryByText(COMBO_TEXT)).not.toBeInTheDocument();
  expect(progressBar()).not.toHaveClass('lp-progress--combo');

  await answerNumber(user, '3 + 3 是多少？', '6');
  const combo = screen.getByText('連續答對 3 題！');
  expect(combo).toBeVisible();
  expect(progressBar()).toHaveClass('lp-progress--combo');
  // 在進度條旁邊（上方固定列裡），而且是即時區域，螢幕閱讀器會念出來
  expect(progressBar().parentElement).toContainElement(combo);
  expect(combo.closest('[role="status"]')).not.toBeNull();

  // 觀念卡不算題目，不會打斷連續答對
  await user.click(button('繼續'));
  expect(screen.getByText('連續答對 3 題！')).toBeInTheDocument();

  // 答錯：連續答對馬上中斷，提示消失；再試一次答對了也不會回來（這一題已經不是一次答對）
  await user.type(textbox('4 + 4 是多少？'), '9');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.queryByText(COMBO_TEXT)).not.toBeInTheDocument();
  expect(progressBar()).not.toHaveClass('lp-progress--combo');
  await user.click(button('再試一次'));
  await user.clear(textbox('4 + 4 是多少？'));
  await user.type(textbox('4 + 4 是多少？'), '8');
  await user.click(button('檢查'));
  expect(screen.queryByText(COMBO_TEXT)).not.toBeInTheDocument();
  await user.click(button('繼續'));
  expect(screen.queryByText(COMBO_TEXT)).not.toBeInTheDocument();
  expect(progressBar()).not.toHaveClass('lp-progress--combo');

  await answerNumber(user, '5 + 5 是多少？', '10');
  expect(screen.queryByText(COMBO_TEXT)).not.toBeInTheDocument();

  // 10 + 4 題一次答對 × 5 + 連續答對加分 1（第 3 題）= 31；5 題裡 4 題一次答對 → 80%
  expect(screen.getByText('本課獲得 31 XP')).toBeInTheDocument();
  expect(screen.getByText('正確率 80%')).toBeInTheDocument();
  expect(screen.queryByText('完美！')).not.toBeInTheDocument();
  expect(document.querySelector('.lp-confetti')).toBeNull(); // 沒拿到完美，不撒彩紙
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 31, perfect: false, accuracy: 80 }));
});

it('連續答對 4 題：顯示「連續答對 4 題！」', async () => {
  const { user } = renderPlayer(comboLesson);
  await answerNumber(user, '1 + 1 是多少？', '2');
  await answerNumber(user, '2 + 2 是多少？', '4');
  await answerNumber(user, '3 + 3 是多少？', '6');
  await user.click(button('繼續'));
  await answerNumber(user, '4 + 4 是多少？', '8');
  expect(screen.getByText('連續答對 4 題！')).toBeInTheDocument();
  expect(screen.queryByText('連續答對 3 題！')).not.toBeInTheDocument();
});

it('完成畫面顯示 XP、正確率、時間；全對時顯示「完美！」與額外 XP', async () => {
  const clock = fakeClock();
  const { user } = renderPlayer(plainLesson, { now: clock.now });

  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  clock.time = 83_900; // 從進入第一步起算 1 分 23.9 秒（不足一秒捨去）
  await user.click(button('繼續'));

  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.getByText('完美！')).toBeInTheDocument();
  expect(screen.getByText('本課獲得 25 XP')).toBeInTheDocument(); // 10 + 5 + 5 + 完美 5
  expect(screen.getByText('正確率 100%')).toBeInTheDocument();
  expect(screen.getByText('花了 1 分 23 秒')).toBeInTheDocument();
  const confetti = document.querySelector('.lp-confetti');
  expect(confetti).not.toBeNull();
  expect(confetti).toHaveAttribute('aria-hidden', 'true'); // 純裝飾
});

it('沒拿到完美：沒有「完美！」，也沒有完美加分', async () => {
  const { user } = renderPlayer(plainLesson);
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  await user.click(button('再試一次'));
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await answerNumber(user, '3 減 0 是多少？', '3');

  expect(screen.getByText('本課獲得 15 XP')).toBeInTheDocument(); // 10 + 數字題 5
  expect(screen.getByText('正確率 50%')).toBeInTheDocument();
  expect(screen.queryByText('完美！')).not.toBeInTheDocument();
  expect(document.querySelector('.lp-confetti')).toBeNull();
});

it('isReview（某一站的複習）：完成畫面寫「完成複習」和「本次複習獲得 N XP」；isReview 是 false 時和一般的課一樣', async () => {
  for (const [isReview, title, xpText] of [
    [true, '完成複習', '本次複習獲得 25 XP'],
    [false, '完成這一課', '本課獲得 25 XP'],
  ] as const) {
    const { user, unmount } = renderPlayer(plainLesson, { isReview });
    await user.click(screen.getByRole('radio', { name: '選項 A' }));
    await user.click(button('檢查'));
    await user.click(button('繼續'));
    await answerNumber(user, '3 減 0 是多少？', '3');

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(xpText)).toBeInTheDocument(); // 10 + 5 + 5 + 完美 5
    expect(screen.getByText('完美！')).toBeInTheDocument();
    expect(screen.getByText('正確率 100%')).toBeInTheDocument();
    if (isReview) {
      expect(screen.queryByRole('heading', { name: '完成這一課' })).not.toBeInTheDocument();
      expect(screen.queryByText(/本課獲得/)).not.toBeInTheDocument();
    }
    unmount();
  }
});

it('減少動態效果：完美時照樣顯示「完美！」，但不撒彩紙', async () => {
  mockReducedMotion();
  const { user, fast } = renderPlayer(plainLesson);
  await playPlainLesson(user, fast);
  expect(screen.getByText('完美！')).toBeInTheDocument();
  expect(document.querySelector('.lp-confetti')).toBeNull();
});

it('onComplete 收到 { xp, perfect, accuracy, durationMs } 而且只呼叫一次', async () => {
  const clock = fakeClock();
  clock.time = 5_000; // 時鐘不是從 0 開始：時間要從進入第一步起算
  const { user, onComplete, onExit, rerender } = renderPlayer(plainLesson, { now: clock.now, strict: true });

  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  clock.time = 50_000;
  await user.click(button('繼續'));

  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith({ xp: 25, perfect: true, accuracy: 100, durationMs: 45_000 });
  expect(screen.getByText('花了 45 秒')).toBeInTheDocument();

  // 之後時間繼續走、完成畫面重新渲染：顯示的時間不變，也不會再回報
  clock.time = 200_000;
  rerender(<LessonPlayer lesson={plainLesson} onComplete={onComplete} onExit={onExit} now={clock.now} />);
  expect(screen.getByText('花了 45 秒')).toBeInTheDocument();
  await user.click(button('回到地圖'));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('沒有 onShowStationSummary：完成畫面只有「回到地圖」', async () => {
  const { user, fast } = renderPlayer(plainLesson);
  await playPlainLesson(user, fast);
  expect(queryButton('看本站重點')).not.toBeInTheDocument();
  expect(button('回到地圖')).toBeInTheDocument();
});

it('有 onShowStationSummary（一站的最後一課）：完成畫面多一個「看本站重點」，是主要按鈕；「回到地圖」還在', async () => {
  const onShowStationSummary = vi.fn();
  const { user, fast, onComplete, onExit } = renderPlayer(plainLesson, { onShowStationSummary });
  await playPlainLesson(user, fast);
  expect(onComplete).toHaveBeenCalledTimes(1);

  const summary = button('看本站重點');
  const back = button('回到地圖');
  expect(summary).toHaveClass('lp-button--primary');
  expect(back).not.toHaveClass('lp-button--primary');
  // 看本站重點在前面
  expect(summary.compareDocumentPosition(back)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

  // 最後一下「繼續」連點到這裡：還在防連點的時間內，不算數
  await fast.click(summary);
  expect(onShowStationSummary).not.toHaveBeenCalled();

  settle();
  await user.click(button('看本站重點'));
  expect(onShowStationSummary).toHaveBeenCalledTimes(1);
  expect(onExit).not.toHaveBeenCalled();
  expect(onComplete).toHaveBeenCalledTimes(1); // 不會再回報一次
});

it('有 onShowStationSummary 時，「回到地圖」照樣走 onExit', async () => {
  const onShowStationSummary = vi.fn();
  const { user, fast, onExit } = renderPlayer(plainLesson, { onShowStationSummary });
  await playPlainLesson(user, fast);
  settle();
  await user.click(button('回到地圖'));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onShowStationSummary).not.toHaveBeenCalled();
});

it('音效關閉時不呼叫 player.play；開啟時答對呼叫 correct', async () => {
  // 關閉：整課上完（含答錯、沒輸入就檢查）都不播
  const off = fakePlayer();
  const first = renderPlayer(plainLesson, { sound: { enabled: false, player: off } });
  await playWithOneMistake(first.user);
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(off.play).not.toHaveBeenCalled();
  first.unmount();

  // 開啟
  const on = fakePlayer();
  const { user } = renderPlayer(plainLesson, { sound: { enabled: true, player: on } });
  await user.click(button('檢查')); // 還沒選：只是提示，不算作答，不播
  expect(on.play).not.toHaveBeenCalled();
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  expect(on.kinds()).toEqual(['correct']);
  await user.click(button('繼續')); // 換下一步不播
  expect(on.kinds()).toEqual(['correct']);

  await user.type(textbox('3 減 0 是多少？'), '5');
  await user.click(button('檢查'));
  expect(on.kinds()).toEqual(['correct', 'wrong']);
  await user.click(button('再試一次'));
  await user.clear(textbox('3 減 0 是多少？'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  expect(on.kinds()).toEqual(['correct', 'wrong', 'correct']);
  await user.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(on.kinds()).toEqual(['correct', 'wrong', 'correct', 'complete']);
});

/** plainLesson：選擇題一次答對，數字題答錯一次再答對，停在完成畫面。 */
async function playWithOneMistake(user: User): Promise<void> {
  await user.click(button('檢查'));
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(textbox('3 減 0 是多少？'), '5');
  await user.click(button('檢查'));
  await user.click(button('再試一次'));
  await user.clear(textbox('3 減 0 是多少？'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
}

it('答對時題目區加上 lp-bounce；答錯不會', async () => {
  const { user } = renderPlayer(plainLesson);
  const stage = (text: string) => screen.getByText(text).closest('.lp-stage');

  expect(stage('選出 A')).not.toHaveClass('lp-bounce');
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  expect(stage('選出 A')).toHaveClass('lp-bounce');
  await user.click(button('繼續'));

  // 下一題重新開始，答錯不彈跳
  expect(stage('3 減 0 是多少？')).not.toHaveClass('lp-bounce');
  await user.type(textbox('3 減 0 是多少？'), '5');
  await user.click(button('檢查'));
  expect(stage('3 減 0 是多少？')).not.toHaveClass('lp-bounce');
  await user.click(button('再試一次'));
  await user.clear(textbox('3 減 0 是多少？'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  expect(stage('3 減 0 是多少？')).toHaveClass('lp-bounce');
});

it('一步一步來裡的題目也有音效；回到原題時不會彈跳', async () => {
  const player = fakePlayer();
  const { user } = renderPlayer(guidedLesson, { sound: { enabled: true, player } });
  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(player.kinds()).toEqual(['wrong']);
  await user.click(button('一步一步來'));

  await user.type(textbox('2 + 2 是多少？'), '5');
  await user.click(button('檢查'));
  expect(player.kinds()).toEqual(['wrong', 'wrong']);
  await user.click(button('再試一次'));
  await user.clear(textbox('2 + 2 是多少？'));
  await user.type(textbox('2 + 2 是多少？'), '4');
  await user.click(button('檢查'));
  expect(player.kinds()).toEqual(['wrong', 'wrong', 'correct']);
  await user.click(button('繼續'));

  // 回到原題：剛出現時不彈跳，答對了才彈
  const stage = () => screen.getByText('哪一個是對的？').closest('.lp-stage');
  expect(stage()).not.toHaveClass('lp-bounce');
  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  expect(player.kinds()).toEqual(['wrong', 'wrong', 'correct', 'correct']);
  expect(stage()).toHaveClass('lp-bounce');
});

// ---- 回報問題連結 ----

/** 目前畫面上唯一的「回報問題」連結，帶的是哪一步（從網址的 body 讀出步驟 id 和題型）。 */
function reportedStep(): { id: string | undefined; kind: string | undefined } {
  const link = screen.getByRole('link', { name: /回報問題/ }); // 不只一個就會拋錯：每一步只能有一個
  const body = new URL(link.getAttribute('href') ?? '').searchParams.get('body') ?? '';
  return { id: /步驟：(.+)/.exec(body)?.[1], kind: /題型：(.+)/.exec(body)?.[1] };
}

it('每一步下方都有「回報問題」連結，帶的是那一步的 id；一步一步來裡的步驟用它自己的 id', async () => {
  const { user } = renderPlayer(guidedLesson);

  // 觀念卡
  expect(reportedStep()).toEqual({ id: 'intro', kind: 'concept' });
  await user.click(button('繼續'));

  // 有引導的選擇題：答錯前、答錯後都在
  expect(reportedStep()).toEqual({ id: 'pick', kind: 'choice' });
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(reportedStep()).toEqual({ id: 'pick', kind: 'choice' });

  // 一步一步來裡的題目：用引導步驟自己的 id，而且只有一個連結（不會和原題各一個）
  await user.click(button('一步一步來'));
  expect(reportedStep()).toEqual({ id: 'pick-guide', kind: 'number' });
  await user.type(textbox('2 + 2 是多少？'), '4');
  await user.click(button('檢查'));
  expect(reportedStep()).toEqual({ id: 'pick-guide', kind: 'number' });
  await user.click(button('繼續'));

  // 回到原題，再到下一題
  expect(reportedStep()).toEqual({ id: 'pick', kind: 'choice' });
  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(reportedStep()).toEqual({ id: 'count', kind: 'number' });
});

it('一步一步來裡的觀念卡也有連結，帶引導步驟自己的 id', async () => {
  const lesson: Lesson = {
    id: 'test-guide-concept',
    title: '測試引導觀念卡',
    steps: [
      {
        kind: 'number',
        id: 'main',
        prompt: '5 − 2 是多少？',
        answer: 3,
        explanation: '5 − 2 = 3。',
        guide: [
          { kind: 'concept', id: 'main-hint', body: ['先想想看有幾個。'] },
          { kind: 'choice', id: 'main-pick', prompt: '5 比 2 多還是少？', options: [{ id: 'a', label: '多' }, { id: 'b', label: '少' }], answer: 'a', explanation: '多。' },
        ],
      },
    ],
  };
  const { user } = renderPlayer(lesson);
  await user.type(textbox('5 − 2 是多少？'), '9');
  await user.click(button('檢查'));
  await user.click(button('一步一步來'));
  expect(reportedStep()).toEqual({ id: 'main-hint', kind: 'concept' });
  await user.click(button('繼續'));
  expect(reportedStep()).toEqual({ id: 'main-pick', kind: 'choice' });
});

it('動畫、配對、表格也有連結；完成畫面沒有', async () => {
  const lesson: Lesson = {
    id: 'test-kinds',
    title: '測試各種題型',
    steps: [
      { kind: 'sim', id: 'bus', sim: 'bus-ball', prompt: '動手試試看。' },
      {
        kind: 'match',
        id: 'pair-up',
        prompt: '配成一對',
        pairs: [
          { left: '甲', right: '一' },
          { left: '乙', right: '二' },
          { left: '丙', right: '三' },
        ],
        explanation: '都配好了。',
      },
      tableLesson.steps[0],
    ],
  };
  const { user } = renderPlayer(lesson);

  expect(reportedStep()).toEqual({ id: 'bus', kind: 'sim' });
  await user.click(button('繼續'));

  expect(reportedStep()).toEqual({ id: 'pair-up', kind: 'match' });
  for (const pair of [{ left: '甲', right: '一' }, { left: '乙', right: '二' }, { left: '丙', right: '三' }]) {
    await user.click(button(pair.left));
    await user.click(button(pair.right));
  }
  expect(reportedStep()).toEqual({ id: 'pair-up', kind: 'match' }); // 配完了，說明出現後還在
  await user.click(button('繼續'));

  expect(reportedStep()).toEqual({ id: 'speeds', kind: 'table' });
  const inputs = screen.getAllByRole('textbox');
  await user.type(inputs[0], '8');
  await user.type(inputs[1], '6');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument();
});

// ---- startAt（預覽頁：從第幾步開始，從 0 算起）和 showReportLinks ----

const progressNow = () => Number(screen.getByRole('progressbar', { name: '課程進度' }).getAttribute('aria-valuenow'));

it('startAt：從那一步開始，前面的步驟不出現；進度條也從那裡算', async () => {
  const { user, onComplete } = renderPlayer(guidedLesson, { startAt: 1 });
  expect(screen.queryByText('這是一張觀念卡。')).not.toBeInTheDocument();
  expect(screen.getByText('哪一個是對的？')).toBeInTheDocument();
  expect(progressNow()).toBe(1);

  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(textbox('1 + 2 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  // 只有玩過的兩題算數
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ perfect: true, accuracy: 100 }));
});

it('沒有 startAt：和以前一樣從第一步開始', () => {
  renderPlayer(guidedLesson);
  expect(screen.getByText('這是一張觀念卡。')).toBeInTheDocument();
  expect(progressNow()).toBe(0);
});

it('startAt 是最後一步：只有那一步，做完就是完成畫面', async () => {
  const { user, onComplete } = renderPlayer(guidedLesson, { startAt: 2 });
  expect(progressNow()).toBe(2);
  await user.type(textbox('1 + 2 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('startAt 超出範圍或不是整數：太大停在最後一步，其他（負數、小數、NaN）從第一步開始', () => {
  for (const [startAt, expected] of [
    [99, 2],
    [3, 2],
    [-1, 0],
    [1.5, 0],
    [Number.NaN, 0],
  ] as const) {
    const { unmount } = renderPlayer(guidedLesson, { startAt });
    expect(progressNow(), `startAt ${startAt}`).toBe(expected);
    unmount();
  }
});

it('startAt 換了（同一課），就從新的那一步重新開始；沒換就不重來', async () => {
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const { rerender } = render(<LessonPlayer lesson={guidedLesson} startAt={1} onComplete={onComplete} onExit={onExit} />);
  expect(progressNow()).toBe(1);
  await userEvent.setup({ delay: null }).click(screen.getByRole('radio', { name: '選項 B' })); // 作答到一半的狀態

  rerender(<LessonPlayer lesson={guidedLesson} startAt={1} onComplete={onComplete} onExit={onExit} />);
  expect(screen.getByRole('radio', { name: '選項 B' })).toBeChecked(); // 沒換，原本的狀態還在

  rerender(<LessonPlayer lesson={guidedLesson} startAt={2} onComplete={onComplete} onExit={onExit} />);
  expect(progressNow()).toBe(2);
  expect(screen.getByText('1 + 2 是多少？')).toBeInTheDocument();
});

it('showReportLinks 是 false：每一步（包括一步一步來裡的）都沒有「回報問題」', async () => {
  const { user } = renderPlayer(guidedLesson, { showReportLinks: false });
  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument(); // 觀念卡
  expect(screen.queryByText('需要 GitHub 帳號')).not.toBeInTheDocument();
  await user.click(button('繼續'));

  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument(); // 題目
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument(); // 答錯之後
  await user.click(button('一步一步來'));
  expect(screen.getByText('2 + 2 是多少？')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /回報問題/ })).not.toBeInTheDocument(); // 引導裡
});

it('showReportLinks 預設和 true 都有「回報問題」，包括一步一步來裡', async () => {
  for (const showReportLinks of [undefined, true]) {
    const { user, unmount } = renderPlayer(guidedLesson, { startAt: 1, showReportLinks });
    expect(screen.getByRole('link', { name: /回報問題/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '選項 B' }));
    await user.click(button('檢查'));
    await user.click(button('一步一步來'));
    expect(reportedStep()).toEqual({ id: 'pick-guide', kind: 'number' });
    unmount();
  }
});

// ---- 試玩回饋：按鈕保護看得出來、答錯一定有提示、數字格式提示 ----

const NUMBER_RETRY_HINT = '檢查一下：用的是哪個公式？正負號和小數點對嗎？';
const NUMBER_GUIDE_HINT = '檢查一下：用的是哪個公式？正負號和小數點對嗎？也可以按『一步一步來』。';
const TABLE_RETRY_HINT = '標出來的格子再看一次：每一格之間變化的量一樣嗎？';
const FORMAT_HINT = '只要填數字，可以是負數（按 ±）或小數；單位已經寫好了';
const FORMAT_HINT_NO_UNIT = '只要填數字，可以是負數（按 ±）或小數';

/** 有引導、有一個已知錯誤答案的數字題。 */
const guidedNumberLesson: Lesson = {
  id: 'test-guided-number',
  title: '測試數字引導',
  steps: [
    {
      kind: 'number',
      id: 'speed',
      prompt: '10 秒走 50 公尺，速度是多少？',
      answer: 5,
      unit: '公尺/秒',
      wrongAnswers: [{ value: 500, feedback: '500 是 50 × 10，速度要用除的。' }],
      explanation: '50 ÷ 10 = 5 公尺/秒。',
      guide: [{ kind: 'concept', id: 'speed-guide', body: ['速度 = 距離 ÷ 時間。'] }],
    },
  ],
};

it('回饋出現後，按鈕先淡色（aria-disabled）一下：點了沒反應；時間到自動恢復，點了就有反應', async () => {
  const { user, fast } = renderPlayer(guidedLesson);
  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await fast.click(button('檢查'));

  // 剛換成「一步一步來」「看解答」：看得出來還不能按（不是 disabled，焦點留在主要按鈕上）
  for (const name of ['一步一步來', '看解答']) {
    expect(button(name), name).toHaveAttribute('aria-disabled', 'true');
    expect(button(name), name).toHaveClass('lp-button', 'lp-button--guarded');
    expect(button(name), name).not.toBeDisabled();
  }
  expect(button('一步一步來')).toHaveFocus();
  await fast.click(button('一步一步來'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.queryByText('2 + 2 是多少？')).not.toBeInTheDocument();

  // 約 250 毫秒後就恢復
  act(() => {
    vi.advanceTimersByTime(250);
  });
  for (const name of ['一步一步來', '看解答']) {
    expect(button(name), name).not.toHaveAttribute('aria-disabled');
    expect(button(name), name).not.toHaveClass('lp-button--guarded');
  }
  await fast.click(button('一步一步來'));
  expect(screen.getByText('2 + 2 是多少？')).toBeInTheDocument();
});

/** 按鈕看起來和平常一樣：沒有變淡、沒有 aria-disabled。 */
function expectNotDimmed(element: HTMLElement): void {
  expect(element).not.toHaveAttribute('aria-disabled');
  expect(element).not.toHaveClass('lp-button--guarded');
}

it('每一張新的卡剛出現時，按鈕不變淡（沒有 aria-disabled），不會一出現就閃一下；連點的第二下照樣擋得住', async () => {
  const { fast } = renderPlayer(conceptsLesson);
  expectNotDimmed(button('繼續'));
  settle();

  await fast.click(button('繼續'));
  // 第二張觀念卡：一出現就是一般的樣子，但這一下（連點的第二下）不算
  expectNotDimmed(button('繼續'));
  await fast.click(button('繼續'));
  expect(screen.getByText('第二張卡。')).toBeInTheDocument();

  settle();
  await fast.click(button('繼續'));
  // 新的一題：「檢查」不變淡，連點也按不到
  expectNotDimmed(button('檢查'));
  await fast.click(button('檢查'));
  expect(screen.queryByText('請先選一個答案')).not.toBeInTheDocument();
});

it('完成畫面剛出現時，「回到地圖」不變淡；連點也不會直接按到', async () => {
  const { user, fast, onExit } = renderPlayer(plainLesson);
  await playPlainLesson(user, fast);
  expectNotDimmed(button('回到地圖'));
  await fast.click(button('回到地圖'));
  expect(onExit).not.toHaveBeenCalled();
  settle();
  await fast.click(button('回到地圖'));
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('數字題答錯、沒有對應的回饋：「還不對」加上通用提示（沒有引導時不提「一步一步來」）', async () => {
  const { user } = renderPlayer(plainLesson, { startAt: 1 });
  await user.type(screen.getByRole('textbox', { name: '3 減 0 是多少？' }), '5');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(NUMBER_RETRY_HINT)).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_GUIDE_HINT)).not.toBeInTheDocument();
  expect(button('再試一次')).toBeInTheDocument();

  // 再試一次：提示收起來
  await user.click(button('再試一次'));
  expect(screen.queryByText(NUMBER_RETRY_HINT)).not.toBeInTheDocument();
});

it('有引導的數字題答錯、沒有對應的回饋：通用提示多一句「也可以按『一步一步來』」', async () => {
  const { user } = renderPlayer(guidedNumberLesson);
  await user.type(screen.getByRole('textbox', { name: '10 秒走 50 公尺，速度是多少？' }), '7');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(NUMBER_GUIDE_HINT)).toBeInTheDocument();
  expect(button('一步一步來')).toBeInTheDocument();
});

it('數字題答錯、有對應的回饋：只顯示那則回饋，不加通用提示', async () => {
  const { user } = renderPlayer(guidedNumberLesson);
  await user.type(screen.getByRole('textbox', { name: '10 秒走 50 公尺，速度是多少？' }), '500');
  await user.click(button('檢查'));
  expect(screen.getByText('500 是 50 × 10，速度要用除的。')).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_GUIDE_HINT)).not.toBeInTheDocument();
  expect(screen.queryByText(NUMBER_RETRY_HINT)).not.toBeInTheDocument();
});

it('表格題答錯：「還不對」加上通用提示', async () => {
  const { user } = renderPlayer(tableLesson);
  await user.type(screen.getByRole('textbox', { name: '速度，1 秒' }), '8');
  await user.type(screen.getByRole('textbox', { name: '速度，2 秒' }), '7');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText(TABLE_RETRY_HINT)).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_RETRY_HINT)).not.toBeInTheDocument();
});

it('數字輸入框下方有格式提示，輸入框的說明也念得到', () => {
  renderPlayer(plainLesson, { startAt: 1 });
  expect(screen.getByText(FORMAT_HINT)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '3 減 0 是多少？' })).toHaveAccessibleDescription(`公尺 ${FORMAT_HINT}`);
});

it('沒有單位的數字題：格式提示不說「單位已經寫好了」', () => {
  renderPlayer(guidedLesson, { startAt: 2 });
  expect(screen.getByText(FORMAT_HINT_NO_UNIT)).toBeInTheDocument();
  expect(screen.queryByText(FORMAT_HINT)).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '1 + 2 是多少？' })).toHaveAccessibleDescription(FORMAT_HINT_NO_UNIT);
});

// ---- 試玩回饋：引導走完一次之後，再答錯不會整套重來 ----

/** 兩題有引導的數字題（各有一個已知錯誤答案），測「引導走完過」是每一題各自記的。 */
const twoGuidedLesson: Lesson = {
  id: 'test-two-guided',
  title: '測試兩題引導',
  steps: [
    {
      kind: 'number',
      id: 'speed',
      prompt: '10 秒走 50 公尺，速度是多少？',
      answer: 5,
      unit: '公尺/秒',
      wrongAnswers: [{ value: 500, feedback: '500 是 50 × 10，速度要用除的。' }],
      explanation: '50 ÷ 10 = 5 公尺/秒。',
      guide: [{ kind: 'number', id: 'speed-guide', prompt: '50 ÷ 10 是多少？', answer: 5, explanation: '50 ÷ 10 = 5。' }],
    },
    {
      kind: 'number',
      id: 'time',
      prompt: '每秒 5 公尺走 20 公尺，要幾秒？',
      answer: 4,
      unit: '秒',
      explanation: '20 ÷ 5 = 4 秒。',
      guide: [{ kind: 'concept', id: 'time-guide', body: ['時間 = 距離 ÷ 速度。'] }],
    },
  ],
};

const speedInput = () => screen.getByRole('textbox', { name: '10 秒走 50 公尺，速度是多少？' });

/** 第一題答錯 → 一步一步來 → 引導裡答對 → 回到原題。 */
async function finishSpeedGuide(user: User, wrong: string): Promise<void> {
  await user.type(speedInput(), wrong);
  await user.click(button('檢查'));
  await user.click(button('一步一步來'));
  await user.type(screen.getByRole('textbox', { name: '50 ÷ 10 是多少？' }), '5');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(speedInput()).toBeInTheDocument();
}

it('引導走完一次之後再答錯：主要按鈕是「再試一次」，次要按鈕是「再看一次引導」和「看解答」；第一次答錯照舊是「一步一步來」', async () => {
  const { user } = renderPlayer(twoGuidedLesson);

  // 第一次答錯：照舊
  await user.type(speedInput(), '500');
  await user.click(button('檢查'));
  expect(button('一步一步來')).toHaveFocus();
  expect(queryButton('再試一次')).not.toBeInTheDocument();
  expect(queryButton('再看一次引導')).not.toBeInTheDocument();
  await user.click(button('一步一步來'));
  await user.type(screen.getByRole('textbox', { name: '50 ÷ 10 是多少？' }), '5');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  // 回到原題又答錯：不再整套重來
  await user.type(speedInput(), '500');
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  expect(screen.getByText('500 是 50 × 10，速度要用除的。')).toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();
  const actions = screen.getAllByRole('button').filter((b) => b.closest('.lp-actions') !== null).map((b) => b.textContent);
  expect(actions).toEqual(['再試一次', '再看一次引導', '看解答']);
  expect(button('再試一次')).toHaveClass('lp-button--primary');
  expect(button('再看一次引導')).toHaveClass('lp-button--secondary');
  expect(button('看解答')).toHaveClass('lp-button--secondary');
  expect(button('再試一次')).toHaveFocus();

  // 再試一次：留在原題，保留剛才的輸入
  await user.click(button('再試一次'));
  expect(speedInput()).toHaveValue('500');
  expect(speedInput()).toHaveFocus();
  expect(screen.queryByText('50 ÷ 10 是多少？')).not.toBeInTheDocument();
});

it('引導走完一次之後再答錯，按「再看一次引導」會重新進入引導；走完回到原題，之後再答錯一樣是「再試一次」', async () => {
  const { user } = renderPlayer(twoGuidedLesson);
  await finishSpeedGuide(user, '500');

  await user.type(speedInput(), '7');
  await user.click(button('檢查'));
  await user.click(button('再看一次引導'));
  expect(screen.queryByText('10 秒走 50 公尺，速度是多少？')).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: '50 ÷ 10 是多少？' }), '5');
  await user.click(button('檢查'));
  await user.click(button('繼續'));

  // 回到原題（重新開始），再答錯：還是「再試一次」
  expect(speedInput()).toHaveValue('');
  await user.type(speedInput(), '7');
  await user.click(button('檢查'));
  expect(button('再試一次')).toBeInTheDocument();
  expect(button('再看一次引導')).toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();
});

it('引導走完一次之後再答錯、沒有對應的回饋：通用提示不再叫人按「一步一步來」（畫面上沒有那顆按鈕）', async () => {
  const { user } = renderPlayer(twoGuidedLesson);
  await finishSpeedGuide(user, '7');
  await user.type(speedInput(), '7');
  await user.click(button('檢查'));
  expect(screen.getByText(NUMBER_RETRY_HINT)).toBeInTheDocument();
  expect(screen.queryByText(NUMBER_GUIDE_HINT)).not.toBeInTheDocument();
  expect(queryButton('一步一步來')).not.toBeInTheDocument();
});

it('引導走完一次之後答對：這一題仍然不算一次答對；下一題第一次答錯時照舊是「一步一步來」', async () => {
  const { user, onComplete } = renderPlayer(twoGuidedLesson);
  await finishSpeedGuide(user, '500');
  await user.type(speedInput(), '500');
  await user.click(button('檢查'));
  await user.click(button('再試一次'));
  await user.clear(speedInput());
  await user.type(speedInput(), '5');
  await user.click(button('檢查'));
  expect(screen.getByText('答對了')).toBeInTheDocument();
  await user.click(button('繼續'));

  // 下一題：「引導走完過」不會帶過來
  const time = screen.getByRole('textbox', { name: '每秒 5 公尺走 20 公尺，要幾秒？' });
  await user.type(time, '100');
  await user.click(button('檢查'));
  expect(button('一步一步來')).toBeInTheDocument();
  expect(queryButton('再看一次引導')).not.toBeInTheDocument();
  expect(screen.getByText(NUMBER_GUIDE_HINT)).toBeInTheDocument();
  await user.click(button('看解答'));
  await user.click(button('繼續'));

  // 兩題都不是一次答對：只有基本的 10 XP
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 10, perfect: false, accuracy: 0 }));
});

// ---- 課內存檔：重新整理、或離開後再打開同一課，從上次那一步繼續 ----
// 「重新整理」用卸載再掛載一次 LessonPlayer 模擬（存檔在 localStorage 裡，畫面上的狀態全部不見）。

const resumeLine = (step: number) => `從上次的第 ${step} 步繼續`;
/** 一課每一步的 id，依順序（loadRun 用來確認課程沒有改過）。 */
const stepIds = (lesson: Lesson) => lesson.steps.map((s) => s.id);
const queryResumeLine = () => screen.queryByText(/^從上次的第 \d+ 步繼續$/);

/** comboLesson 的第 n 題（n + n）：一次答對；`miss` 時先答錯、看解答再繼續。 */
async function answerDouble(user: User, n: number, miss = false): Promise<void> {
  await user.type(textbox(`${n} + ${n} 是多少？`), String(miss ? 999 : 2 * n));
  await user.click(button('檢查'));
  if (miss) {
    expect(screen.getByText('還不對')).toBeInTheDocument();
    await user.click(button('看解答'));
  }
  await user.click(button('繼續'));
}

it('做到第 3 步後重新整理：從第 3 步繼續，上方顯示「從上次的第 3 步繼續」和「從頭開始」', async () => {
  const first = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  // 第一次打開：沒有存檔，沒有這一行
  expect(queryResumeLine()).not.toBeInTheDocument();
  expect(queryButton('從頭開始')).not.toBeInTheDocument();
  await first.user.click(button('繼續'));
  await first.user.click(screen.getByRole('radio', { name: '選項 C' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  expect(progressNow()).toBe(2);
  first.unmount();

  const { user, onComplete } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  expect(progressNow()).toBe(2);
  expect(screen.getByText(resumeLine(3))).toBeInTheDocument();
  expect(button('從頭開始')).toBeInTheDocument();
  expect(screen.getByText('1 + 2 是多少？')).toBeInTheDocument();
  expect(screen.queryByText('這是一張觀念卡。')).not.toBeInTheDocument();
  // 焦點照常在這一步上（不是「從頭開始」）
  expect(screen.getByText('1 + 2 是多少？').closest('.lp-stage')).toHaveFocus();

  await user.type(textbox('1 + 2 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  // 兩題都一次答對，和一次做完一樣：10 + 5 + 5 + 完美 5
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true, accuracy: 100 }));
});

it('從存檔接著做完：XP、完美、正確率和一次做完的一樣（包括連續答對加分）', async () => {
  // 一次做完、每一題都一次答對：基本 10 + 5 題 × 5 + 連續答對加分 3 + 完美 5
  const once = renderPlayer(comboLesson);
  for (const n of [1, 2, 3]) await answerDouble(once.user, n);
  await once.user.click(button('繼續'));
  for (const n of [4, 5]) await answerDouble(once.user, n);
  expect(once.onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 43, perfect: true, accuracy: 100 }));
  const oneGo = once.onComplete.mock.calls[0][0];
  once.unmount();

  // 做完三題和觀念卡，重新整理；連續答對 3 題也接著算
  const first = renderPlayer(comboLesson, { runStorage: window.localStorage });
  for (const n of [1, 2, 3]) await answerDouble(first.user, n);
  await first.user.click(button('繼續'));
  first.unmount();

  const { user, onComplete } = renderPlayer(comboLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(5))).toBeInTheDocument();
  expect(screen.getByText('連續答對 3 題！')).toBeInTheDocument();
  for (const n of [4, 5]) await answerDouble(user, n);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith({ ...oneGo, durationMs: expect.any(Number) });
});

it('從存檔接著做完（中間有答錯）：XP、沒有完美、正確率都和一次做完的一樣', async () => {
  const once = renderPlayer(comboLesson);
  await answerDouble(once.user, 1, true);
  for (const n of [2, 3]) await answerDouble(once.user, n);
  await once.user.click(button('繼續'));
  for (const n of [4, 5]) await answerDouble(once.user, n);
  // 10 + 4 題 × 5 + 連續答對加分 2（第 4、5 題才連續 3 題以上），沒有完美
  expect(once.onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 32, perfect: false, accuracy: 80 }));
  const oneGo = once.onComplete.mock.calls[0][0];
  once.unmount();

  // 分三次做：做完兩題離開、再做到觀念卡之後離開
  const first = renderPlayer(comboLesson, { runStorage: window.localStorage });
  await answerDouble(first.user, 1, true);
  await answerDouble(first.user, 2);
  first.unmount();
  const second = renderPlayer(comboLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(3))).toBeInTheDocument();
  await answerDouble(second.user, 3);
  await second.user.click(button('繼續'));
  second.unmount();

  const { user, onComplete } = renderPlayer(comboLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(5))).toBeInTheDocument();
  for (const n of [4, 5]) await answerDouble(user, n);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith({ ...oneGo, durationMs: expect.any(Number) });
});

it('這一題答錯後就離開：回來時這一題重新開始作答，但不算一次答對', async () => {
  const first = renderPlayer(plainLesson, { runStorage: window.localStorage });
  await first.user.click(screen.getByRole('radio', { name: '選項 B' }));
  await first.user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeInTheDocument();
  first.unmount();

  const { user, onComplete } = renderPlayer(plainLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(1))).toBeInTheDocument();
  // 題目裡的半成品不保存：選項、回饋都清掉了
  expect(screen.getByRole('radio', { name: '選項 B' })).not.toBeChecked();
  expect(screen.queryByText('還不對')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  // 和一次做完（第一題答錯再改對）一樣：10 + 第二題的 5，正確率 50%，不是完美
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 15, perfect: false, accuracy: 50 }));
});

it('花了多久：從存檔的時間接著算，離開的那段時間不算（重新整理後時鐘從 0 開始也一樣）', async () => {
  for (const resumeClock of [2_000, 900_000]) {
    window.localStorage.clear();
    const clock = fakeClock();
    clock.time = 1_000;
    const first = renderPlayer(plainLesson, { runStorage: window.localStorage, now: clock.now });
    await first.user.click(screen.getByRole('radio', { name: '選項 A' }));
    await first.user.click(button('檢查'));
    clock.time = 11_000; // 第一題花了 10 秒
    await first.user.click(button('繼續'));
    first.unmount();

    clock.time = resumeClock;
    const { user, onComplete, unmount } = renderPlayer(plainLesson, { runStorage: window.localStorage, now: clock.now });
    await user.type(textbox('3 減 0 是多少？'), '3');
    await user.click(button('檢查'));
    clock.time = resumeClock + 5_000; // 第二題花了 5 秒
    await user.click(button('繼續'));
    expect(onComplete, `時鐘 ${resumeClock}`).toHaveBeenCalledWith({ xp: 25, perfect: true, accuracy: 100, durationMs: 15_000 });
    expect(screen.getByText('花了 15 秒')).toBeInTheDocument();
    unmount();
  }
});

it('「從頭開始」：清掉存檔、回到第 1 步，作答統計也重新算', async () => {
  // 第 2 步答錯、用了引導，做到第 3 步後離開
  const first = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  await first.user.click(button('繼續'));
  await first.user.click(screen.getByRole('radio', { name: '選項 B' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('一步一步來'));
  await first.user.type(textbox('2 + 2 是多少？'), '4');
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  await first.user.click(screen.getByRole('radio', { name: '選項 C' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  first.unmount();

  const { user, onComplete, unmount } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(3))).toBeInTheDocument();
  await user.click(button('從頭開始'));

  expect(progressNow()).toBe(0);
  expect(screen.getByText('這是一張觀念卡。')).toBeInTheDocument();
  expect(queryResumeLine()).not.toBeInTheDocument();
  expect(queryButton('從頭開始')).not.toBeInTheDocument();
  expect(loadRun(window.localStorage, guidedLesson.id, stepIds(guidedLesson))).toBeNull();
  // 按下的按鈕不見了，焦點移到第一步
  expect(screen.getByText('這是一張觀念卡。').closest('.lp-stage')).toHaveFocus();

  // 重新整理：還沒進到下一步，所以沒有存檔，一樣從第 1 步開始
  unmount();
  const again = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  expect(progressNow()).toBe(0);
  expect(queryResumeLine()).not.toBeInTheDocument();

  // 這次全部一次答對：之前答錯的那一題不再算進來，拿到完美
  await again.user.click(button('繼續'));
  await again.user.click(screen.getByRole('radio', { name: '選項 C' }));
  await again.user.click(button('檢查'));
  await again.user.click(button('繼續'));
  await again.user.type(textbox('1 + 2 是多少？'), '3');
  await again.user.click(button('檢查'));
  await again.user.click(button('繼續'));
  expect(again.onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true, accuracy: 100 }));
  expect(onComplete).not.toHaveBeenCalled();
});

it('「從頭開始」剛出現時防連點：從地圖點進來的第二下不會按到', async () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 }, elapsedMs: 0 });
  const { fast } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  await fast.click(button('從頭開始'));
  expect(progressNow()).toBe(2);
  expect(screen.getByText(resumeLine(3))).toBeInTheDocument();
  settle();
  await fast.click(button('從頭開始'));
  expect(progressNow()).toBe(0);
});

it('進到下一步後，「從上次的第 N 步繼續」就收起來；之後每一步照樣存檔', async () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 1, nextStepId: 'pick', stepCount: 3, stepMissed: false, stats: { questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 }, elapsedMs: 0 });
  const { user } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  expect(screen.getByText(resumeLine(2))).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  expect(screen.getByText(resumeLine(2))).toBeInTheDocument(); // 還在這一步
  await user.click(button('繼續'));
  expect(queryResumeLine()).not.toBeInTheDocument();
  expect(queryButton('從頭開始')).not.toBeInTheDocument();
  expect(loadRun(window.localStorage, guidedLesson.id, stepIds(guidedLesson))).toMatchObject({ nextStep: 2, stepMissed: false, stats: { questions: 1, clean: 1 } });
});

it('上完這一課就清掉存檔：再打開從第 1 步開始', async () => {
  const first = renderPlayer(plainLesson, { runStorage: window.localStorage });
  await first.user.click(screen.getByRole('radio', { name: '選項 A' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  expect(loadRun(window.localStorage, plainLesson.id, stepIds(plainLesson))).toMatchObject({ nextStep: 1 });
  await first.user.type(textbox('3 減 0 是多少？'), '3');
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  expect(screen.getByRole('heading', { name: '完成這一課' })).toBeInTheDocument();
  expect(loadRun(window.localStorage, plainLesson.id, stepIds(plainLesson))).toBeNull();
  expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
  first.unmount();

  renderPlayer(plainLesson, { runStorage: window.localStorage });
  expect(progressNow()).toBe(0);
  expect(queryResumeLine()).not.toBeInTheDocument();
});

it('存檔壞掉、版本不符、步數超出範圍或課程改過：從第 1 步開始，不顯示「從上次…」，也不會壞掉', async () => {
  const valid = { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 }, elapsedMs: 0 };
  for (const raw of [
    '{not json',
    JSON.stringify({ version: 99, runs: { [guidedLesson.id]: valid } }),
    JSON.stringify({ version: 1, runs: { [guidedLesson.id]: { ...valid, nextStep: 3 } } }),
    JSON.stringify({ version: 1, runs: { [guidedLesson.id]: { ...valid, nextStep: 99 } } }),
    JSON.stringify({ version: 1, runs: { [guidedLesson.id]: { ...valid, stepCount: 5 } } }),
    JSON.stringify({ version: 1, runs: { [guidedLesson.id]: { ...valid, nextStepId: 'pick' } } }),
    JSON.stringify({ version: 1, runs: { [guidedLesson.id]: { ...valid, stats: 'oops' } } }),
  ]) {
    window.localStorage.setItem(RUNS_KEY, raw);
    const { user, unmount } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
    expect(progressNow(), raw).toBe(0);
    expect(screen.getByText('這是一張觀念卡。')).toBeInTheDocument();
    expect(queryResumeLine(), raw).not.toBeInTheDocument();
    // 進到下一步時存一份新的、正確的
    await user.click(button('繼續'));
    expect(loadRun(window.localStorage, guidedLesson.id, stepIds(guidedLesson)), raw).toMatchObject({ nextStep: 1 });
    unmount();
  }
});

it('沒給 runStorage（本機預覽）：不讀也不寫存檔', async () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 }, elapsedMs: 0 });
  const before = window.localStorage.getItem(RUNS_KEY);
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

  const { user, onComplete } = renderPlayer(guidedLesson);
  expect(progressNow()).toBe(0);
  expect(queryResumeLine()).not.toBeInTheDocument();
  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  await user.click(button('看解答'));
  await user.click(button('繼續'));
  await user.type(textbox('1 + 2 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(onComplete).toHaveBeenCalledTimes(1);

  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
  expect(removeItem).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(RUNS_KEY)).toBe(before);
});

it('儲存空間不能用（runStorage 是 null）或存不進去：照常上課，只是不存', async () => {
  const unavailable = renderPlayer(plainLesson, { runStorage: null });
  await playPlainLesson(unavailable.user, unavailable.fast);
  expect(unavailable.onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true }));
  unavailable.unmount();

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const full = renderPlayer(plainLesson, { runStorage: window.localStorage });
  await playPlainLesson(full.user, full.fast);
  expect(full.onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true }));
  expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
});

it('「離開」之後再打開同一課：回到離開時的那一步，離開沒有丟掉任何進度', async () => {
  const first = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  await first.user.click(button('繼續'));
  await first.user.click(screen.getByRole('radio', { name: '選項 C' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  await first.user.click(button('離開'));
  expect(first.onExit).toHaveBeenCalledTimes(1);
  first.unmount(); // App 回到地圖

  renderPlayer(guidedLesson, { runStorage: window.localStorage });
  expect(progressNow()).toBe(2);
  expect(screen.getByText(resumeLine(3))).toBeInTheDocument();
});

it('StrictMode 底下也一樣：從存檔繼續、做完只回報一次、清掉存檔', async () => {
  const first = renderPlayer(plainLesson, { runStorage: window.localStorage, strict: true });
  await first.user.click(screen.getByRole('radio', { name: '選項 A' }));
  await first.user.click(button('檢查'));
  await first.user.click(button('繼續'));
  first.unmount();

  const { user, onComplete } = renderPlayer(plainLesson, { runStorage: window.localStorage, strict: true });
  expect(screen.getByText(resumeLine(2))).toBeInTheDocument();
  await user.type(textbox('3 減 0 是多少？'), '3');
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ xp: 25, perfect: true, accuracy: 100 }));
  expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
});

it('換了一課：讀那一課自己的存檔；在別一課按過「從頭開始」也一樣', async () => {
  const stats = { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 };
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats, elapsedMs: 0 });
  saveRun(window.localStorage, { lessonId: plainLesson.id, nextStep: 1, nextStepId: 'q2', stepCount: 2, stepMissed: false, stats, elapsedMs: 0 });
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const { rerender } = render(<LessonPlayer lesson={guidedLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  expect(progressNow()).toBe(2);
  settle();
  await userEvent.setup({ delay: null }).click(button('從頭開始'));
  expect(progressNow()).toBe(0);

  // 例如用上一頁直接回到另一課：同一個上課畫面換了課程
  rerender(<LessonPlayer lesson={plainLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  expect(progressNow()).toBe(1);
  expect(screen.getByText(resumeLine(2))).toBeInTheDocument();

  // 回到剛才按過「從頭開始」的那一課：它的存檔已經清掉了
  rerender(<LessonPlayer lesson={guidedLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  expect(progressNow()).toBe(0);
  expect(queryResumeLine()).not.toBeInTheDocument();
});

it('在 A 課按過「從頭開始」、換到 B 課再回到 A 課：A 課在那之後存的新存檔照樣讀得到', async () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 }, elapsedMs: 0 });
  const onComplete = vi.fn();
  const onExit = vi.fn();
  const fast = userEvent.setup({ delay: null });
  const { rerender } = render(<LessonPlayer lesson={guidedLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  settle();
  await fast.click(button('從頭開始'));
  expect(progressNow()).toBe(0);
  // 從頭開始之後又往前走了一步：存了一份新的存檔
  settle();
  await fast.click(button('繼續'));
  expect(progressNow()).toBe(1);
  expect(loadRun(window.localStorage, guidedLesson.id, stepIds(guidedLesson))).toMatchObject({ nextStep: 1 });

  // 同一個上課畫面換到 B 課，再回到 A 課
  rerender(<LessonPlayer lesson={plainLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  expect(progressNow()).toBe(0);
  rerender(<LessonPlayer lesson={guidedLesson} onComplete={onComplete} onExit={onExit} runStorage={window.localStorage} />);
  expect(progressNow()).toBe(1);
  expect(screen.getByText(resumeLine(2))).toBeInTheDocument();
});

it('課程改過：步數一樣、但步驟換了順序（存檔的下一步 id 對不上）：從第 1 步開始，不顯示「從上次…」', () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 2, nextStepId: 'count', stepCount: 3, stepMissed: false, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 }, elapsedMs: 0 });
  const [intro, pick, count] = guidedLesson.steps;
  const reordered: Lesson = { ...guidedLesson, steps: [intro, count, pick] };
  renderPlayer(reordered, { runStorage: window.localStorage });
  expect(progressNow()).toBe(0);
  expect(screen.getByText('這是一張觀念卡。')).toBeInTheDocument();
  expect(queryResumeLine()).not.toBeInTheDocument();
});

it('從存檔接著做時，焦點所在的這一步用 aria-describedby 指向「從上次的第 N 步繼續」，螢幕閱讀器念得到；進到下一步就拿掉', async () => {
  saveRun(window.localStorage, { lessonId: guidedLesson.id, nextStep: 1, nextStepId: 'pick', stepCount: 3, stepMissed: false, stats: { questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 }, elapsedMs: 0 });
  const { user } = renderPlayer(guidedLesson, { runStorage: window.localStorage });
  const stage = () => document.querySelector<HTMLElement>('.lp-stage');
  expect(stage()).toHaveFocus();
  expect(stage()).toHaveAccessibleDescription(resumeLine(2));

  await user.click(screen.getByRole('radio', { name: '選項 C' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(queryResumeLine()).not.toBeInTheDocument();
  expect(stage()).toHaveFocus();
  expect(stage()).not.toHaveAttribute('aria-describedby');
});

// ---- 存不進去時，「離開」先確認（存得進去時直接離開） ----

const LEAVE_TITLE = '要離開這一課嗎？';
const LEAVE_TEXT = '離開後，這一課要從頭開始。';

it('儲存空間不能用（runStorage 是 null）、但還沒有任何進度：按「離開」直接離開', async () => {
  const { user, onExit } = renderPlayer(guidedLesson, { runStorage: null });
  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('儲存空間不能用（runStorage 是 null）：有進度之後按「離開」先確認；「繼續上課」回到原本的地方，「確定離開」才離開', async () => {
  const { user, onComplete, onExit } = renderPlayer(guidedLesson, { runStorage: null });
  await user.click(button('繼續'));
  await user.click(screen.getByRole('radio', { name: '選項 B' }));
  await user.click(button('檢查'));
  expect(screen.getByText('還不對')).toBeVisible();

  await user.click(button('離開'));
  expect(onExit).not.toHaveBeenCalled();
  const dialog = screen.getByRole('alertdialog', { name: LEAVE_TITLE });
  expect(dialog).toHaveAccessibleDescription(LEAVE_TEXT);
  expect(within(dialog).getByRole('button', { name: '繼續上課' })).toHaveFocus(); // 預設是比較安全的那一個
  expect(screen.getByText('還不對')).not.toBeVisible(); // 題目先收起來，畫面上只有這個問題

  // 再按一次「離開」不會就這樣離開
  await user.click(button('離開'));
  expect(onExit).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();

  await user.click(button('繼續上課'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByText('還不對')).toBeVisible();
  expect(screen.getByText('最後一步再看一次')).toBeVisible();
  expect(button('離開')).toHaveFocus(); // 焦點回到按下去的按鈕

  await user.click(button('離開'));
  await user.click(button('確定離開'));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('存不進去（setItem 拋出例外）：按「離開」先確認；連點不會按到「確定離開」；按 Esc 等於「繼續上課」', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const { user, fast, onExit } = renderPlayer(plainLesson, { runStorage: window.localStorage });
  await user.click(screen.getByRole('radio', { name: '選項 A' }));
  await user.click(button('檢查'));
  await user.click(button('繼續'));
  expect(progressNow()).toBe(1);
  settle();

  await fast.click(button('離開'));
  await fast.click(button('確定離開'));
  expect(onExit).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: LEAVE_TITLE })).toBeInTheDocument();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(button('離開')).toHaveFocus();
  expect(onExit).not.toHaveBeenCalled();

  await user.click(button('離開'));
  await user.click(button('確定離開'));
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('存得進去時「離開」直接離開；這次存不進去才先確認，之後又存進去了就不再確認', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const { user, onExit } = renderPlayer(comboLesson, { runStorage: window.localStorage });
  await answerDouble(user, 1);
  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);

  setItem.mockImplementationOnce(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  await answerDouble(user, 2);
  await user.click(button('離開'));
  expect(screen.getByRole('alertdialog', { name: LEAVE_TITLE })).toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
  await user.click(button('繼續上課'));

  await answerDouble(user, 3);
  expect(loadRun(window.localStorage, comboLesson.id, stepIds(comboLesson))).toMatchObject({ nextStep: 3 });
  await user.click(button('離開'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(2);
});
