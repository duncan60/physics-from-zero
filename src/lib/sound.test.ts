import { describe, expect, it, vi } from 'vitest';
import { createSoundPlayer, type SoundKind } from './sound';

/** 假的 AudioContext：只記錄呼叫，不發出任何聲音。 */
function makeFakeContext(initialState: AudioContextState = 'running') {
  const oscillators: Array<{
    type: string;
    frequencySet: Array<[number, number]>;
    connectedTo: unknown[];
    started: number[];
    stopped: number[];
  }> = [];
  const gains: Array<{ values: number[]; connectedTo: unknown[] }> = [];
  const destination = { name: 'destination' };

  const ctx = {
    currentTime: 1,
    state: initialState,
    destination,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const rec = {
        type: 'sine',
        frequencySet: [] as Array<[number, number]>,
        connectedTo: [] as unknown[],
        started: [] as number[],
        stopped: [] as number[],
      };
      oscillators.push(rec);
      return {
        get type() {
          return rec.type;
        },
        set type(v: string) {
          rec.type = v;
        },
        frequency: {
          value: 0,
          setValueAtTime: (v: number, t: number) => rec.frequencySet.push([v, t]),
        },
        connect: (target: unknown) => {
          rec.connectedTo.push(target);
          return target;
        },
        disconnect: () => {},
        start: (t?: number) => rec.started.push(t ?? 0),
        stop: (t?: number) => rec.stopped.push(t ?? 0),
        onended: null as null | (() => void),
      };
    }),
    createGain: vi.fn(() => {
      const rec = { values: [] as number[], connectedTo: [] as unknown[] };
      gains.push(rec);
      return {
        gain: {
          set value(v: number) {
            rec.values.push(v);
          },
          setValueAtTime: (v: number) => rec.values.push(v),
          linearRampToValueAtTime: (v: number) => rec.values.push(v),
          exponentialRampToValueAtTime: (v: number) => rec.values.push(v),
        },
        connect: (target: unknown) => {
          rec.connectedTo.push(target);
          return target;
        },
        disconnect: () => {},
      };
    }),
  };

  return { ctx, oscillators, gains, destination };
}

const asContext = (c: unknown) => c as AudioContext;
const KINDS: SoundKind[] = ['correct', 'wrong', 'complete'];

