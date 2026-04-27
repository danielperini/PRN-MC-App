import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  DollarSign,
  User,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDENTE: { label: 'Pendente', color: 'bg-white border-2 border-black text-black', icon: Clock },
  EM_ANALISE: { label: 'Em Análise', color: 'bg-white border-2 border-black text-black', icon: Clock },
  APROVADO: { label: 'Aprovado', color: 'bg-black text-white', icon: CheckCircle },
  RECUSADO: { label: 'Recusado', color: 'bg-black text-white', icon: XCircle },
  PAGO: { label: 'Pago', color: 'bg-black text-white', icon: CheckCircle }
};

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function PaymentDetailModal({ payment, onClose, onStatusChange, isCoordinator, queryClient, payments }) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  if (!payment) return null;

  const handleAction = async (newStatus) => {
    setLoading(true);
    await onStatusChange(payment.id, newStatus, comment);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Profissional</p>
              <p className="font-medium">{payment.member_name || payment.user_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Mês de Referência</p>
              <p className="font-medium">{payment.mes_referencia || '—'} / {payment.ano || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Valor</p>
              <p className="font-medium text-lg">{fmtBRL(payment.valor_total || payment.valor)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[payment.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_CONFIG[payment.status]?.label || payment.status}
              </span>
            </div>
          </div>

          {payment.nota_fiscal_url && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Nota Fiscal</p>
              <a
                href={payment.nota_fiscal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                Ver documento
              </a>
            </div>
          )}

          {payment.observacoes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Observações</p>
              <p className="text-sm text-gray-700 rounded-lg bg-gray-50 p-3">{payment.observacoes}</p>
            </div>
          )}

          {isCoordinator && (payment.status === 'PENDENTE' || payment.status === 'EM_ANALISE') && (
            <div className="space-y-3 border-t pt-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Comentário (opcional)</label>
                <Input
                  placeholder="Comentário para o profissional..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  className="border-2 border-black text-black hover:bg-black hover:text-white"
                  onClick={() => handleAction('RECUSADO')}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                  {loading ? 'Recusando...' : 'Recusar'}
                </Button>
                <Button
                  className="bg-black text-white hover:bg-gray-900"
                  onClick={() => handleAction('APROVADO')}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  {loading ? 'Aprovando...' : 'Aprovar'}
                </Button>
              </div>
            </div>
          )}

          {isCoordinator && payment.status === 'PENDENTE' && (
            <div className="border-t pt-4 flex justify-end gap-2">
              <Button
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={async () => {
                  setLoading(true);
                  await handleAction('APROVADO', comment, true);
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                {loading ? 'Aprovando e debitando...' : 'Aprovar + Debitar'}
              </Button>
            </div>
          )}

          {isCoordinator && payment.status === 'APROVADO' && (
            <div className="border-t pt-4 flex justify-end">
              <Button
                className="bg-black text-white hover:bg-gray-900"
                onClick={() => handleAction('PAGO')}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                {loading ? 'Processando...' : 'Marcar como Pago'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPaymentReview({ members = [], budgetLines = [] }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const isCoordinator = [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO'
  ].includes(currentUser?.role);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['team-payments'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 300),
    enabled: !!currentUser
  });

  const handleStatusChange = async (paymentId, newStatus, comment, debit = false) => {
    try {
      await base44.entities.TeamPayment.update(paymentId, {
        status: newStatus,
        ...(comment ? { comentario_coordenacao: comment } : {}),
        ...(debit ? { debitado_em_rubrica: true } : {})
      });
      
      if (debit) {
        const payment = payments.find(p => p.id === paymentId);
        if (payment?.rubrica_id && payment?.valor_total) {
          try {
            const rubrica = await base44.entities.Rubrica.filter({ id: payment.rubrica_id });
            if (rubrica?.[0]) {
              const novoUtilizado = (rubrica[0].valor_utilizado || 0) + payment.valor_total;
              await base44.entities.Rubrica.update(payment.rubrica_id, {
                valor_utilizado: novoUtilizado
              });
            }
          } catch (err) {
            console.warn('Não foi possível debitar da rubrica:', err);
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['team-payments'] });
      queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      throw error;
    }
  };

  const filtered = payments.filter((p) => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const busca = search.trim().toLowerCase();
    const matchSearch =
      !busca ||
      String(p.member_name || p.user_name || '').toLowerCase().includes(busca) ||
      String(p.mes_referencia || '').toLowerCase().includes(busca);
    const valor = p.valor_total || p.valor || 0;
    const temValor = valor > 0;
    return matchStatus && matchSearch && temValor;
  });

  const pendentes = payments.filter((p) => p.status === 'PENDENTE' || p.status === 'EM_ANALISE').length;
  const totalAprovado = payments
    .filter((p) => p.status === 'APROVADO' || p.status === 'PAGO')
    .reduce((s, p) => s + (p.valor_total || p.valor || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Pendentes de Análise</p>
          <p className="mt-1 text-2xl font-bold text-black">{pendentes}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Total de Pagamentos</p>
          <p className="mt-1 text-2xl font-bold text-black">{payments.length}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Total Aprovado / Pago</p>
          <p className="mt-1 text-2xl font-bold text-black">{fmtBRL(totalAprovado)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por profissional ou mês..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-gray-400">Carregando pagamentos...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <DollarSign className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-400">Nenhum pagamento encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-black">
           <table className="w-full border-collapse text-sm">
             <thead>
               <tr className="border-b-2 border-black bg-black text-white text-left">
                 <th className="px-3 py-3 font-medium">Profissional</th>
                 <th className="px-3 py-3 font-medium">Referência</th>
                 <th className="px-3 py-3 font-medium">Status</th>
                 <th className="px-3 py-3 text-right font-medium">Valor</th>
                 <th className="px-3 py-3 text-center font-medium">Ações</th>
               </tr>
             </thead>
            <tbody>
              {filtered.map((p, i) => {
                const status = STATUS_CONFIG[p.status] || { label: p.status, color: 'bg-white border-2 border-black text-black' };
                const StatusIcon = status.icon || Clock;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-200 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{p.member_name || p.user_name || p.created_by || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {p.mes_referencia || '—'}{p.ano ? ` / ${p.ano}` : ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">
                      {fmtBRL(p.valor_total || p.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setSelectedPayment(p)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-black"
                        title="Ver detalhes"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onStatusChange={handleStatusChange}
          isCoordinator={isCoordinator}
          queryClient={queryClient}
          payments={payments}
        />
      )}
    </div>
  );
}