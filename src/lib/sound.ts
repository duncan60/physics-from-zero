export type SoundKind = 'correct' | 'wrong' | 'complete';

/** 一個音：起始偏移（秒）、頻率（Hz）、長度（秒）、波形、音量（增益峰值）。 */
interface Tone {
  at: number;
  freq: number;
  dur: number;
  wave: OscillatorType;
  peak: number;
}

// 每個音效都很短（< 0.6 秒）、很小聲（增益 ≤ 0.2）。
const TONES: Record<SoundKind, Tone[]> = {
  // 上行的兩個音（C5 → G5）
  correct: [
    { at: 0, freq: 523.25, dur: 0.1, wave: 'sine', peak: 0.16 },
    { at: 0.09, freq: 783.99, dur: 0.18, wave: 'sine', peak: 0.16 },
  ],
  // 柔和的低音（G3），不刺耳
  wrong: [{ at: 0, freq: 196, dur: 0.22, wave: 'triangle', peak: 0.12 }],
  // 短短的琶音（C5 E5 G5 C6）
  complete: [
    { at: 0, freq: 523.25, dur: 0.16, wave: 'sine', peak: 0.15 },
    { at: 0.1, freq: 659.25, dur: 0.16, wave: 'sine', peak: 0.15 },
    { at: 0.2, freq: 783.99, dur: 0.16, wave: 'sine', peak: 0.15 },
    { at: 0.3, freq: 1046.5, dur: 0.22, wave: 'sine', peak: 0.15 },
  ],
};

/** 淡入的時間（秒），避免起音的爆音。 */
const ATTACK = 0.01;

// 舊版 Safari 只有 webkitAudioContext；其他環境（例如測試用的 jsdom）可能兩者都沒有。
interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/** 預設的 factory：瀏覽器有 Web Audio 就建立 AudioContext，否則回傳 null。 */
function defaultFactory(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function playTone(ctx: AudioContext, tone: Tone): void {
  const start = ctx.currentTime + tone.at;
  const end = start + tone.dur;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tone.wave;
  osc.frequency.setValueAtTime(tone.freq, start);
  // 淡入再淡出，音量永遠不超過 peak
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(tone.peak, start + ATTACK);
  gain.gain.linearRampToValueAtTime(0, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(end);
}

/**
 * 建立音效播放器。AudioContext 延遲到第一次 play 才建立（瀏覽器的自動播放規則：
 * play 只會在使用者點擊之後被呼叫）。不支援 Web Audio、建立失敗、播放途中出錯，
 * 一律安靜失敗，不會拋出例外。
 */
export function createSoundPlayer(
  factory: () => AudioContext | null = defaultFactory,
): { play(kind: SoundKind): void } {
  let ctx: AudioContext | null = null;
  let unavailable = false;

  function getContext(): AudioContext | null {
    if (ctx) return ctx;
    if (unavailable) return null;
    try {
      ctx = factory();
    } catch {
      ctx = null;
    }
    // 建立不出來就不再重試
    if (!ctx) unavailable = true;
    return ctx;
  }

  return {
    play(kind: SoundKind): void {
      try {
        const context = getContext();
        if (!context) return;
        if (context.state === 'suspended') {
          try {
            // resume() 回傳 Promise；被拒絕也要接住
            void Promise.resolve(context.resume()).catch(() => {});
          } catch {
            // 忽略：聲音只是加分的回饋
          }
        }
        for (const tone of TONES[kind]) playTone(context, tone);
      } catch {
        // 任何例外都吞掉
      }
    },
  };
}
