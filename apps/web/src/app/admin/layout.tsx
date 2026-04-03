'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AdminLayout({
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

  const navLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/loans', label: 'Préstamos' },
    { href: '/admin/clients', label: 'Clientes' },
    { href: '/admin/settings', label: 'Configuración' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      <nav className="bg-white shadow-sm dark:bg-[#1a1a1a] dark:shadow-none dark:border-b dark:border-[#333333]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center h-auto sm:h-16 py-2 sm:py-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-primary-700 dark:text-[#39ff14]">Préstamos Admin</h1>
              <span className="text-sm text-gray-500 dark:text-white/60">|</span>
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-white/60">
                {user.firstName} {user.lastName} ({user.role})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
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
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
