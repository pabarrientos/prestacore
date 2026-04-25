import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { ThemeFavicon } from '@/components/ThemeFavicon';

export const metadata: Metadata = {
  title: 'PrestaCore - Gestión de Préstamos Personales',
  description: 'Sistema de gestión de préstamos personales',
  icons: {
    icon: [
      { url: '/icon-light.svg', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark.svg', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>
        <ThemeFavicon />
        {children}
      </Providers>
      </body>
    </html>
  );
}
