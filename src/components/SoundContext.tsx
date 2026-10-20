import { createContext, useCallback, useContext, useMemo } from 'react';
import { createSoundPlayer } from '../lib/sound';
import type { SoundKind } from '../lib/sound';

interface SoundPlayer {
  play(kind: SoundKind): void;
}

// 整個網站只用這一個播放器：每個播放器各自擁有一個 AudioContext，瀏覽器限制能同時開幾個。
// 建立播放器時還不會建立 AudioContext（第一次 play 才會），所以放在模組層級不會違反自動播放規則。
const sharedPlayer = createSoundPlayer();

const silent: SoundPlayer = { play: () => {} };

// 沒有 SoundProvider 時一律安靜（例如單獨測試某個元件）。
const SoundContext = createContext<{ enabled: boolean; player: SoundPlayer }>({ enabled: false, player: silent });

/**
 * 提供音效給底下的元件。`enabled` 是頁首的音效開關；`player` 只有測試會傳（換成假的播放器），
 * 平常用整個網站共用的那一個。
 */
export function SoundProvider(props: { enabled: boolean; children: React.ReactNode; player?: SoundPlayer }): React.JSX.Element {
  const { enabled, children, player = sharedPlayer } = props;
  const value = useMemo(() => ({ enabled, player }), [enabled, player]);
  return <SoundContext value={value}>{children}</SoundContext>;
}

/**
 * 回傳播放音效的函式；音效關閉時什麼都不做。
 * 只在使用者點擊（或按鍵）的處理函式裡呼叫，瀏覽器才會讓網頁發出聲音。
 */
export function useSound(): (kind: SoundKind) => void {
  const { enabled, player } = useContext(SoundContext);
  return useCallback(
    (kind: SoundKind) => {
      if (enabled) player.play(kind);
    },
    [enabled, player],
  );
}
