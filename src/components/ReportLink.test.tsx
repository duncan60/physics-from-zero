import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { REPORT_LABEL, REPO_ISSUES_URL } from '../lib/report';
import { ReportLink } from './ReportLink';

afterEach(() => {
  window.location.hash = '';
});

const props = { lessonId: '1-2', lessonTitle: '速度與位置', stepId: 'walk-table', stepKind: 'table' };

it('連結文字是「回報問題」，名稱說清楚會在 GitHub 開新分頁；旁邊有「需要 GitHub 帳號」', () => {
  render(<ReportLink {...props} />);
  const link = screen.getByRole('link', { name: '回報問題（在 GitHub 開新分頁）' });
  expect(link).toHaveTextContent('回報問題');
  const note = screen.getByText('需要 GitHub 帳號');
  expect(link).toHaveAccessibleDescription('需要 GitHub 帳號');
  expect(note).toBeVisible();
});

it('在新分頁打開，而且不把網站交給對方（noopener noreferrer）', () => {
  render(<ReportLink {...props} />);
  const link = screen.getByRole('link', { name: /回報問題/ });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('網址帶這一步的課程、步驟、題型，和目前頁面的網址（含 # 後面）', () => {
  window.location.hash = '#/lesson/1-2';
  render(<ReportLink {...props} />);
  const href = screen.getByRole('link', { name: /回報問題/ }).getAttribute('href') ?? '';
  expect(href.startsWith(`${REPO_ISSUES_URL}?`)).toBe(true);
  const params = new URL(href).searchParams;
  expect(params.get('labels')).toBe(REPORT_LABEL);
  expect(params.get('title')).toBe('[題目回報] 1-2 速度與位置・walk-table');
  const body = params.get('body') ?? '';
  expect(body).toContain('步驟：walk-table');
  expect(body).toContain('題型：table');
  expect(body).toContain(`網址：${window.location.href}`);
  expect(body).toContain('#/lesson/1-2');
});

it('點擊範圍至少 44px 高（高度寫在元素上，和其他按鈕一樣）', () => {
  render(<ReportLink {...props} />);
  const link = screen.getByRole('link', { name: /回報問題/ });
  expect(Number.parseFloat(link.style.minHeight)).toBeGreaterThanOrEqual(44);
});
