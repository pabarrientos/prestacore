'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
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
      fetch(`${API_URL}/api/clients/${params.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
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
      const res = await fetch(`${API_URL}/api/clients/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Cliente no encontrado'}</p>
        <button
          onClick={() => router.push('/admin/clients')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
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
            onClick={() => router.push('/admin/clients')}
            className="text-primary-600 hover:text-primary-800 mb-2"
          >
            ← Volver a la lista
          </button>
          <h1 className="text-2xl font-bold">Editar Cliente</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-semibold border-b pb-2">Datos de Usuario</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>
        </div>

        <h2 className="text-lg font-semibold border-b pb-2 pt-4">Datos Personales</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apellido *
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DNI *
            </label>
            <input
              type="text"
              name="dni"
              value={formData.dni}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Nacimiento *
            </label>
            <input
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ciudad
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dirección
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <h2 className="text-lg font-semibold border-b pb-2 pt-4">Datos Laborales</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ocupación
            </label>
            <input
              type="text"
              name="occupation"
              value={formData.occupation}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Empleador
            </label>
            <input
              type="text"
              name="employer"
              value={formData.employer}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ingreso Mensual *
          </label>
          <input
            type="number"
            name="monthlyIncome"
            value={formData.monthlyIncome}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/clients')}
            className="py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
