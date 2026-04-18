'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface UserData {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProfilePage() {
  const { token } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  // Password change state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Fetch user data
  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUserData(data.data);
          setEmail(data.data.email);
          setFirstName(data.data.firstName);
          setLastName(data.data.lastName);
          setPhone(data.data.phone || '');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !userData) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setUserData(data.data);
        setEmail(data.data.email);
        setIsEditing(false);
        // Update localStorage
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem(
          'user',
          JSON.stringify({ ...storedUser, firstName, lastName })
        );
      } else {
        setError(data.error || 'Error al guardar');
      }
    } catch (err) {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !userData) return;

    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    // Verify current password first using the /me endpoint
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setIsChangingPassword(false);
          setPasswordSuccess(false);
        }, 2000);
      } else {
        setPasswordError(data.error || 'Error al cambiar contraseña');
      }
    } catch (err) {
      setPasswordError('Error al cambiar contraseña');
    }
  };

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrador',
    VENDEDOR: 'Vendedor',
    CLIENTE: 'Cliente',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <p className="text-gray-500 dark:text-white/60">Error al cargar perfil</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Mi Perfil</h1>

      {/* User Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-white/[.87]">Información Personal</h2>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-primary-600 hover:text-primary-900 dark:text-[#39ff14] dark:hover:text-[#32e012]"
            >
              Editar
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {/* Email - editable in edit mode */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
              Email
            </label>
            {isEditing ? (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            ) : (
              <p className="dark:text-white/[.87]">{userData.email}</p>
            )}
          </div>

          {/* Role - readonly */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
              Rol
            </label>
            <p className="dark:text-white/[.87]">{roleLabels[userData.role] || userData.role}</p>
          </div>

          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
              Nombre
            </label>
            {isEditing ? (
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            ) : (
              <p className="dark:text-white/[.87]">{userData.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
              Apellido
            </label>
            {isEditing ? (
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            ) : (
              <p className="dark:text-white/[.87]">{userData.lastName}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
              Teléfono
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            ) : (
              <p className="dark:text-white/[.87]">{userData.phone || '-'}</p>
            )}
          </div>

          {/* Edit Actions */}
          {isEditing && (
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEmail(userData.email);
                  setFirstName(userData.firstName);
                  setLastName(userData.lastName);
                  setPhone(userData.phone || '');
                  setError('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white/87"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] disabled:opacity-50 min-h-[44px]"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Password Change Card */}
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-white/[.87]">Cambiar Contraseña</h2>
          {!isChangingPassword && !passwordSuccess && (
            <button
              onClick={() => setIsChangingPassword(true)}
              className="text-primary-600 hover:text-primary-900 dark:text-[#39ff14] dark:hover:text-[#32e012]"
            >
              Cambiar
            </button>
          )}
        </div>

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg dark:bg-green-900/20 dark:text-green-400">
            Contraseña actualizada correctamente
          </div>
        )}

        {passwordError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {passwordError}
          </div>
        )}

        {isChangingPassword ? (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
                Contraseña Actual
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
                Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                Mínimo 8 caracteres
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsChangingPassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white/87"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] min-h-[44px]"
              >
                Cambiar Contraseña
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500 dark:text-white/60">
            {!passwordSuccess && 'Cliquez en "Cambiar" para modificar su contraseña'}
          </p>
        )}
      </div>
    </div>
  );
}