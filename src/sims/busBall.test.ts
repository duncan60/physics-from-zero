import { describe, expect, it } from 'vitest';
import {
  BRAKE_DECEL,
  BUS_SPEED,
  FLIGHT_TIME,
  GRAVITY,
  THROW_UP_SPEED,
  ballPosition,
  busPosition,
  busSpeed,
  landingOffset,
  landingText,
} from './busBall';

describe('常數', () => {
  it('和 1-1 的數字一致', () => {
    expect(BUS_SPEED).toBe(10);
    expect(THROW_UP_SPEED).toBe(5);
    expect(GRAVITY).toBe(10);
    expect(BRAKE_DECEL).toBe(8);
    expect(FLIGHT_TIME).toBe(1);
  });
});

describe('landingOffset', () => {
  it('沒有煞車，球落回手上', () => expect(landingOffset(0, null)).toBeCloseTo(0));
  it('丟球的同時煞車，球落在前方 4 公尺', () => expect(landingOffset(0, 0)).toBeCloseTo(4));
  it('球飛到一半才煞車，落在前方但不到 4 公尺', () => {
    const d = landingOffset(0, 0.5);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(4);
  });
  it('球飛到一半才煞車，剛好落在前方 1 公尺', () => expect(landingOffset(0, 0.5)).toBeCloseTo(1));
  it('公車已經停住才丟，落回手上', () => expect(landingOffset(5, 0)).toBeCloseTo(0));
  it('球落地之後才煞車，不影響球', () => expect(landingOffset(0, 1.5)).toBeCloseTo(0));
  it('丟球前就開始煞車，球帶著當下的車速，落在前方', () => {
    const d = landingOffset(0.5, 0);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(4.0001);
  });
  it('丟球的時間點不影響結果，只看和煞車的時間差', () => expect(landingOffset(3, 3.5)).toBeCloseTo(landingOffset(0, 0.5)));
});

describe('busSpeed', () => {
  it('沒煞車就是 10 公尺/秒', () => expect(busSpeed(3, null)).toBeCloseTo(10));
  it('煞車前還是 10 公尺/秒', () => expect(busSpeed(0.4, 0.5)).toBeCloseTo(10));
  it('煞車後每秒少 8 公尺/秒', () => expect(busSpeed(1.5, 0.5)).toBeCloseTo(2));
  it('減速到 0 就停住，不會變成負的', () => expect(busSpeed(100, 0)).toBe(0));
});

describe('busPosition', () => {
  it('t=0 時位置是 0', () => expect(busPosition(0, null)).toBe(0));
  it('沒煞車，每秒 10 公尺', () => expect(busPosition(2.5, null)).toBeCloseTo(25));
  it('煞車後第 1 秒走 6 公尺', () => expect(busPosition(1, 0)).toBeCloseTo(6));
  it('煞車後不會倒退', () => expect(busPosition(100, 0)).toBeCloseTo(6.25));
  it('停住之後位置不再改變', () => expect(busPosition(3, 0)).toBeCloseTo(busPosition(30, 0)));
  it('煞車前照原速前進', () => expect(busPosition(0.5, 0.5)).toBeCloseTo(5));
});

describe('ballPosition', () => {
  it('球在 1 秒後落地', () => {
    expect(ballPosition(0.5, 0, null).landed).toBe(false);
    expect(ballPosition(1, 0, null).landed).toBe(true);
    expect(ballPosition(0.5, 0, null).y).toBeCloseTo(1.25);
  });
  it('丟出去之前球在手上，跟著公車走', () => {
    const b = ballPosition(0.3, 1, null);
    expect(b.landed).toBe(false);
    expect(b.y).toBe(0);
    expect(b.x).toBeCloseTo(3);
  });
  it('沒煞車，球的水平位置一直和公車一樣', () => {
    for (const t of [0.2, 0.5, 0.9]) expect(ballPosition(t, 0, null).x).toBeCloseTo(busPosition(t, null));
  });
  it('煞車之後，球的水平速度不變，公車卻慢下來', () => {
    expect(ballPosition(1, 0, 0).x).toBeCloseTo(10);
    expect(busPosition(1, 0)).toBeCloseTo(6);
  });
  it('落地之後球停在落點，高度是 0', () => {
    const b = ballPosition(5, 0, 0);
    expect(b.landed).toBe(true);
    expect(b.y).toBe(0);
    expect(b.x).toBeCloseTo(10);
  });
  it('飛到最高點是 1.25 公尺', () => expect(ballPosition(0.5, 0, null).y).toBeCloseTo(1.25));
});

describe('landingText', () => {
  it('偏差為 0 時寫「落在手上」', () => expect(landingText(0)).toBe('落在手上'));
  it('浮點誤差也算落在手上', () => expect(landingText(1e-12)).toBe('落在手上'));
  it('四捨五入後是 0.0 也算落在手上', () => expect(landingText(0.04)).toBe('落在手上'));
  it('四捨五入到小數點後一位', () => {
    expect(landingText(4)).toBe('落在你前方 4.0 公尺');
    expect(landingText(1)).toBe('落在你前方 1.0 公尺');
    expect(landingText(2.345)).toBe('落在你前方 2.3 公尺');
    expect(landingText(0.96)).toBe('落在你前方 1.0 公尺');
  });
});
