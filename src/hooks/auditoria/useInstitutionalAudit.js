import { useQuery } from '@tanstack/react-query';
import { getOfficialInstitutionalMetrics } from '@/utils/auditoria/institutionalMetrics';

export function useInstitutionalAudit(options = {}) {
  return useQuery({
    queryKey: ['institutional-audit', options?.period || 'acumulado'],
    queryFn: () => getOfficialInstitutionalMetrics(options),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
