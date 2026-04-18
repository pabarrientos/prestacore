'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  isActive: boolean;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  user?: User | null;
  mode: 'create' | 'edit' | 'role' | 'password';
}

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  dni?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  occupation?: string;
  employer?: string;
  monthlyIncome?: number;
}

interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
}

interface ChangeRoleInput {
  role: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
}

interface ChangePasswordInput {
  newPassword: string;
}

const roleOptions = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'CLIENTE', label: 'Cliente' },
];

export function UserModal({ isOpen, onClose, onSubmit, user, mode }: UserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'VENDEDOR' | 'CLIENTE'>('VENDEDOR');
  const [newPassword, setNewPassword] = useState('');
  
  // Client-specific fields
  const [dni, setDni] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [occupation, setOccupation] = useState('');
  const [employer, setEmployer] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');

  useEffect(() => {
    if (user && mode === 'edit') {
      setEmail(user.email);
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setPhone(user.phone || '');
      setRole(user.role as 'ADMIN' | 'VENDEDOR');
    } else if (user && mode === 'role') {
      setRole(user.role === 'ADMIN' ? 'ADMIN' : user.role === 'VENDEDOR' ? 'VENDEDOR' : 'VENDEDOR');
    } else {
      // Reset for create mode
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setRole('VENDEDOR');
      setNewPassword('');
      setDni('');
      setDateOfBirth('');
      setAddress('');
      setCity('');
      setOccupation('');
      setEmployer('');
      setMonthlyIncome('');
    }
    setError('');
  }, [user, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'create') {
        const data: CreateUserInput = {
          email,
          password,
          firstName,
          lastName,
          phone: phone || undefined,
          role: role as 'ADMIN' | 'VENDEDOR' | 'CLIENTE',
          ...(role === 'CLIENTE' && {
            dni: dni || undefined,
            dateOfBirth: dateOfBirth || undefined,
            address: address || undefined,
            city: city || undefined,
            occupation: occupation || undefined,
            employer: employer || undefined,
            monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : undefined,
          }),
        };
        await onSubmit(data);
      } else if (mode === 'edit') {
        const data: UpdateUserInput = {
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone || undefined,
        };
        await onSubmit(data);
      } else if (mode === 'role') {
        const data: ChangeRoleInput = { role };
        await onSubmit(data as CreateUserInput);
      } else if (mode === 'password') {
        const data: ChangePasswordInput = { newPassword };
        await onSubmit(data as unknown as CreateUserInput);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getTitle = () => {
    switch (mode) {
      case 'create':
        return 'Crear Usuario';
      case 'edit':
        return 'Editar Usuario';
      case 'role':
        return 'Cambiar Rol';
      case 'password':
        return 'Cambiar Contraseña';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md dark:bg-[#1e1e1e] my-8">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white/[.87]">{getTitle()}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white/87"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Email - only for create */}
          {mode === 'create' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>
          )}

          {/* Password - only for create or password mode */}
          {(mode === 'create' || mode === 'password') && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                {mode === 'password' ? 'Nueva Contraseña *' : 'Contraseña *'}
              </label>
              <input
                type="password"
                value={mode === 'password' ? newPassword : password}
                onChange={(e) => mode === 'password' ? setNewPassword(e.target.value) : setPassword(e.target.value)}
                required
                minLength={8}
                placeholder={mode === 'password' ? 'Mínimo 8 caracteres' : 'Mínimo 8 caracteres'}
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                Mínimo 8 caracteres
              </p>
            </div>
          )}

          {/* Name fields - for create and edit */}
          {(mode === 'create' || mode === 'edit') && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                  Apellido *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
              </div>
            </>
          )}

          {/* Role - for create or role mode */}
          {(mode === 'create' || mode === 'role') && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                  Rol *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VENDEDOR' | 'CLIENTE')}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Client-specific fields */}
              {mode === 'create' && role === 'CLIENTE' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      DNI *
                    </label>
                    <input
                      type="text"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Fecha de nacimiento *
                    </label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Ocupación
                    </label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Employer
                    </label>
                    <input
                      type="text"
                      value={employer}
                      onChange={(e) => setEmployer(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                      Ingreso mensual
                    </label>
                    <input
                      type="number"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* User Info Display - for edit mode */}
          {mode === 'edit' && user && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
              </div>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg dark:bg-[#2a2a2a]">
                <p className="text-sm text-gray-600 dark:text-white/60">
                  <span className="font-medium">Rol:</span>{' '}
                  {roleLabels[user.role]}
                </p>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white/87"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </>
  );
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
  CLIENTE: 'Cliente',
};