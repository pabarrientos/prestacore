'use client';

import { useState, useRef, useEffect } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface NavLink {
  href: string;
  label: string;
  children?: NavLink[];
}

interface User {
  firstName: string;
  lastName: string;
  role: string;
}

interface ResponsiveNavbarProps {
  user: User;
  navLinks: NavLink[];
  pathname: string;
}

function isGroupActive(group: NavLink, pathname: string): boolean {
  if (!group.children) return pathname === group.href;
  return group.children.some(child => pathname === child.href || pathname.startsWith(child.href + '/'));
}

export function ResponsiveNavbar({ user, navLinks, pathname }: ResponsiveNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="bg-white shadow-sm dark:bg-[#1a1a1a] dark:shadow-none dark:border-b dark:border-[#333333]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center h-auto sm:h-16 py-2 sm:py-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {/* Logo */}
              <a href="/" className="logo flex items-center">
                <svg width="140" height="40" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg" className="logo-anim">
                  <circle cx="20" cy="20" r="16" stroke="var(--logo-primary)" strokeWidth="3" fill="none" className="logo-circle"/>

                  <path d="M12 24 L18 18 L22 22 L28 14"
                        stroke="var(--logo-primary)" strokeWidth="3"
                        fill="none" strokeLinecap="round" strokeLinejoin="round"
                        className="logo-path"/>

                  <text x="42" y="26" fontSize="18" fontFamily="Inter, sans-serif" fontWeight="600" className="logo-text">
                    <tspan fill="var(--logo-text)">Presta</tspan>
                    <tspan fill="var(--logo-primary)">Core</tspan>
                  </text>
                </svg>
              </a>

              {/* Separador */}
              <span className="mx-3 text-gray-400 dark:text-white/40 hidden sm:inline">•</span>

              {/* Usuario - hidden on mobile */}
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-white/60 whitespace-nowrap">
                {user.firstName} {user.lastName} ({user.role})
              </span>
            </div>

            {/* Hamburger button - only visible on mobile */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-md text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-[#39ff14]"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* Desktop action buttons */}
          <div className="hidden sm:flex flex-wrap items-center gap-1">
            <a href="/" className="text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-[#39ff14] px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
              Inicio
            </a>
            <ThemeToggle />
            <button
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
              }}
              className="text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-[#39ff14] px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Secondary Nav - desktop */}
        <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 pb-3" ref={navRef}>
          {navLinks.map((link) => {
            if (link.children) {
              const active = isGroupActive(link, pathname);
              const isOpen = openGroup === link.label;
              return (
                <div key={link.label} className="relative">
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : link.label)}
                    className={`text-sm font-medium py-2 min-h-[44px] flex items-center gap-1 ${
                      active
                        ? 'text-primary-600 border-b-2 border-primary-600 dark:text-[#39ff14] dark:border-b-2 dark:border-[#39ff14]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white/87'
                    }`}
                  >
                    {link.label}
                    <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1e1e1e] shadow-lg rounded-lg border dark:border-[#333] py-1 min-w-[180px] z-50">
                      {link.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpenGroup(null)}
                          className={`block px-4 py-2 text-sm ${
                            pathname === child.href || pathname.startsWith(child.href + '/')
                              ? 'text-primary-600 bg-primary-50 dark:text-[#39ff14] dark:bg-[#39ff14]/10'
                              : 'text-gray-600 hover:bg-gray-50 dark:text-white/60 dark:hover:bg-white/5'
                          }`}
                        >
                          {child.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm font-medium py-2 min-h-[44px] flex items-center ${
                  pathname === link.href
                    ? 'text-primary-600 border-b-2 border-primary-600 dark:text-[#39ff14] dark:border-b-2 dark:border-[#39ff14]'
                    : 'text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white/87'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="sm:hidden pb-3">
            {/* Mobile action buttons */}
            <div className="flex flex-wrap items-center gap-1 mb-3">
              <a href="/" className="text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-[#39ff14] px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                Inicio
              </a>
              <ThemeToggle />
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.location.href = '/';
                }}
                className="text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-[#39ff14] px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                Cerrar sesión
              </button>
            </div>

            {/* Mobile nav links */}
            <div className="flex flex-col gap-y-1">
              {navLinks.map((link) => {
                if (link.children) {
                  const active = isGroupActive(link, pathname);
                  const isOpen = openGroup === link.label;
                  return (
                    <div key={link.label}>
                      <button
                        onClick={() => setOpenGroup(isOpen ? null : link.label)}
                        className={`w-full text-left text-sm font-medium py-2 min-h-[44px] flex items-center justify-between px-2 rounded-md ${
                          active
                            ? 'text-primary-600 bg-primary-50 dark:text-[#39ff14] dark:bg-[#39ff14]/10'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-white/60 dark:hover:text-white/87 dark:hover:bg-white/5'
                        }`}
                      >
                        {link.label}
                        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="ml-4 border-l-2 dark:border-[#333] pl-3 mt-1 space-y-1">
                          {link.children.map((child) => (
                            <a
                              key={child.href}
                              href={child.href}
                              onClick={() => { setOpenGroup(null); setMobileOpen(false); }}
                              className={`block text-sm font-medium py-2 min-h-[44px] flex items-center px-2 rounded-md ${
                                pathname === child.href || pathname.startsWith(child.href + '/')
                                  ? 'text-primary-600 bg-primary-50 dark:text-[#39ff14] dark:bg-[#39ff14]/10'
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-white/60 dark:hover:text-white/87 dark:hover:bg-white/5'
                              }`}
                            >
                              {child.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`text-sm font-medium py-2 min-h-[44px] flex items-center px-2 rounded-md ${
                      pathname === link.href
                        ? 'text-primary-600 bg-primary-50 dark:text-[#39ff14] dark:bg-[#39ff14]/10'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-white/60 dark:hover:text-white/87 dark:hover:bg-white/5'
                    }`}
                  >
                    {link.label}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
