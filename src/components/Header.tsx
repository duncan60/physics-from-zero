/** 網站標誌：往上丟出去的球畫出的一道弧線。 */
function LogoIcon(): React.JSX.Element {
  return (
    <svg className="site-logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M6 26 Q14 0 24 24" fill="none" stroke="var(--on-primary)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="2.5 3.2" strokeLinecap="round" />
      <circle cx="20.1" cy="16.4" r="3.6" fill="var(--on-primary)" />
    </svg>
  );
}

function FlameIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12 2.5c.6 3-1.1 4.6-2.6 6.2C7.9 10.3 6.5 12 6.5 14.6A5.5 5.5 0 0 0 12 20.5a5.5 5.5 0 0 0 5.5-5.9c-.2-2.3-1.3-3.6-2.3-4.6-.1 1.4-.7 2.4-1.7 2.9.6-3.6-.3-7.7-1.5-10.4z"
        fill="currentColor"
      />
    </svg>
  );
}

function BoltIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** 喇叭：開著時有聲波，關掉時是一個叉（不只靠顏色區分）。 */
function SpeakerIcon(props: { on: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M3.5 9.5h3.8L12 5.5v13l-4.7-4H3.5z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      {props.on ? (
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** 頁首：網站名稱、連續天數、XP、音效開關。 */
export function Header(props: { xp: number; streak: number; soundOn: boolean; onToggleSound: () => void }): React.JSX.Element {
  const { xp, streak, soundOn, onToggleSound } = props;
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <h1 className="site-title">
          <LogoIcon />
          <span>從零開始學物理</span>
        </h1>
        <div className="site-header-tools">
          <ul className="stats" aria-label="學習紀錄">
            <li className={streak > 0 ? 'stat stat--streak' : 'stat stat--streak stat--zero'}>
              <FlameIcon />
              <span>{`連續 ${streak} 天`}</span>
            </li>
            <li className="stat stat--xp">
              <BoltIcon />
              <span>{`${xp} XP`}</span>
            </li>
          </ul>
          {/* 按下去立刻生效，也會記住。窄螢幕只顯示圖示，文字留給螢幕閱讀器。 */}
          <button type="button" className={soundOn ? 'sound-toggle' : 'sound-toggle sound-toggle--off'} aria-pressed={soundOn} onClick={onToggleSound}>
            <SpeakerIcon on={soundOn} />
            <span className="sound-toggle-text">{soundOn ? '音效：開' : '音效：關'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
