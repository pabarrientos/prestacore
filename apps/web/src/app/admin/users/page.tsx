'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { UserTable } from './components/UserTable';
import { UserModal } from './components/UserModal';

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

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'ADMIN' | 'VENDEDOR';
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'role' | 'password'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!token) return;

    const params = new URLSearchParams();
    if (roleFilter) params.append('role', roleFilter);
    if (activeFilter) params.append('isActive', activeFilter);
    if (searchFilter) params.append('search', searchFilter);

    try {
      const res = await fetch(`${API_URL}/api/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [token, roleFilter, activeFilter, searchFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handlers
  const handleCreate = () => {
    setModalMode('create');
    setSelectedUser(null);
    setModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setModalMode('edit');
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleChangeRole = (user: User) => {
    setModalMode('role');
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleChangePassword = (user: User) => {
    setModalMode('password');
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleToggleActive = async (user: User) => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(users.map((u) => (u.id === user.id ? { ...u, isActive: !user.isActive } : u)));
      } else {
        alert(data.error || 'Error al cambiar estado');
      }
    } catch (err) {
      alert('Error al cambiar estado');
    }
  };

  const handleDelete = async (user: User) => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(users.filter((u) => u.id !== user.id));
      } else {
        alert(data.error || 'Error al eliminar');
      }
    } catch (err) {
      alert('Error al eliminar');
    }
  };

  const handleModalSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    if (!token) return;

    if (modalMode === 'create') {
      const createData = data as CreateUserInput;
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createData),
      });
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Error al crear usuario');
      }
      fetchUsers();
    } else if (modalMode === 'edit' && selectedUser) {
      const updateData = data as UpdateUserInput;
      const res = await fetch(`${API_URL}/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Error al actualizar usuario');
      }
      fetchUsers();
    } else if (modalMode === 'role' && selectedUser) {
      const roleData = { role: (data as { role: string }).role };
      const res = await fetch(`${API_URL}/api/users/${selectedUser.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(roleData),
      });
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Error al cambiar rol');
      }
      fetchUsers();
    } else if (modalMode === 'password' && selectedUser) {
      const pwData = { newPassword: (data as { newPassword: string }).newPassword };
      const res = await fetch(`${API_URL}/api/users/${selectedUser.id}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pwData),
      });
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Error al cambiar contraseña');
      }
      alert('Contraseña actualizada correctamente');
    }
  };

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <p className="text-gray-500 dark:text-white/60">No tienes permiso para acceder a esta página</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold dark:text-white/[.87]">Usuarios</h1>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition min-h-[44px]"
        >
          Nuevo Usuario
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-40">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          >
            <option value="">Todos los roles</option>
            <option value="ADMIN">Administrador</option>
            <option value="VENDEDOR">Vendedor</option>
            <option value="CLIENTE">Cliente</option>
          </select>
        </div>
        <div className="w-full sm:w-40">
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por email, nombre o apellido..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          />
        </div>
      </div>

      {/* Table */}
      <UserTable
        users={users}
        onEdit={handleEdit}
        onChangeRole={handleChangeRole}
        onChangePassword={handleChangePassword}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
        loading={loading}
        currentUserId={currentUser.id}
      />

      {/* Modal */}
      <UserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        user={selectedUser}
        mode={modalMode}
      />
    </div>
  );
}