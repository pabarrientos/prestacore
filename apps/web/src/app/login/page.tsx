'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, user: authUser } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (authUser) {
      if (authUser.role === 'CLIENTE') {
        router.push('/mis-prestamo');
      } else {
        router.push('/admin');
      }
    }
  }, [authUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      
      // Check if there's a pending loan request
      const hasPendingRequest = typeof window !== 'undefined' && window.sessionStorage?.getItem('pending_loan_request');
      
      // Role-based redirect after successful login
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        if (userData.role === 'CLIENTE' && hasPendingRequest) {
          router.push('/solicitar');
        } else if (userData.role === 'CLIENTE') {
          router.push('/mis-prestamo');
        } else {
          router.push('/admin');
        }
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-gray-50 dark:bg-[#121212]">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <svg width="180" height="50" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg">              
              <circle cx="20" cy="20" r="16" stroke="var(--logo-primary)" strokeWidth="3" fill="none"/>
              
              <path d="M12 24 L18 18 L22 22 L28 14" 
                    stroke="var(--logo-primary)" strokeWidth="3" 
                    fill="none" strokeLinecap="round" strokeLinejoin="round"/>

              <text x="42" y="26" fontSize="18" fontFamily="Inter, sans-serif" fontWeight="600">
                <tspan fill="var(--logo-text)">Presta</tspan>
                <tspan fill="var(--logo-primary)">Core</tspan>
              </text>
            </svg>
          </div>
          <h1 className="text-3xl font-bold mt-2 text-primary-700 dark:text-[#39ff14]">Iniciar Sesión</h1>
          <p className="text-gray-600 mt-2 dark:text-white/60">Accede a tu cuenta</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] dark:focus:border-[#39ff14]"
              placeholder="tu@email.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] dark:focus:border-[#39ff14]"
              placeholder="••••••••"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 border-2 border-white dark:border-black border-t-transparent rounded-full" />
                Iniciando sesión...
              </span>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <a href="/register" className="text-primary-600 hover:underline dark:text-[#39ff14] dark:hover:text-[#39ff14]">
            ¿No tienes cuenta? Regístrate
          </a>
        </div>
      </div>
    </main>
  );
}
