'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ResponsiveNavbar } from '@/components/ResponsiveNavbar';

export default function ProfileLayout({
  children,
}: {
  children: ReactNode;
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

  // Determine base links based on role - keep same navigation as their main area
  const isAdmin = user.role === 'ADMIN';
  const isVendor = user.role === 'VENDEDOR';

  // For ADMIN and VENDEDOR: keep the same nav as admin layout
  // For CLIENTE: keep the same nav as mis-prestamo layout
  const navLinks = isAdmin
    ? [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/loans', label: 'Préstamos' },
        { href: '/admin/clients', label: 'Clientes' },
        { href: '/admin/payments', label: 'Pagos' },
        { href: '/admin/installments', label: 'Cuotas' },
        { href: '/admin/collection-actions', label: 'Cobranzas' },
        { href: '/admin/settings', label: 'Configuración' },
        { href: '/admin/users', label: 'Usuarios' },
        { href: '/admin/commissions', label: 'Comisiones' },
        { href: '/admin/settings/backups', label: 'Respaldos' },
        { href: '/profile', label: 'Mi Perfil' },
      ]
    : isVendor
    ? [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/loans', label: 'Préstamos' },
        { href: '/admin/clients', label: 'Clientes' },
        { href: '/admin/payments', label: 'Pagos' },
        { href: '/admin/installments', label: 'Cuotas' },
        { href: '/admin/collection-actions', label: 'Cobranzas' },
        { href: '/mis-comisiones', label: 'Mis Comisiones' },
        { href: '/profile', label: 'Mi Perfil' },
      ]
    : [
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
