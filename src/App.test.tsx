import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import App from './App';

it('顯示網站名稱', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument();
});
