import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, FileText, CreditCard, ShoppingCart, FileCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function StatusBadge({ status }) {
  const s = (status || '').toLowerCase();
  if (s.includes('aprovad') || s.includes('pago') || s.includes('assinado') || s === 'approved') {
    return <Badge className="bg-green-100 text-green-800 border-green-200 font-medium">{status}</Badge>;
  }
  if (s.includes('recusad') || s.includes('rejeita') || s.includes('cancelad') || s.includes('devolvid')) {
    return <Badge className="bg-red-100 text-red-800 border-red-200 font-medium">{status}</Badge>;
  }
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 font-medium">{status || 'Em análise'}</Badge>;
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function EmptyState({ text }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>;
}

export default function DocumentosTab({ targetEmail, teamMember }) {
  // Contratos — busca por id do membro OU por user_email como fallback
  const { data: contratosPorId = [] } = useQuery({
    queryKey: ['user-contratos-meusdados-id', teamMember?.id],
    queryFn: () => base44.entities.DocumentIntake.filter(
      { contrato_team_member_id: teamMember.id, entidade_destino: 'TeamMember' },
      '-created_date', 10
    ),
    enabled: !!teamMember?.id,
    staleTime: 120000,
  });

  const { data: contratosPorEmail = [] } = useQuery({
    queryKey: ['user-contratos-meusdados-email', targetEmail],
    queryFn: () => base44.entities.DocumentIntake.filter(
      { user_email: targetEmail, entidade_destino: 'TeamMember' },
      '-created_date', 10
    ),
    enabled: !!targetEmail && !teamMember?.id,
    staleTime: 120000,
  });

  const contratos = teamMember?.id ? contratosPorId : contratosPorEmail;

  // Team Payments (NFs pessoais)
  const { data: teamPayments = [] } = useQuery({
    queryKey: ['user-team-payments-meusdados', targetEmail],
    queryFn: () => base44.entities.TeamPayment.filter({ user_email: targetEmail }, '-created_date', 50),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  // Purchase Requests criadas pelo usuário
  const { data: purchasesEnviadas = [] } = useQuery({
    queryKey: ['user-purchases-meusdados', targetEmail],
    queryFn: () => base44.entities.PurchaseRequest.filter({ created_by: targetEmail }, '-created_date', 100),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  // Relatórios enviados
  const { data: relatorios = [] } = useQuery({
    queryKey: ['user-reports-docs-meusdados', targetEmail],
    queryFn: () => base44.entities.Report.filter({ created_by: targetEmail }, '-created_date', 20),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  const contratosVisiveis = contratos.filter(c => {
    const s = (c.status_processamento || '').toUpperCase();
    return s === 'APROVADO' || s === 'APPROVED' || (c.contrato_drive_url);
  });

  return (
    <div className="space-y-8">
      {/* Meu Contrato */}
      <div>
        <SectionTitle icon={FileText} title="Meu Contrato" />
        {contratosVisiveis.length === 0 ? (
          <EmptyState text="Nenhum contrato aprovado encontrado." />
        ) : (
          <div className="space-y-2">
            {contratosVisiveis.map(c => (
              <div key={c.id} className="border border-border rounded-xl p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {c.contrato_numero || c.file_name_final || c.file_name_original || 'Contrato'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.fornecedor_nome || c.nf_emitente_nome || '—'}
                    {c.created_date ? ` · ${fmtDate(c.created_date)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={c.status_processamento || 'Aprovado'} />
                  {c.contrato_drive_url && (
                    <a href={c.contrato_drive_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Ver
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minhas NFs e Pagamentos */}
      <div>
        <SectionTitle icon={CreditCard} title="Minhas Notas Fiscais e Pagamentos" />
        {teamPayments.length === 0 ? (
          <EmptyState text="Nenhum pagamento registrado." />
        ) : (
          <div className="space-y-2">
            {teamPayments.slice(0, 30).map(tp => (
              <div key={tp.id} className="border border-border rounded-xl p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {tp.descricao || tp.tipo_servico || 'Pagamento'}
                    {tp.nf_numero ? ` · NF ${tp.nf_numero}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tp.competencia || tp.mes_referencia || '—'} · {fmtBRL(tp.valor || tp.valor_bruto)}
                    {tp.rubrica_nome ? ` · ${tp.rubrica_nome}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={tp.status || 'Em análise'} />
                  {(tp.comprovante_url || tp.nota_fiscal_url) && (
                    <a href={tp.comprovante_url || tp.nota_fiscal_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Ver
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitações Enviadas */}
      <div>
        <SectionTitle icon={ShoppingCart} title="Solicitações de Pagamento Enviadas" />
        {purchasesEnviadas.length === 0 ? (
          <EmptyState text="Nenhuma solicitação enviada." />
        ) : (
          <div className="space-y-2">
            {purchasesEnviadas.slice(0, 30).map(p => (
              <div key={p.id} className="border border-border rounded-xl p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {p.fornecedor_nome || p.descricao_item || 'Solicitação'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtBRL(p.valor_solicitado || p.valor_total)}
                    {p.rubrica_nome ? ` · ${p.rubrica_nome}` : ''}
                    {p.created_date ? ` · ${fmtDate(p.created_date)}` : ''}
                  </p>
                </div>
                <StatusBadge status={p.status || 'RASCUNHO'} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meus Relatórios */}
      <div>
        <SectionTitle icon={FileCheck} title="Meus Relatórios" />
        {relatorios.length === 0 ? (
          <EmptyState text="Nenhum relatório encontrado." />
        ) : (
          <div className="space-y-2">
            {relatorios.map(r => {
              const statusMap = {
                DRAFT: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
                SUBMITTED: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
                IN_REVIEW: { label: 'Em Revisão', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
                RETURNED: { label: 'Devolvido', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
                APPROVED: { label: 'Aprovado', cls: 'bg-green-100 text-green-800 border-green-200' },
                ARCHIVED: { label: 'Arquivado', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
              };
              const st = statusMap[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
              return (
                <div key={r.id} className="border border-border rounded-xl p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      {r.mes_referencia || '—'} {r.ano || ''} · {r.museu || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.submitted_at ? `Enviado em ${fmtDate(r.submitted_at)}` : r.created_date ? fmtDate(r.created_date) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`${st.cls} font-medium`}>{st.label}</Badge>
                    <Link
                      to={`/ReportEditor?id=${r.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Abrir
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}