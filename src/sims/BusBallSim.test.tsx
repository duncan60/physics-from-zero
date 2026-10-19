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

it('有「丟球」「急煞車」「重來」三個按鈕，至少 44px 高，一開始沒有結果', () => {
  mockReducedMotion(true);
  render(<BusBallSim />);
  for (const button of [throwButton(), brakeButton(), resetButton()]) {
    expect(button).toBeEnabled();
    expect(button).toHaveStyle({ minHeight: '44px' });
  }
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

  it('先按「急煞車」再「丟球」，落在前方 4.0 公尺', () => {
    mockReducedMotion(true);
    render(<BusBallSim />);
    fireEvent.click(brakeButton());
    expect(result()).toBeEmptyDOMElement();
    fireEvent.click(throwButton());
    expect(result()).toHaveTextContent(/^落在你前方 4\.0 公尺$/);
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
    expect(brakeButton()).toBeEnabled();
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

  it('丟球之前就能按「急煞車」，同一刻丟球會落在前方 4.0 公尺', () => {
    setup();
    advance(200);
    fireEvent.click(brakeButton());
    fireEvent.click(throwButton());
    advance(1200);
    expect(result()).toHaveTextContent(/^落在你前方 4\.0 公尺$/);
  });

  it('公車停住之後才丟，落在手上', () => {
    setup();
    fireEvent.click(brakeButton());
    advance(2000);
    fireEvent.click(throwButton());
    advance(1200);
    expect(result()).toHaveTextContent(/^落在手上$/);
  });

  it('球落地後只剩「重來」可以按；重來之後可以再丟', () => {
    setup();
    fireEvent.click(throwButton());
    advance(1200);
    expect(throwButton()).toBeDisabled();
    expect(brakeButton()).toBeDisabled();
    expect(resetButton()).toBeEnabled();
    fireEvent.click(resetButton());
    expect(result()).toBeEmptyDOMElement();
    expect(throwButton()).toBeEnabled();
    expect(brakeButton()).toBeEnabled();
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

  it('慢動作：同一刻煞車並丟球，仍然落在前方 4.0 公尺', () => {
    setup();
    fireEvent.click(slowToggle());
    fireEvent.click(brakeButton());
    fireEvent.click(throwButton());
    advance(5000);
    expect(result()).toHaveTextContent(/^落在你前方 4\.0 公尺$/);
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
    expect(brakeButton()).toBeEnabled();
    fireEvent.click(brakeButton());
    expect(brakeButton()).toBeDisabled();
  });
});
