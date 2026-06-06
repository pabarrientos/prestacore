'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
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

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'role' | 'password'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!token) return;

    const params = new URLSearchParams();
    if (roleFilter) params.append('role', roleFilter);
    if (activeFilter) params.append('isActive', activeFilter);
    if (searchQuery) params.append('search', searchQuery);
    params.append('page', String(page));
    params.append('limit', '20');

    try {
      const res = await apiFetch(`/api/users?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.data || []);
        setTotalPages(data.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [token, roleFilter, activeFilter, searchQuery, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page when role or active filter changes
  const handleRoleChange = useCallback((value: string) => {
    setRoleFilter(value);
    setPage(1);
  }, []);

  const handleActiveChange = useCallback((value: string) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    setSearchQuery('');
    setPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

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
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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

    // Determine what action will happen based on user state
    let confirmMessage = '';
    if (user.role === 'CLIENTE') {
      confirmMessage = 'Este usuario tiene un cliente asociado. ¿Está seguro de que desea eliminarlo? El cliente será eliminado si no tiene préstamos.';
    } else if (user.role === 'VENDEDOR') {
      confirmMessage = 'Este usuario es vendedor. ¿Está seguro de que desea eliminarlo? Si tiene préstamos asignados será desactivado.';
    } else {
      confirmMessage = '¿Está seguro de que desea eliminar este usuario?';
    }
    
    if (!confirm(confirmMessage)) return;

    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        // Show the result message
        alert(data.data?.message || 'Operación completada');
        // Reload users to get fresh data
        fetchUsers();
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
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      const res = await apiFetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
      const res = await apiFetch(`/api/users/${selectedUser.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
      const res = await apiFetch(`/api/users/${selectedUser.id}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
        <div className="w-full sm:w-44">
          <select
            value={roleFilter}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          >
            <option value="">Todos los roles</option>
            <option value="ADMIN">Administrador</option>
            <option value="VENDEDOR">Vendedor</option>
            <option value="CLIENTE">Cliente</option>
          </select>
        </div>
        <div className="w-full sm:w-44">
          <select
            value={activeFilter}
            onChange={(e) => handleActiveChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Buscar por email, nombre o apellido..."
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                setSearchQuery(searchText);
                setPage(1);
              }
            }}
            className="w-full px-3 py-2 pr-10 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] min-h-[44px]"
          />
          {searchText && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Pagination arriba */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

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

      {/* Pagination abajo */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

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