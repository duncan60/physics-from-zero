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

  it('丟球之後「丟球」不能再按，煞車之後「急煞車」不能再按', () => {
    setup();
    fireEvent.click(throwButton());
    expect(throwButton()).toBeDisabled();
    expect(brakeButton()).toBeEnabled();
    fireEvent.click(brakeButton());
    expect(brakeButton()).toBeDisabled();
  });
});
