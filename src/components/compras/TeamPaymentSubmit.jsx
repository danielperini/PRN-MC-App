// ADICIONE ESTES IMPORTS NO TOPO (não remova os existentes)
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

// ADICIONE ESTE BLOCO ANTES DO RETURN PRINCIPAL
const { data: meusPagamentos = [] } = useQuery({
  queryKey: ['meus-pagamentos', effectiveMember?.user_email],
  enabled: !!effectiveMember?.user_email,
  queryFn: async () => {
    const res = await base44.entities.TeamPayment.list({
      filter: {
        user_email: effectiveMember.user_email
      },
      sort: { created_at: -1 }
    });
    return res?.items || [];
  }
});

function getStatusLabel(status) {
  if (!status) return 'Enviado';

  const s = String(status).toUpperCase();

  if (s.includes('APROV')) return 'Aprovado';
  if (s.includes('DEVOL')) return 'Devolvido';
  if (s.includes('RECUS')) return 'Recusado';

  return 'Enviado';
}

function getStatusColor(status) {
  const s = String(status || '').toUpperCase();

  if (s.includes('APROV')) return 'bg-green-100 text-green-700';
  if (s.includes('DEVOL')) return 'bg-amber-100 text-amber-700';
  if (s.includes('RECUS')) return 'bg-red-100 text-red-700';

  return 'bg-blue-100 text-blue-700';
}
