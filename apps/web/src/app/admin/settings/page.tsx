'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface Setting {
  value: string;
  description: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSettings(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token]);

  const handleChange = (key: string, value: string) => {
    setSettings({
      ...settings,
      [key]: { ...settings[key], value },
    });
  };

  const handleSave = async (key: string) => {
    if (!token) return;
    
    // Skip if setting doesn't exist yet
    if (!settings[key]) {
      setMessage({ type: 'error', text: `La configuración ${key} no existe` });
      return;
    }
    
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key,
          value: settings[key].value,
          description: settings[key].description,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: `${key} actualizado correctamente` });
      } else {
        // Mostrar detalles del error de validación
        const errorMsg = data.details 
          ? `${data.error}: ${JSON.stringify(data.details)}`
          : data.error || 'Error al guardar';
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Acceso denegado. Solo administradores.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configuración del Sistema</h1>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
          {message.text}
        </div>
      )}

      {/* Tasas de Interés */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Tasas de Interés</h2>
        <p className="text-sm text-gray-500 mb-4">
          Estas tasas se usan para calcular el interés anual. Ejemplo: tasa semanal 7.5 × 52 semanas = 390% anual
        </p>
        
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa Semanal Base (%)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.WEEKLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('WEEKLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={() => handleSave('WEEKLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.WEEKLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa Quincenal Base (%)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.BIWEEKLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('BIWEEKLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={() => handleSave('BIWEEKLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.BIWEEKLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa Mensual Base (%)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.MONTHLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('MONTHLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={() => handleSave('MONTHLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.MONTHLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa Diaria Base (%)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.DAILY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('DAILY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={() => handleSave('DAILY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.DAILY_BASE_RATE?.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Límites de Préstamo */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Límites de Préstamo</h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto Mínimo ($)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={settings.MIN_LOAN_AMOUNT?.value || ''}
                onChange={(e) => handleChange('MIN_LOAN_AMOUNT', e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg"
              />
              <button
                onClick={() => handleSave('MIN_LOAN_AMOUNT')}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto Máximo ($)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={settings.MAX_LOAN_AMOUNT?.value || ''}
                onChange={(e) => handleChange('MAX_LOAN_AMOUNT', e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg"
              />
              <button
                onClick={() => handleSave('MAX_LOAN_AMOUNT')}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mora */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Interés por Mora</h2>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tasa Diaria de Mora (decimal)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={settings.MORA_RATE?.value || ''}
              onChange={(e) => handleChange('MORA_RATE', e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
              placeholder="0.0005"
            />
            <button
              onClick={() => handleSave('MORA_RATE')}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Ejemplo: 0.01 = 1% diario, 0.001 = 0.1% diario, 0.0005 = 0.05% diario
          </p>
        </div>
      </div>

      {/* Zona Horaria */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Zona Horaria</h2>
        <p className="text-sm text-gray-500 mb-4">
          La zona horaria se usa para calcular las cuotas vencidas, mora y cancelaciones anticipadas.
        </p>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <div className="flex gap-2">
            <select
              value={(settings.TIMEZONE?.value) || 'America/Argentina/Buenos_Aires'}
              onChange={(e) => {
                // Ensure the setting object exists with value and description
                // const currentValue = settings.TIMEZONE?.value || 'America/Argentina/Buenos_Aires';
                setSettings({
                  ...settings,
                  TIMEZONE: { 
                    value: e.target.value, 
                    description: settings.TIMEZONE?.description || null 
                  },
                });
              }}
              className="flex-1 px-4 py-2 border rounded-lg"
            >
              <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
              <option value="America/New_York">Estados Unidos (Nueva York)</option>
              <option value="America/Mexico_City">México</option>
              <option value="America/Bogota">Colombia</option>
              <option value="America/Santiago">Chile</option>
              <option value="America/Lima">Perú</option>
              <option value="Europe/Madrid">España (Madrid)</option>
              <option value="Europe/London">Reino Unido (Londres)</option>
              <option value="UTC">UTC</option>
            </select>
            <button
              onClick={() => handleSave('TIMEZONE')}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Valor actual: {settings.TIMEZONE?.value || 'America/Argentina/Buenos_Aires'}
          </p>
        </div>
      </div>
    </div>
  );
}
