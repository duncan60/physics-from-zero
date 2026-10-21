import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusBallSim } from './BusBallSim';

function mockReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

const throwButton = () => screen.getByRole('button', { name: '丟球' });
const brakeButton = () => screen.getByRole('button', { name: '急煞車' });
const resetButton = () => screen.getByRole('button', { name: '重來' });
const result = () => screen.getByRole('status');
const slowToggle = () => screen.getByRole('checkbox', { name: '慢動作' });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const BRAKE_HINT = '先按「丟球」，球在空中時再按「急煞車」';
const brakeHint = () => screen.queryByText(BRAKE_HINT);
/** 球落地了還沒煞車時的提示：「丟球」也不能按了，要先「重來」。 */
const RETRY_HINT = '按「重來」再試一次';
const retryHint = () => screen.queryByText(RETRY_HINT);

/** 「急煞車」不能按的時候是 aria-disabled（還拿得到焦點，螢幕閱讀器念得到為什麼），按了沒有反應。 */
function expectBrakeBlocked(): void {
  expect(brakeButton()).toHaveAttribute('aria-disabled', 'true');
}

function expectBrakeReady(): void {
  expect(brakeButton()).not.toHaveAttribute('aria-disabled');
  expect(brakeButton()).toBeEnabled();
}

it('有「丟球」「急煞車」「重來」三個按鈕，至少 44px 高，一開始沒有結果；還沒丟球，「急煞車」不能按', () => {
  mockReducedMotion(true);
  render(<BusBallSim />);
  for (const button of [throwButton(), brakeButton(), resetButton()]) {
    expect(button).toHaveStyle({ minHeight: '44px' });
  }
  expect(throwButton()).toBeEnabled();
  expect(resetButton()).toBeEnabled();
  expectBrakeBlocked();
  expect(result()).toBeEmptyDOMElement();
});

it('結果文字放在會被報讀的區域', () => {
  mockReducedMotion(true);
  render(<BusBallSim />);
  expect(result()).toHaveAttribute('aria-live', 'polite');
});

it('SVG 會跟著容器寬度縮放', () => {
  mockReducedMotion(true);
  const { container } = render(<BusBallSim />);
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('viewBox');
  expect(svg).toHaveAttribute('width', '100%');
});

describe('減少動態效果', () => {
  it('按「丟球」直接顯示「落在手上」', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    fireEvent.click(throwButton());
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('丟球之後再按「急煞車」，當作球飛到一半才煞車，落在前方 1.0 公尺', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    fireEvent.click(throwButton());
    fireEvent.click(brakeButton());
    expect(result()).toHaveTextContent(/^落在你前方 1\.0 公尺$/);
  });

  it('丟球前「急煞車」不能按（按了沒反應）；丟球後才可以按，按了當作球飛到一半煞車', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    expectBrakeBlocked();
    // 說明在上面那段「減少動態效果」的文字裡（丟球之後再按），不顯示「球在空中時」的提示
    expect(brakeButton()).toHaveAccessibleDescription(/丟球之後再按「急煞車」/);
    expect(brakeHint()).not.toBeInTheDocument();
    fireEvent.click(brakeButton());
    fireEvent.click(throwButton());
    expect(result()).toHaveTextContent(/^落在手上$/); // 剛才那一下沒有煞到車
    expectBrakeReady();
    fireEvent.click(brakeButton());
    expect(result()).toHaveTextContent(/^落在你前方 1\.0 公尺$/);
    expectBrakeBlocked();
  });

  it('沒有動畫可以放慢，所以不顯示「慢動作」開關', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    expect(screen.queryByRole('checkbox', { name: '慢動作' })).not.toBeInTheDocument();
  });

  it('「重來」清掉結果，可以再試一次', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    fireEvent.click(throwButton());
    fireEvent.click(brakeButton());
    fireEvent.click(resetButton());
    expect(result()).toBeEmptyDOMElement();
    expect(throwButton()).toBeEnabled();
    expectBrakeBlocked();
    fireEvent.click(throwButton());
    expect(result()).toHaveTextContent(/^落在手上$/);
  });
});

