'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ScheduleConfigCard } from '@/components/Backups/ScheduleConfigCard';
import { BackupListTable } from '@/components/Backups/BackupListTable';
import { RestoreCard } from '@/components/Backups/RestoreCard';

export default function BackupsPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400">
          Acceso denegado. Solo administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold dark:text-white/[.87]">
        Respaldos de Base de Datos
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: schedule + retention */}
        <div className="space-y-6">
          <ScheduleConfigCard />
        </div>

        {/* Right column: upload + restore */}
        <div className="space-y-6">
          <RestoreCard onUploaded={handleRefresh} />
        </div>
      </div>

      {/* Full width: backup list */}
      <BackupListTable refreshKey={refreshKey} />
    </div>
  );
}