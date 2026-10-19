const REPO_URL = 'https://github.com/duncan60/physics-from-zero';

/** 頁尾：署名、授權說明、GitHub repo 連結。 */
export function Footer(): React.JSX.Element {
  return (
    <footer className="site-footer">
      <div className="container">
        <p className="site-footer-credit">由 duncan60 與 Claude 一起製作，課程來自真實的學習過程</p>
        <p>
          程式碼採用 MIT 授權，課程內容採用{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> 授權。
        </p>
        <p>
          <a href={REPO_URL}>GitHub 原始碼</a>
        </p>
      </div>
    </footer>
  );
}
