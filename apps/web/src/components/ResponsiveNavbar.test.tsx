import '@testing-library/jest-dom';
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResponsiveNavbar } from './ResponsiveNavbar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

// Mock ThemeToggle
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

describe('ResponsiveNavbar', () => {
  const mockUser = {
    firstName: 'John',
    lastName: 'Doe',
    role: 'ADMIN',
  };

  const mockNavLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/loans', label: 'Préstamos' },
  ];

  const mockPathname = '/admin';

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the logo', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    // Logo should be present
    const logo = document.querySelector('svg');
    expect(logo).toBeInTheDocument();
  });

  it('renders user name on desktop', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Préstamos')).toBeInTheDocument();
  });

  it('shows active state for current page', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname="/admin"
      />
    );
    
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('text-primary-600');
  });

  it('renders action buttons on desktop', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });

  it('shows hamburger button on mobile', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    // Hamburger should be visible (sm:hidden)
    const hamburgerButton = document.querySelector('button[aria-label="Abrir menú"]');
    expect(hamburgerButton).toBeInTheDocument();
  });

  it('toggles mobile menu when hamburger is clicked', async () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    const hamburgerButton = screen.getByRole('button', { name: /Abrir menú/i });
    
    // Initially mobile menu is closed, so close button should not be visible
    expect(screen.queryByRole('button', { name: /Cerrar menú/i })).not.toBeInTheDocument();
    
    // Click to open
    await act(async () => {
      fireEvent.click(hamburgerButton);
    });
    
    // Now close button should be visible
    expect(screen.getByRole('button', { name: /Cerrar menú/i })).toBeInTheDocument();
    
    // Mobile nav links should be visible (Dashboard appears in both desktop and mobile)
    const dashboardLinks = screen.getAllByText('Dashboard');
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
  });
});
