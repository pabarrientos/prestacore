'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ResponsiveNavbar } from '@/components/ResponsiveNavbar';

export default function MisComisionesLayout({
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14] mx-auto"></div>
      </div>
    );
  }

  if (!user) return null;

  const vendorLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/loans', label: 'Préstamos' },
    { href: '/admin/clients', label: 'Clientes' },
    { href: '/admin/payments', label: 'Pagos' },
    { href: '/admin/installments', label: 'Cuotas' },
    { href: '/admin/collection-actions', label: 'Cobranzas' },
    { href: '/mis-comisiones', label: 'Mis Comisiones' },
    { href: '/profile', label: 'Mi Perfil' },
  ];

  return (
    <>
      <ResponsiveNavbar user={user} navLinks={vendorLinks} pathname={pathname} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </>
  );
}