describe('有動畫（假的計時器）', () => {
  function setup() {
    vi.useFakeTimers();
    mockReducedMotion(false);
    return render(<BusBallSim />);
  }

  it('丟球後球還在空中時沒有結果，過 1 秒才顯示「落在手上」', () => {
    setup();
    advance(300);
    fireEvent.click(throwButton());
    advance(500);
    expect(result()).toBeEmptyDOMElement();
    advance(600);
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('球飛到一半按「急煞車」，球落在前方 1 公尺左右', () => {
    setup();
    fireEvent.click(throwButton());
    advance(500);
    fireEvent.click(brakeButton());
    advance(700);
    const match = /^落在你前方 (\d\.\d) 公尺$/.exec(result().textContent ?? '');
    expect(match).not.toBeNull();
    const meters = Number(match?.[1]);
    expect(meters).toBeGreaterThanOrEqual(0.8);
    expect(meters).toBeLessThanOrEqual(1.2);
  });

  it('丟球之前「急煞車」不能按，旁邊有提示；按了沒反應，公車照樣前進，之後丟球落在手上', () => {
    setup();
    advance(200);
    expectBrakeBlocked();
    expect(brakeHint()).toBeVisible();
    expect(brakeButton()).toHaveAccessibleDescription(BRAKE_HINT);
    fireEvent.click(brakeButton());
    advance(500);
    expect(screen.getByText('公車速度：10.0 公尺/秒')).toBeInTheDocument(); // 沒有「煞車中」
    fireEvent.click(throwButton());
    advance(1200);
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('球在空中時「急煞車」可以按、提示收起來；煞車之後不能再按，提示也不再出現', () => {
    setup();
    fireEvent.click(throwButton());
    advance(300);
    expectBrakeReady();
    expect(brakeHint()).not.toBeVisible();
    expect(brakeButton()).not.toHaveAccessibleDescription();
    fireEvent.click(brakeButton());
    expectBrakeBlocked();
    expect(brakeHint()).not.toBeVisible();
    advance(900);
    expect(result()).toHaveTextContent(/^落在你前方/);
    expect(brakeHint()).not.toBeVisible();
  });

  it('球落地了還沒煞車：「急煞車」不能按，提示改成按「重來」再試一次（「丟球」也不能按了）；按了也不會改變結果', () => {
    setup();
    fireEvent.click(throwButton());
    advance(1200);
    expect(result()).toHaveTextContent(/^落在手上$/);
    expectBrakeBlocked();
    expect(throwButton()).toBeDisabled();
    expect(brakeHint()).not.toBeInTheDocument(); // 不再叫人「先按丟球」
    expect(retryHint()).toBeVisible();
    expect(brakeButton()).toHaveAccessibleDescription(RETRY_HINT);
    fireEvent.click(brakeButton());
    advance(500);
    expect(result()).toHaveTextContent(/^落在手上$/);

    // 重來之後還沒丟球：回到原本的提示
    fireEvent.click(resetButton());
    expect(retryHint()).not.toBeInTheDocument();
    expect(brakeHint()).toBeVisible();
    expect(brakeButton()).toHaveAccessibleDescription(BRAKE_HINT);
  });

  it('「急煞車」不能按時仍然拿得到焦點（不會把焦點丟掉）；在空中用鍵盤按下去，焦點留在按鈕上', () => {
    setup();
    act(() => brakeButton().focus());
    expect(brakeButton()).toHaveFocus();
    fireEvent.click(throwButton());
    advance(300);
    act(() => brakeButton().focus());
    fireEvent.click(brakeButton());
    expect(brakeButton()).toHaveFocus();
    expectBrakeBlocked();
  });

  it('球落地後只剩「重來」可以按；重來之後可以再丟', () => {
    setup();
    fireEvent.click(throwButton());
    advance(1200);
    expect(throwButton()).toBeDisabled();
    expectBrakeBlocked();
    expect(resetButton()).toBeEnabled();
    fireEvent.click(resetButton());
    expect(result()).toBeEmptyDOMElement();
    expect(throwButton()).toBeEnabled();
    expectBrakeBlocked(); // 重來之後一樣要先丟球
    fireEvent.click(throwButton());
    advance(500);
    fireEvent.click(brakeButton());
    advance(700);
    expect(result()).toHaveTextContent(/^落在你前方/);
  });

  it('按鈕下面有提示：球只在空中 1 秒，越早按急煞車落得越前面', () => {
    setup();
    const hint = '球只在空中停留 1 秒，要在球飛的時候按「急煞車」；越早按，球落得越前面。';
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === hint)).toBeInTheDocument();
  });

  it('「慢動作」開關預設是關的，開關有 44px 以上的點擊範圍', () => {
    setup();
    expect(slowToggle()).not.toBeChecked();
    expect(slowToggle().closest('label')).toHaveStyle({ minHeight: '44px' });
  });

  it('慢動作開啟：1 秒後球還沒落地，4 秒後才落地，結果和即時速度一樣是「落在手上」', () => {
    setup();
    fireEvent.click(slowToggle());
    fireEvent.click(throwButton());
    advance(1000);
    expect(result()).toBeEmptyDOMElement();
    advance(3500);
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('慢動作開啟：在球飛到一半（慢動作的 2 秒）按「急煞車」，結果和即時速度一樣約 1 公尺', () => {
    setup();
    fireEvent.click(slowToggle());
    fireEvent.click(throwButton());
    advance(2000);
    expect(result()).toBeEmptyDOMElement();
    fireEvent.click(brakeButton());
    advance(3000);
    const match = /^落在你前方 (\d\.\d) 公尺$/.exec(result().textContent ?? '');
    expect(match).not.toBeNull();
    const meters = Number(match?.[1]);
    expect(meters).toBeGreaterThanOrEqual(0.8);
    expect(meters).toBeLessThanOrEqual(1.2);
  });

  it('慢動作：丟球前一樣不能煞車；過了真實的 1 秒球還在空中，「急煞車」仍然可以按', () => {
    setup();
    fireEvent.click(slowToggle());
    expectBrakeBlocked();
    fireEvent.click(throwButton());
    advance(1500);
    expect(result()).toBeEmptyDOMElement();
    expectBrakeReady();
    advance(3000);
    expect(result()).toHaveTextContent(/^落在手上$/);
    expectBrakeBlocked();
  });

  it('飛行途中切換慢動作不會弄壞狀態：開了就變慢，關了就恢復', () => {
    setup();
    advance(100);
    fireEvent.click(throwButton());
    advance(400);
    fireEvent.click(slowToggle());
    advance(1000);
    expect(result()).toBeEmptyDOMElement();
    expect(throwButton()).toBeDisabled();
    fireEvent.click(slowToggle());
    advance(500);
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('按「重來」不會把慢動作關掉', () => {
    setup();
    fireEvent.click(slowToggle());
    fireEvent.click(throwButton());
    advance(4500);
    expect(result()).toHaveTextContent(/^落在手上$/);
    fireEvent.click(resetButton());
    expect(slowToggle()).toBeChecked();
    expect(result()).toBeEmptyDOMElement();
  });

  it('丟球之後「丟球」不能再按，煞車之後「急煞車」不能再按', () => {
    setup();
    fireEvent.click(throwButton());
    expect(throwButton()).toBeDisabled();
    expectBrakeReady();
    fireEvent.click(brakeButton());
    expectBrakeBlocked();
  });
});
