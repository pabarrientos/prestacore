'use client';

import { useState } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  isActive: boolean;
  createdAt: string;
}

interface UserTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onChangeRole: (user: User) => void;
  onChangePassword: (user: User) => void;
  onToggleActive: (user: User) => void;
  onDelete: (user: User) => void;
  loading: boolean;
  currentUserId: string;
}

export function UserTable({
  users,
  onEdit,
  onChangeRole,
  onChangePassword,
  onToggleActive,
  onDelete,
  loading,
  currentUserId,
}: UserTableProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleToggleActive = async (user: User) => {
    setActionLoading(user.id);
    try {
      await onToggleActive(user);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`¿Está seguro de que desea ${user.isActive ? 'desactivar' : 'eliminar'} este usuario?`)) {
      return;
    }
    setActionLoading(user.id);
    try {
      await onDelete(user);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
        <p className="p-8 text-center text-gray-500 dark:text-white/60">No hay usuarios</p>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrador',
    VENDEDOR: 'Vendedor',
    CLIENTE: 'Cliente',
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
            {users.map((user) => (
              <tr key={user.id} className="dark:hover:bg-white/10">
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {user.firstName} {user.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : user.role === 'VENDEDOR'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    }`}
                  >
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}
                  >
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-2">
                    {/* Edit Button */}
                    <button
                      onClick={() => onEdit(user)}
                      className="text-primary-600 hover:text-primary-900 text-sm dark:text-[#39ff14] dark:hover:text-[#32e012]"
                    >
                      Editar
                    </button>

                    {/* Change Role Dropdown - only if not current user */}
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => onChangeRole(user)}
                        disabled={actionLoading === user.id}
                        className="text-blue-600 hover:text-blue-900 text-sm dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                      >
                        Cambiar Rol
                      </button>
                    )}

                    {/* Change Password */}
                    <button
                      onClick={() => onChangePassword(user)}
                      className="text-orange-600 hover:text-orange-900 text-sm dark:text-orange-400 dark:hover:text-orange-300"
                    >
                      Password
                    </button>

                    {/* Toggle Active - only if not current user */}
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={actionLoading === user.id}
                        className={`text-sm ${
                          user.isActive
                            ? 'text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300'
                            : 'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === user.id
                          ? '...'
                          : user.isActive
                          ? 'Desactivar'
                          : 'Activar'}
                      </button>
                    )}

                    {/* Delete - only if not current user and is active */}
                    {user.id !== currentUserId && user.isActive && (
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={actionLoading === user.id}
                        className="text-red-600 hover:text-red-900 text-sm dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                      >
                        {actionLoading === user.id ? '...' : 'Eliminar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}