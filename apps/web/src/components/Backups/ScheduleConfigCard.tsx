'use client';

import { useState, useEffect } from 'react';
import { getSchedule, updateSchedule, enforceRetention } from '@/lib/backup-api';
import type { BackupSchedule, RetentionConfig } from '@/lib/backup-types';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export function ScheduleConfigCard() {
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: false,
    frequency: 'daily',
    hour: 3,
  });
  const [retention, setRetention] = useState<RetentionConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enforcing, setEnforcing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    getSchedule()
      .then((data) => {
        if (data?.schedule) setSchedule(data.schedule);
        if (data?.retention) setRetention(data.retention);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleFrequencyChange = (frequency: BackupSchedule['frequency']) => {
    setSchedule((prev) => ({ ...prev, frequency }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await updateSchedule(schedule, retention);
      setMessage({ type: 'success', text: 'Configuración guardada' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Error al guardar',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEnforceRetention = async () => {
    setEnforcing(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await enforceRetention();
      setMessage({
        type: 'success',
        text: result.deleted === 0
          ? 'No hay respaldos para eliminar'
          : `Se eliminaron ${result.deleted} respaldo(s)`,
      });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Error al ejecutar retención',
      });
    } finally {
      setEnforcing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-[#2a2a2a] rounded w-1/3" />
          <div className="h-8 bg-gray-200 dark:bg-[#2a2a2a] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold dark:text-white">
          Programación de Respaldos
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-600 dark:text-white/60">
            {schedule.enabled ? 'Activo' : 'Inactivo'}
          </span>
          <button
            onClick={() =>
              setSchedule((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            className={`relative w-11 h-6 rounded-full transition-colors ${
              schedule.enabled
                ? 'bg-primary-600 dark:bg-[#39ff14]'
                : 'bg-gray-300 dark:bg-[#333]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform dark:shadow-none ${
                schedule.enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </label>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400'
              : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Frecuencia
          </label>
          <select
            value={schedule.frequency}
            onChange={(e) =>
              handleFrequencyChange(e.target.value as BackupSchedule['frequency'])
            }
            className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
          >
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>

        {/* Hour */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Hora (0-23)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={schedule.hour}
            onChange={(e) =>
              setSchedule((prev) => ({
                ...prev,
                hour: parseInt(e.target.value, 10) || 0,
              }))
            }
            className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
          />
        </div>

        {/* Day of week (weekly) */}
        {schedule.frequency === 'weekly' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Día de la semana
            </label>
            <select
              value={schedule.dayOfWeek ?? 1}
              onChange={(e) =>
                setSchedule((prev) => ({
                  ...prev,
                  dayOfWeek: parseInt(e.target.value, 10),
                }))
              }
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Day of month (monthly) */}
        {schedule.frequency === 'monthly' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
              Día del mes (1-31)
            </label>
            <input
              type="number"
              min={1}
              max={31}
              value={schedule.dayOfMonth ?? 1}
              onChange={(e) =>
                setSchedule((prev) => ({
                  ...prev,
                  dayOfMonth: parseInt(e.target.value, 10) || 1,
                }))
              }
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
            />
          </div>
        )}

        <div className="border-t dark:border-[#333] pt-4 mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3 dark:text-white/60">
            Política de Retención
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1 dark:text-white/40">
                Máx. cantidad de respaldos
              </label>
              <input
                type="number"
                min={1}
                placeholder="ej. 10"
                value={retention.maxCount ?? ''}
                onChange={(e) =>
                  setRetention((prev) => ({
                    ...prev,
                    maxCount: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  }))
                }
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 dark:text-white/40">
                Máx. edad (días)
              </label>
              <input
                type="number"
                min={1}
                placeholder="ej. 30"
                value={retention.maxAgeDays ?? ''}
                onChange={(e) =>
                  setRetention((prev) => ({
                    ...prev,
                    maxAgeDays: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  }))
                }
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333] dark:text-white/87"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
        >
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>

        <button
          onClick={handleEnforceRetention}
          disabled={enforcing}
          className="w-full px-4 py-2 border border-orange-500 text-orange-600 rounded-lg hover:bg-orange-50 disabled:opacity-50 dark:border-orange-400 dark:text-orange-400 dark:hover:bg-orange-950/30"
        >
          {enforcing ? 'Ejecutando...' : 'Ejecutar Retención Ahora'}
        </button>
      </div>
    </div>
  );
}