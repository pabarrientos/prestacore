'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { register } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        role: 'CLIENTE',
      });

      // Check if there's a pending loan request
      const hasPendingRequest = typeof window !== 'undefined' && window.sessionStorage?.getItem('pending_loan_request');
      if (hasPendingRequest) {
        router.push('/solicitar');
      } else {
        router.push('/mis-prestamo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-gray-50 dark:bg-[#121212]">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700 dark:text-[#39ff14]">Crear Cuenta</h1>
          <p className="text-gray-600 mt-2 dark:text-white/60">Regístrate para solicitar préstamos</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Nombre
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                required
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Apellido
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                required
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              required
            />
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Teléfono (opcional)
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              required
              minLength={6}
            />
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
          >
            {isLoading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <a href="/login" className="text-primary-600 hover:underline dark:text-[#39ff14] dark:hover:text-[#39ff14]">
            ¿Ya tienes cuenta? Inicia sesión
          </a>
        </div>
      </div>
    </main>
  );
}
