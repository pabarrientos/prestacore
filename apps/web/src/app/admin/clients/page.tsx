'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

interface Client {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  monthlyIncome: number;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ClientsPage() {
  const { token, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeleting(id);
    try {
      const res = await fetch(`${API_URL}/api/clients/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setClients(clients.filter(c => c.id !== id));
      } else {
        alert(data.error || 'Error al eliminar el cliente');
      }
    } catch (err) {
      alert('Error al eliminar el cliente');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setClients(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token]);

  const filteredClients = clients.filter(c => 
    c.dni.toLowerCase().includes(filter.toLowerCase()) ||
    c.firstName.toLowerCase().includes(filter.toLowerCase()) ||
    c.lastName.toLowerCase().includes(filter.toLowerCase()) ||
    c.email.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        {user?.role === 'ADMIN' && (
          <Link
            href="/admin/clients/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Nuevo Cliente
          </Link>
        )}
      </div>

      {/* Filtro */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por DNI, nombre, apellido o email..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg w-full md:w-80"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                DNI
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Teléfono
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ciudad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ingreso Mensual
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredClients.map((client) => (
              <tr key={client.id}>
                <td className="px-6 py-4 whitespace-nowrap">{client.dni}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {client.firstName} {client.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{client.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">{client.phone || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">{client.city || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  ${client.monthlyIncome.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    <a
                      href={`/admin/loans/new?clientId=${client.id}`}
                      className="text-primary-600 hover:text-primary-900 text-sm"
                    >
                      Crear Préstamo
                    </a>
                    {user?.role === 'ADMIN' && (
                      <>
                        <a
                          href={`/admin/clients/${client.id}`}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          Editar
                        </a>
                        <button
                          onClick={() => handleDelete(client.id)}
                          disabled={deleting === client.id}
                          className="text-red-600 hover:text-red-900 text-sm text-left disabled:opacity-50"
                        >
                          {deleting === client.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredClients.length === 0 && (
          <p className="p-4 text-center text-gray-500">No hay clientes</p>
        )}
      </div>
    </div>
  );
}
