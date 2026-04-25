'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ResponsiveNavbar } from '@/components/ResponsiveNavbar';

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      <ResponsiveNavbar user={user} navLinks={navLinks} pathname={pathname} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
