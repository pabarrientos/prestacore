'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

interface ClientData {
  id: string;
  dni: string;
  dateOfBirth: string;
  address: string | null;
  city: string | null;
  occupation: string | null;
  employer: string | null;
  monthlyIncome: number;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
}

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    dni: '',
    dateOfBirth: '',
    address: '',
    city: '',
    occupation: '',
    employer: '',
    monthlyIncome: '',
  });

  useEffect(() => {
    if (token && params.id) {
      apiFetch(`/api/clients/${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setClient(data.data);
            const c = data.data;
            setFormData({
              email: c.user.email,
              firstName: c.user.firstName,
              lastName: c.user.lastName,
              phone: c.user.phone || '',
              dni: c.dni,
              dateOfBirth: c.dateOfBirth ? c.dateOfBirth.split('T')[0] : '',
              address: c.address || '',
              city: c.city || '',
              occupation: c.occupation || '',
              employer: c.employer || '',
              monthlyIncome: String(c.monthlyIncome),
            });
          } else {
            setError(data.error || 'Error al cargar el cliente');
          }
        })
        .catch((err) => {
          console.error(err);
          setError('Error al cargar el cliente');
        })
        .finally(() => setLoading(false));
    }
  }, [token, params.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch(`/api/clients/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || null,
          dni: formData.dni,
          dateOfBirth: formData.dateOfBirth,
          address: formData.address || null,
          city: formData.city || null,
          occupation: formData.occupation || null,
          employer: formData.employer || null,
          monthlyIncome: parseFloat(formData.monthlyIncome),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Cliente actualizado correctamente');
        setTimeout(() => {
          router.push('/admin/clients');
        }, 1500);
      } else {
        setError(data.error || 'Error al actualizar el cliente');
      }
    } catch (err) {
      setError('Error al actualizar el cliente');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="text-center py-12 dark:bg-[#121212]">
        <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Cliente no encontrado'}</p>
        <button
          onClick={() => router.push('/admin/clients')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612] mb-2"
          >
            ← Atrás
          </button>
          <h1 className="text-2xl md:text-3xl font-bold dark:text-white/[.87]">Editar Cliente</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 rounded-lg">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-semibold border-b dark:border-gray-700 pb-2 dark:text-white/[.87]">Datos de Usuario</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Email *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>
        </div>

        <h2 className="text-lg font-semibold border-b dark:border-gray-700 pb-2 pt-4 dark:text-white/[.87]">Datos Personales</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Nombre *
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Apellido *
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              DNI *
            </label>
            <input
              type="text"
              name="dni"
              value={formData.dni}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha de Nacimiento *
            </label>
            <input
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Teléfono
            </label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Ciudad
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
            Dirección
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
          />
        </div>

        <h2 className="text-lg font-semibold border-b dark:border-gray-700 pb-2 pt-4 dark:text-white/[.87]">Datos Laborales</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Ocupación
            </label>
            <input
              type="text"
              name="occupation"
              value={formData.occupation}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Empleador
            </label>
            <input
              type="text"
              name="employer"
              value={formData.employer}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
            Ingreso Mensual *
          </label>
          <input
            type="number"
            name="monthlyIncome"
            value={formData.monthlyIncome}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/clients')}
            className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-[#d3d3d3] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
