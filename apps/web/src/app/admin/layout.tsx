'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ResponsiveNavbar } from '@/components/ResponsiveNavbar';

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
    // Redirect CLIENTE users away from admin routes
    if (!isLoading && user && user.role === 'CLIENTE') {
      router.push('/mis-prestamo');
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

  // Filter nav links based on role
  const baseNavLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/loans', label: 'Préstamos' },
    { href: '/admin/clients', label: 'Clientes' },
    { href: '/admin/payments', label: 'Pagos' },
    { href: '/admin/installments', label: 'Cuotas' },
    { href: '/admin/collection-actions', label: 'Cobranzas' },
    { href: '/admin/settings', label: 'Configuración' },
  ];

  // Users and commissions links - only for ADMIN
  const adminOnlyLinks = user.role === 'ADMIN'
    ? [
        { href: '/admin/users', label: 'Usuarios' },
        { href: '/admin/commissions', label: 'Comisiones' },
      ]
    : [];

  // Mi Perfil - for all authenticated users
  const profileLink = [
    { href: '/profile', label: 'Mi Perfil' },
  ];

  const navLinks = user.role === 'VENDEDOR'
    ? baseNavLinks.filter(link =>
        link.label === 'Dashboard' || link.label === 'Préstamos' || link.label === 'Clientes' || link.label === 'Pagos' || link.label === 'Cuotas' || link.label === 'Cobranzas'
      )
    : baseNavLinks;

  // Vendor-specific links
  const vendorLinks = user.role === 'VENDEDOR'
    ? [{ href: '/mis-comisiones', label: 'Mis Comisiones' }]
    : [];

  // Add profile link to all users (always at the end)
  const allNavLinks = [...navLinks, ...profileLink];

  // Add admin-only links (users, commissions) for ADMIN (before profile)
  // Add vendor-specific links (mis-comisiones) for VENDEDOR (before profile)
  const finalNavLinks = user.role === 'ADMIN' 
    ? [...allNavLinks.slice(0, -1), ...adminOnlyLinks, ...allNavLinks.slice(-1)]
    : user.role === 'VENDEDOR'
    ? [...allNavLinks.slice(0, -1), ...vendorLinks, ...allNavLinks.slice(-1)]
    : allNavLinks;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      <ResponsiveNavbar user={user} navLinks={finalNavLinks} pathname={pathname} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
