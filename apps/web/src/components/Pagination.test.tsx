import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('should render nothing when totalPages is 0 or less', () => {
    const { container } = render(<Pagination page={1} totalPages={0} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render nothing when totalPages is 1', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should show page indicator "Página X de Y"', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('Página 2 de 5')).toBeInTheDocument();
  });

  it('should enable Previous button when page > 1', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} />);
    const prevBtn = screen.getByRole('button', { name: /anterior/i });
    expect(prevBtn.hasAttribute('disabled')).toBe(false);
  });

  it('should disable Previous button when on page 1', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    const prevBtn = screen.getByRole('button', { name: /anterior/i });
    expect(prevBtn.hasAttribute('disabled')).toBe(true);
  });

  it('should disable Next button when on last page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
    const nextBtn = screen.getByRole('button', { name: /siguiente/i });
    expect(nextBtn.hasAttribute('disabled')).toBe(true);
  });

  it('should enable Next button when not on last page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    const nextBtn = screen.getByRole('button', { name: /siguiente/i });
    expect(nextBtn.hasAttribute('disabled')).toBe(false);
  });

  it('should call onPageChange with page-1 when Previous is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('should call onPageChange with page+1 when Next is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('should not call onPageChange when clicking disabled Previous', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});