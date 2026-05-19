import { base44 } from '@/api/base44Client';

const FIVE_MINUTES = 1000 * 60 * 5;
const ONE_MINUTE = 1000 * 60;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function prefetchCriticalAppData(queryClient, currentUser) {
  if (!queryClient || !currentUser?.email) return;

  queryClient.prefetchQuery({
    queryKey: ['agenda-programacao'],
    queryFn: async () => safeArray(await base44.entities.Programacao.list('-data_inicio', 5000)),
    staleTime: FIVE_MINUTES,
  });

  queryClient.prefetchQuery({
    queryKey: ['relatorios-list'],
    queryFn: async () => safeArray(await base44.entities.Report.list('-created_date', 200)),
    staleTime: ONE_MINUTE,
  });

  queryClient.prefetchQuery({
    queryKey: ['galeria-fotos-base'],
    queryFn: async () => {
      const [reports, programacao] = await Promise.all([
        base44.entities.Report.filter({ status: 'APPROVED' }).catch(() => []),
        base44.entities.Programacao.list('-data_realizacao', 1000).catch(() => []),
      ]);

      return {
        reports: safeArray(reports),
        programacao: safeArray(programacao),
      };
    },
    staleTime: FIVE_MINUTES,
  });
}

export default prefetchCriticalAppData;
