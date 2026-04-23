'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Stats {
  activeLoans: number;
  totalDisbursed: number;
  collectionRate: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function HomePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    // Fetch public stats if available
    fetch(`${API_URL}/api/dashboard`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats({
            activeLoans: data.data.activeLoans || 0,
            totalDisbursed: data.data.totalDisbursed || 0,
            collectionRate: data.data.collectionRate || 0,
          });
        }
      })
      .catch(() => {
        // Silently fail - stats are optional
      });
  }, []);

  return (
    <main className="min-h-screen">
      {/* Header with Theme Toggle */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border-b dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary-600 dark:text-[#39ff14]">
            Préstamos
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-600 to-primary-800 dark:from-[#1a1a1a] dark:to-[#121212] py-20 md:py-32 pt-24">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTM2IDM2djZoLTN2LTJoNnptMjItMjJ2MmgtMnYtNGgydjJ6bS0yOCAyOHYyaC0ydi0yaDJ2MnptMjItMjJ2MmgtMnYtNGgydjJ6bS0yOCAyOHYyaC0ydi0yaDJ2MnptMjItMjJ2MmgtMnYtNGgydjJ6IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==')] bg-repeat"></div>
        </div>
        
        <div className="relative max-w-6xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            {/* Left content */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                Sistema de <span className="text-[#39ff14]">Préstamos</span>
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl">
                Gestión integral de préstamos personales con múltiples sistemas de amortización. 
                Calcula, solicita y administra tus préstamos de manera fácil y rápida.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Link
                  href="/simulator"
                  className="px-8 py-4 bg-[#39ff14] text-black font-semibold rounded-lg hover:bg-[#32e012] hover:shadow-[0_0_20px_rgba(57,255,20,0.5)] transition transform hover:scale-105"
                >
                  🚀 Probar Simulador
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-4 bg-white/10 text-white border border-white/30 font-semibold rounded-lg hover:bg-white/20 transition"
                >
                  🔑 Iniciar Sesión
                </Link>
              </div>
            </div>

            {/* Right - Quick stats card */}
            <div className="w-full md:w-auto">
              <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 md:p-8">
                <h3 className="text-lg font-semibold text-gray-500 dark:text-white/60 mb-4">
                  Estadísticas del Sistema
                </h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl md:text-3xl font-bold text-primary-600 dark:text-[#39ff14]">
                      {stats?.activeLoans || '0'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/60">Préstamos Activos</p>
                  </div>
                  <div>
                    <p className="text-2xl md:text-3xl font-bold text-primary-600 dark:text-[#39ff14]">
                      ${(stats?.totalDisbursed || 0).toLocaleString().slice(0,4)}K
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/60">Desembolsado</p>
                  </div>
                  <div>
                    <p className="text-2xl md:text-3xl font-bold text-primary-600 dark:text-[#39ff14]">
                      {stats?.collectionRate || '0'}%
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/60">Cobranza</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <Link
                    href={user ? '/admin' : '/login'}
                    className="block text-center text-sm text-primary-600 dark:text-[#39ff14] hover:underline"
                  >
                    {user ? 'Ir al Panel Admin →' : 'Acceder como administrador →'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-gray-50 dark:bg-[#121212]">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-4">
              ¿Por qué elegirnostros?
            </h2>
            <p className="text-gray-600 dark:text-white/60 max-w-2xl mx-auto">
              Un sistema completo y moderno para gestionar tus préstamos con las mejores herramientas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 shadow-lg hover:shadow-xl transition dark:border dark:border-[#333333]">
              <div className="text-4xl mb-4">🧮</div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Simulador Interactivo</h3>
              <p className="text-gray-600 dark:text-white/60 text-sm">
                Calcula tu préstamo en tiempo real con los 3 sistemas disponibles: Francés, Alemán y Tasa Plana.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 shadow-lg hover:shadow-xl transition dark:border dark:border-[#333333]">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Múltiples Sistemas</h3>
              <p className="text-gray-600 dark:text-white/60 text-sm">
                Elige el sistema de amortización que mejor se adapte a tus necesidades financieras.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 shadow-lg hover:shadow-xl transition dark:border dark:border-[#333333]">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Dashboard en Tiempo Real</h3>
              <p className="text-gray-600 dark:text-white/60 text-sm">
                Métricas actualizadas: total prestado, cobranza, mora y más.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 shadow-lg hover:shadow-xl transition dark:border dark:border-[#333333]">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Gestión Segura</h3>
              <p className="text-gray-600 dark:text-white/60 text-sm">
                Control de acceso por roles: Administrador, Vendedor y Cliente.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24 bg-white dark:bg-[#1a1a1a]">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-4">
              ¿Cómo funciona?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-[#39ff14]/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-600 dark:text-[#39ff14]">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Simulá</h3>
              <p className="text-gray-600 dark:text-white/60">
                Usá nuestro simulador para calcular tu préstamo con diferentes opciones.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-[#39ff14]/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-600 dark:text-[#39ff14]">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Solicitá</h3>
              <p className="text-gray-600 dark:text-white/60">
                Envía tu solicitud y un vendedor evaluará tu caso.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-[#39ff14]/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-600 dark:text-[#39ff14]">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Recibí</h3>
              <p className="text-gray-600 dark:text-white/60">
                Una vez aprobado, recibí el dinero en tu cuenta.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-r from-primary-600 to-primary-800 dark:from-[#1a1a1a] dark:to-[#121212]">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Listo para empezar?
          </h2>
          <p className="text-white/80 mb-8 text-lg">
            Calculá tu préstamo ahora y descubrí la mejor opción para vos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/simulator"
              className="px-8 py-4 bg-[#39ff14] text-black font-semibold rounded-lg hover:bg-[#32e012] hover:shadow-[0_0_20px_rgba(57,255,20,0.5)] transition transform hover:scale-105"
            >
              🚀 Calculá tu Préstamo
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-white/10 text-white border border-white/30 font-semibold rounded-lg hover:bg-white/20 transition"
            >
              🔑 Iniciar Sesión
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-gray-100 dark:bg-[#121212] border-t dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 md:px-8 text-center text-gray-500 dark:text-white/40">
          <p>© 2026 Sistema de Préstamos. Todos los derechos reservados.</p>
        </div>
      </footer>
    </main>
  );
}