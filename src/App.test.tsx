import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import App from './App';

it('顯示網站名稱', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument();
});

it('每個測試結束後會清除 DOM，標題只會出現一次', () => {
  render(<App />);
  expect(screen.getAllByRole('heading', { name: '從零開始學物理' })).toHaveLength(1);
});
