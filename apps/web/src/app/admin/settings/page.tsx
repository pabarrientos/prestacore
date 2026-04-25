'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from 'next-themes';
import { Theme } from '@/lib/theme';

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
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 dark:text-white/[.87]">Configuración del Sistema</h1>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400 dark:border dark:border-green-900' : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 dark:border dark:border-red-900'}`}>
          {message.text}
        </div>
      )}

      {/* Apariencia - Theme Selector */}
      <ThemeSelectorCard />

      {/* Tasas de Interés */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Tasas de Interés</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-white/60">
          Estas tasas se usan para calcular el interés anual. Ejemplo: tasa semanal 7.5 × 48 semanas = 360% anual
        </p>
        
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Tasa Semanal Base (%)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.WEEKLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('WEEKLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
                <button
                  onClick={() => handleSave('WEEKLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                {settings.WEEKLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Tasa Quincenal Base (%)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.BIWEEKLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('BIWEEKLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
                <button
                  onClick={() => handleSave('BIWEEKLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                {settings.BIWEEKLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Tasa Mensual Base (%)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.MONTHLY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('MONTHLY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
                <button
                  onClick={() => handleSave('MONTHLY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                {settings.MONTHLY_BASE_RATE?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Tasa Diaria Base (%)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={settings.DAILY_BASE_RATE?.value || ''}
                  onChange={(e) => handleChange('DAILY_BASE_RATE', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
                <button
                  onClick={() => handleSave('DAILY_BASE_RATE')}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
                >
                  Guardar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                {settings.DAILY_BASE_RATE?.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Límites de Préstamo */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Límites de Préstamo</h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Monto Mínimo ($)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                value={settings.MIN_LOAN_AMOUNT?.value || ''}
                onChange={(e) => handleChange('MIN_LOAN_AMOUNT', e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
              <button
                onClick={() => handleSave('MIN_LOAN_AMOUNT')}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
              >
                Guardar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Monto Máximo ($)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                value={settings.MAX_LOAN_AMOUNT?.value || ''}
                onChange={(e) => handleChange('MAX_LOAN_AMOUNT', e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
              <button
                onClick={() => handleSave('MAX_LOAN_AMOUNT')}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Redondeo */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Redondeo</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-white/60">
          Unidad mínima de redondeo para cálculos de moneda en formularios de pago.
        </p>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Unidad de Redondeo ($)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              step="1"
              min="1"
              value={settings.ROUNDING_UNIT?.value || ''}
              onChange={(e) => handleChange('ROUNDING_UNIT', e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              placeholder="1000"
            />
            <button
              onClick={() => handleSave('ROUNDING_UNIT')}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
            Default: 1000
          </p>
        </div>
      </div>

      {/* Mora */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Interés por Mora</h2>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Tasa Diaria de Mora (decimal)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={settings.MORA_RATE?.value || ''}
              onChange={(e) => handleChange('MORA_RATE', e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              placeholder="0.0005"
            />
            <button
              onClick={() => handleSave('MORA_RATE')}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
            Ejemplo: 0.01 = 1% diario, 0.001 = 0.1% diario, 0.0005 = 0.05% diario
          </p>
        </div>
      </div>

      {/* Sistema de Amortización */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Sistema de Amortización</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-white/60">
          Sistema por defecto para nuevos préstamos. Puede cambiarse individualmente en el simulador, creación de préstamos o refinanciación.
        </p>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Sistema Default
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={settings.defaultAmortizationSystem?.value || 'FRENCH'}
              onChange={(e) => handleChange('defaultAmortizationSystem', e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            >
              <option value="FRENCH">Sistema Francés — Cuota fija, interés sobre saldo</option>
              <option value="GERMAN">Sistema Alemán — Capital constante, interés decreciente</option>
              <option value="FLAT_RATE">Sistema de Tasa Plana — Interés sobre capital original</option>
            </select>
            <button
              onClick={() => handleSave('defaultAmortizationSystem')}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
            {settings.defaultAmortizationSystem?.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ThemeSelectorCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const themes: Theme[] = ['light', 'dark', 'system'];
  const labels: Record<Theme, string> = { light: '☀️ Claro', dark: '🌙 Oscuro', system: '💻 Sistema' };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6 dark:bg-[#1e1e1e]">
      <h2 className="text-lg font-semibold mb-2 dark:text-white/[.87]">Apariencia</h2>
      <p className="text-sm text-gray-500 mb-4 dark:text-white/60">
        Selecciona el tema de la interfaz
      </p>
      <div className="flex flex-wrap gap-3">
        {themes.map((t) => {
          const isActive = theme === t;
          return (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-lg border transition ${
                isActive
                  ? 'border-[#39ff14] bg-[#39ff14]/10 text-[#39ff14] dark:border-[#39ff14] dark:bg-[#39ff14]/10 dark:text-[#39ff14]'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-white/60 dark:hover:bg-white/5'
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>
      {resolvedTheme && (
        <p className="text-xs text-gray-400 mt-2 dark:text-white/38">
          Tema activo: {resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'}
        </p>
      )}
    </div>
  );
}
