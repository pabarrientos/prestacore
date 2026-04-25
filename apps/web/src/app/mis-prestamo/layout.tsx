'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function MisPrestamosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
    // Only allow CLIENTE users
    if (!isLoading && user && user.role !== 'CLIENTE') {
      router.push('/admin');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#121212]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14] mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-white/60">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // CLIENTE nav links
  const navLinks = [
    { href: '/mis-prestamo', label: 'Mis Préstamos' },
    { href: '/profile', label: 'Mi Perfil' },
  ];

  // Only show header for CLIENTE - simple navbar with logout
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      <header className="bg-white shadow-sm dark:bg-[#1a1a1a] dark:shadow-none dark:border-b dark:border-[#333333]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center h-auto sm:h-16 py-2 sm:py-0">
            <div className="flex items-center">
              {/* Logo */}
              <svg width="140" height="40" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg">              
                <circle cx="20" cy="20" r="16" stroke="var(--logo-primary)" strokeWidth="3" fill="none"/>
                
                <path d="M12 24 L18 18 L22 22 L28 14" 
                      stroke="var(--logo-primary)" strokeWidth="3" 
                      fill="none" strokeLinecap="round" strokeLinejoin="round"/>

                <text x="42" y="26" fontSize="18" fontFamily="Inter, sans-serif" fontWeight="600">
                  <tspan fill="var(--logo-text)">Presta</tspan>
                  <tspan fill="var(--logo-primary)">Core</tspan>
                </text>
              </svg>

              {/* Separador */}
              <span className="mx-3 text-gray-400 dark:text-white/40">•</span>

              {/* Usuario */}
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-white/60 whitespace-nowrap">
                {user.firstName} {user.lastName}
              </span>
            </div>
            <div className="flex items-center gap-1">
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
          {/* Secondary Nav */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
            {navLinks.map((link) => (
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
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
