'use client';

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('toggles mobile menu when hamburger is clicked', () => {
    render(
      <ResponsiveNavbar
        user={mockUser}
        navLinks={mockNavLinks}
        pathname={mockPathname}
      />
    );
    
    const hamburgerButton = document.querySelector('button[aria-label="Abrir menú"]');
    
    // Initially mobile menu is closed, so close button should not be visible
    expect(document.querySelector('button[aria-label="Cerrar menú"]')).not.toBeInTheDocument();
    
    // Click to open
    (hamburgerButton as HTMLButtonElement)?.click();
    
    // Now close button should be visible
    expect(document.querySelector('button[aria-label="Cerrar menú"]')).toBeInTheDocument();
    
    // Mobile nav links should be visible
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