describe('createSoundPlayer：沒有可用的 AudioContext', () => {
  it('沒有 AudioContext 或建立時拋出例外，play 不會拋出', () => {
    const nullPlayer = createSoundPlayer(() => null);
    const throwingPlayer = createSoundPlayer(() => {
      throw new Error('AudioContext 不支援');
    });
    for (const kind of KINDS) {
      expect(() => nullPlayer.play(kind)).not.toThrow();
      expect(() => throwingPlayer.play(kind)).not.toThrow();
    }
  });

  it('預設的 factory 在沒有 Web Audio 的環境（jsdom）也安靜失敗', () => {
    const player = createSoundPlayer();
    for (const kind of KINDS) {
      expect(() => player.play(kind)).not.toThrow();
    }
  });

  it('factory 失敗後不會一直重試', () => {
    const factory = vi.fn(() => {
      throw new Error('boom');
    });
    const player = createSoundPlayer(factory);
    player.play('correct');
    player.play('wrong');
    player.play('complete');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('建立 AudioContext 之後，內部任何一步拋出例外也會被吞掉', () => {
    const { ctx } = makeFakeContext();
    ctx.createOscillator.mockImplementation(() => {
      throw new Error('createOscillator 失敗');
    });
    const player = createSoundPlayer(() => asContext(ctx));
    for (const kind of KINDS) {
      expect(() => player.play(kind)).not.toThrow();
    }
  });
});

describe('createSoundPlayer：有 AudioContext', () => {
  it('延遲到第一次 play 才建立 AudioContext，且只建立一次', () => {
    const { ctx } = makeFakeContext();
    const factory = vi.fn(() => asContext(ctx));
    const player = createSoundPlayer(factory);
    expect(factory).not.toHaveBeenCalled();
    player.play('correct');
    expect(factory).toHaveBeenCalledTimes(1);
    player.play('wrong');
    player.play('complete');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('有 AudioContext 時，play 會建立振盪器並排程停止', () => {
    for (const kind of KINDS) {
      const { ctx, oscillators, gains, destination } = makeFakeContext();
      const player = createSoundPlayer(() => asContext(ctx));
      player.play(kind);

      expect(oscillators.length).toBeGreaterThanOrEqual(1);
      expect(gains.length).toBeGreaterThanOrEqual(1);
      for (const osc of oscillators) {
        // 每個振盪器都有開始與排程停止，而且停止在開始之後
        expect(osc.started).toHaveLength(1);
        expect(osc.stopped).toHaveLength(1);
        expect(osc.stopped[0]).toBeGreaterThan(osc.started[0]);
        expect(osc.frequencySet.length).toBeGreaterThanOrEqual(1);
        expect(osc.frequencySet[0][0]).toBeGreaterThan(0);
        // 有接到增益節點
        expect(osc.connectedTo).toHaveLength(1);
      }
      // 增益節點最後接到喇叭
      for (const g of gains) {
        expect(g.connectedTo).toEqual([destination]);
      }
    }
  });

  it('每個音效都很短（< 0.6 秒）而且很小聲（增益 ≤ 0.2）', () => {
    for (const kind of KINDS) {
      const { ctx, oscillators, gains } = makeFakeContext();
      createSoundPlayer(() => asContext(ctx)).play(kind);

      for (const osc of oscillators) {
        expect(osc.started[0]).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(osc.stopped[0] - ctx.currentTime).toBeLessThan(0.6);
      }
      for (const g of gains) {
        expect(g.values.length).toBeGreaterThan(0);
        for (const v of g.values) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(0.2);
        }
      }
    }
  });

  it('答對是上行的兩個音；完成是至少三個音的琶音；答錯比答對低', () => {
    const freqs = (kind: SoundKind) => {
      const { ctx, oscillators } = makeFakeContext();
      createSoundPlayer(() => asContext(ctx)).play(kind);
      return oscillators.map((o) => o.frequencySet[0][0]);
    };
    const correct = freqs('correct');
    expect(correct).toHaveLength(2);
    expect(correct[1]).toBeGreaterThan(correct[0]);

    const complete = freqs('complete');
    expect(complete.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < complete.length; i += 1) {
      expect(complete[i]).toBeGreaterThan(complete[i - 1]);
    }

    const wrong = freqs('wrong');
    expect(Math.max(...wrong)).toBeLessThan(Math.min(...correct));
  });

  it('context 是 suspended 時會呼叫 resume；running 時不會', () => {
    const suspended = makeFakeContext('suspended');
    createSoundPlayer(() => asContext(suspended.ctx)).play('correct');
    expect(suspended.ctx.resume).toHaveBeenCalledTimes(1);
    // 仍然排了聲音
    expect(suspended.oscillators.length).toBeGreaterThan(0);

    const running = makeFakeContext('running');
    createSoundPlayer(() => asContext(running.ctx)).play('correct');
    expect(running.ctx.resume).not.toHaveBeenCalled();
  });

  it('resume 同步拋出或回傳被拒絕的 Promise，都不會讓 play 拋出或產生未處理的拒絕', async () => {
    const throwing = makeFakeContext('suspended');
    throwing.ctx.resume.mockImplementation(() => {
      throw new Error('resume 失敗');
    });
    expect(() => createSoundPlayer(() => asContext(throwing.ctx)).play('wrong')).not.toThrow();

    const rejecting = makeFakeContext('suspended');
    rejecting.ctx.resume.mockImplementation(() => Promise.reject(new Error('resume 被拒絕')));
    expect(() => createSoundPlayer(() => asContext(rejecting.ctx)).play('wrong')).not.toThrow();
    // 讓被拒絕的 Promise 有機會冒泡；若沒被接住，vitest 會把它當成未處理的錯誤
    await Promise.resolve();
    await Promise.resolve();
  });
});
