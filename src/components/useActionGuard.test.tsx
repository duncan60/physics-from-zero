import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTION_GUARD_MS, useActionGuard } from './useActionGuard';

// 用假的時鐘精確控制時間（performance.now() 和 setTimeout 都是假的），用 fireEvent 點：點下去的當下不會多過任何時間。

/** 一顆受保護的按鈕；按「換階段」就換 resetKey，像「檢查」換成「繼續」一樣重新開始保護。 */
function Demo(props: { onAction: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState(0);
  const guard = useActionGuard(phase);
  return (
    <>
      <button type="button" {...guard(props.onAction, 'lp-button lp-button--primary')}>
        動作
      </button>
      <button type="button" onClick={() => setPhase((n) => n + 1)}>
        換階段
      </button>
    </>
  );
}

const action = () => screen.getByRole('button', { name: '動作' });

function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function expectGuarded(button: HTMLElement): void {
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveClass('lp-button--guarded');
  expect(button).not.toBeDisabled(); // 不用 disabled：焦點才不會跳走
}

function expectReady(button: HTMLElement): void {
  expect(button).not.toHaveAttribute('aria-disabled');
  expect(button).not.toHaveClass('lp-button--guarded');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('保護時間大約 250 毫秒：擋得住連點，刻意的點擊又不用等太久', () => {
  expect(ACTION_GUARD_MS).toBeGreaterThanOrEqual(200);
  expect(ACTION_GUARD_MS).toBeLessThanOrEqual(250);
});

it('剛出現時（新的一張卡）的保護是安靜的：不變淡、沒有 aria-disabled，但點了照樣沒反應；時間到點了就有反應', () => {
  const onAction = vi.fn();
  render(<Demo onAction={onAction} />);

  // 看起來和平常一樣：每張新卡的按鈕不會一出現就閃一下
  expect(action()).toHaveClass('lp-button', 'lp-button--primary');
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled(); // 連點的第二下還是擋得住

  wait(ACTION_GUARD_MS - 1);
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();

  wait(1);
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);

  // 之後一直都能按，不會變淡
  wait(5000);
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(2);
});

it('同一張卡裡換階段時，按鈕才變淡、aria-disabled，點了沒反應；時間到自動恢復，點了就有反應', () => {
  const onAction = vi.fn();
  render(<Demo onAction={onAction} />);
  wait(ACTION_GUARD_MS);
  fireEvent.click(screen.getByRole('button', { name: '換階段' }));

  // 原本的樣式一直都在，保護期間只是多一個淡色的 class
  expect(action()).toHaveClass('lp-button', 'lp-button--primary');
  expectGuarded(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();

  wait(ACTION_GUARD_MS - 1);
  expectGuarded(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();

  wait(1);
  expectReady(action());
  expect(action()).toHaveClass('lp-button', 'lp-button--primary');
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('剛出現的保護還沒結束就換階段：從換階段那一刻重新算，舊的計時器不會提早解除；換了階段就變淡', () => {
  const onAction = vi.fn();
  render(<Demo onAction={onAction} />);
  wait(200);
  expectReady(action()); // 剛出現的保護是安靜的
  fireEvent.click(screen.getByRole('button', { name: '換階段' }));
  expectGuarded(action());

  // 剛出現的保護本來在 250 毫秒結束；換階段後過了 100 毫秒（從出現算起 300 毫秒）還在保護中
  wait(100);
  expectGuarded(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();

  // 換階段後滿 250 毫秒才恢復
  wait(ACTION_GUARD_MS - 100 - 1);
  expectGuarded(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();
  wait(1);
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('每次換階段都重新保護一次，時間到又恢復', () => {
  const onAction = vi.fn();
  render(<Demo onAction={onAction} />);
  wait(ACTION_GUARD_MS);
  expectReady(action());

  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('button', { name: '換階段' }));
    expectGuarded(action());
    fireEvent.click(action());
    expect(onAction).not.toHaveBeenCalled();
    wait(ACTION_GUARD_MS);
    expectReady(action());
  }
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('鍵盤：保護期間焦點留在按鈕上，按 Enter 也不算', () => {
  const onAction = vi.fn();
  render(<Demo onAction={onAction} />);
  action().focus();
  expect(action()).toHaveFocus();
  fireEvent.keyDown(action(), { key: 'Enter' });
  fireEvent.click(action()); // 瀏覽器在按鈕上按 Enter 會送出 click
  expect(onAction).not.toHaveBeenCalled();
  expect(action()).toHaveFocus();
  wait(ACTION_GUARD_MS);
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('StrictMode 底下（effect 會多跑一次）：剛出現時一樣不變淡、照樣擋連點；換階段才變淡，時間到也會恢復', () => {
  const onAction = vi.fn();
  render(
    <StrictMode>
      <Demo onAction={onAction} />
    </StrictMode>,
  );
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).not.toHaveBeenCalled();
  wait(ACTION_GUARD_MS);
  expectReady(action());

  fireEvent.click(screen.getByRole('button', { name: '換階段' }));
  expectGuarded(action());
  wait(ACTION_GUARD_MS);
  expectReady(action());
  fireEvent.click(action());
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('保護期間卸載：計時器清掉，不會留下東西', () => {
  const { unmount } = render(<Demo onAction={() => {}} />);
  wait(ACTION_GUARD_MS);
  fireEvent.click(screen.getByRole('button', { name: '換階段' }));
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
