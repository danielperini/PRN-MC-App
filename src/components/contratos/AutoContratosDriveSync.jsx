import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const SESSION_KEY = 'contratos_drive_sync_done';

export default function AutoContratosDriveSync({ currentUser }) {
  useEffect(() => {
    if (!currentUser) return;

    const role = String(currentUser.role || '').toLowerCase();
    const isCoord = ['admin', 'coordenador', 'coordinator'].includes(role);
    if (!isCoord) return;

    if (sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, '1');

    // Disparo silencioso — sem await no useEffect para não bloquear render
    base44.functions.invoke('buscarContratosAssinadosDrive', { sync_team_members: true })
      .catch(() => { /* silencioso */ });
  }, [currentUser?.email]);

  return null;
}