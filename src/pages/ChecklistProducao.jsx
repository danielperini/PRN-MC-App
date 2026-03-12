import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS = {
  OK: 'ok',
  ERROR: 'error',
  WARN: 'warn',
  LOADING: 'loading',
};

function StatusIcon({ status }) {
  if (status === STATUS.LOADING) return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
  if (status === STATUS.OK) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (status === STATUS.WARN) return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function CheckItem({ label, status, detail }) {
  const bgColors = {
    ok: 'bg-green-50 border-green-200',
    warn: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
    loading: 'bg-gray-50 border-gray-200',
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bgColors[status] || bgColors.loading}`}>
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900">{label}</p>
        {detail && <p className="text-xs text-gray-600 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-bold text-black mb-3 pb-2 border-b border-gray-200">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ChecklistInner() {
  const [key, setKey] = useState(0);

  const { data: rubricas, isLoading: loadRub } = useQuery({
    queryKey: ['check-rubricas', key],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 100),
  });

  const { data: compras, isLoading: loadComp } = useQuery({
    queryKey: ['check-compras', key],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 50),
  });

  const { data: lancamentos, isLoading: loadLanc } = useQuery({
    queryKey: ['check-lancamentos', key],
    queryFn: () => base44.entities.LancamentoRubrica.list('-created_date', 20),
  });

  const { data: mapeamentos, isLoading: loadMap } = useQuery({
    queryKey: ['check-mapeamentos', key],
    queryFn: () => base44.entities.MapeamentoRubricas.list('', 50),
  });

  const { data: users, isLoading: loadUsers } = useQuery({
    queryKey: ['check-users', key],
    queryFn: () => base44.entities.User.list('-created_date', 100),
  });

  const { data: permissions, isLoading: loadPerms } = useQuery({
    queryKey: ['check-permissions', key],
    queryFn: () => base44.entities.UserPermission.list('', 200),
  });

  const { data: reports, isLoading: loadReports } = useQuery({
    queryKey: ['check-reports', key],
    queryFn: () => base44.entities.Report.list('-created_date', 20),
  });

  const { data: budgetLines, isLoading: loadBL } = useQuery({
    queryKey: ['check-budgetlines', key],
    queryFn: () => base44.entities.BudgetLine.list('codigo', 50),
  });

  const { data: userRegistrations, isLoading: loadReg } = useQuery({
    queryKey: ['check-registrations', key],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }, '-created_date'),
  });

  // Derived checks
  const rubricasAtivas = rubricas?.filter(r => r.ativo) ?? [];
  const comprasComRubrica = compras?.filter(c => c.rubrica_id) ?? [];
  const rubricasComSaldo = rubricasAtivas.filter(r => typeof r.saldo === 'number');
  const usersComPermissao = users?.filter(u => permissions?.some(p => p.user_email === u.email)) ?? [];

  const rubStatus = loadRub ? STATUS.LOADING : rubricasAtivas.length >= 5 ? STATUS.OK : rubricasAtivas.length > 0 ? STATUS.WARN : STATUS.ERROR;
  const rubDetail = loadRub ? 'Verificando...' : `${rubricasAtivas.length} rubricas ativas cadastradas`;

  const saldoStatus = loadRub ? STATUS.LOADING : rubricasComSaldo.length === rubricasAtivas.length ? STATUS.OK : STATUS.WARN;
  const saldoDetail = loadRub ? 'Verificando...' : `${rubricasComSaldo.length}/${rubricasAtivas.length} rubricas com saldo calculado`;

  const compStatus = loadComp ? STATUS.LOADING : STATUS.OK;
  const compDetail = loadComp ? 'Verificando...' : `${compras?.length ?? 0} solicitações de compra`;

  const compRubricaStatus = loadComp ? STATUS.LOADING : STATUS.OK;
  const compRubricaDetail = loadComp ? 'Verificando...' : `${comprasComRubrica.length}/${compras?.length ?? 0} compras vinculadas a rubricas`;

  const lancStatus = loadLanc ? STATUS.LOADING : STATUS.OK;
  const lancDetail = loadLanc ? 'Verificando...' : `${lancamentos?.length ?? 0} lançamentos registrados`;

  const mapStatus = loadMap ? STATUS.LOADING : mapeamentos?.length > 0 ? STATUS.OK : STATUS.WARN;
  const mapDetail = loadMap ? 'Verificando...' : `${mapeamentos?.length ?? 0} mapeamentos configurados`;

  const userStatus = loadUsers ? STATUS.LOADING : (users?.length ?? 0) > 0 ? STATUS.OK : STATUS.ERROR;
  const userDetail = loadUsers ? 'Verificando...' : `${users?.length ?? 0} usuários cadastrados`;

  const permStatus = loadPerms || loadUsers ? STATUS.LOADING : usersComPermissao.length > 0 ? STATUS.OK : STATUS.WARN;
  const permDetail = loadPerms ? 'Verificando...' : `${permissions?.length ?? 0} registros de permissão / ${usersComPermissao.length} usuários com permissões configuradas`;

  const pendRegStatus = loadReg ? STATUS.LOADING : (userRegistrations?.length ?? 0) === 0 ? STATUS.OK : STATUS.WARN;
  const pendRegDetail = loadReg ? 'Verificando...' : `${userRegistrations?.length ?? 0} solicitações pendentes de aprovação`;

  const reportStatus = loadReports ? STATUS.LOADING : STATUS.OK;
  const reportDetail = loadReports ? 'Verificando...' : `${reports?.length ?? 0} relatórios no sistema`;

  const blStatus = loadBL ? STATUS.LOADING : (budgetLines?.length ?? 0) > 0 ? STATUS.OK : STATUS.WARN;
  const blDetail = loadBL ? 'Verificando...' : `${budgetLines?.filter(b => b.codigo?.startsWith('MC3A'))?.length ?? 0} linhas orçamentárias MC3A cadastradas`;

  const allLoading = loadRub || loadComp || loadLanc || loadMap || loadUsers || loadPerms || loadReports || loadBL || loadReg;

  const countOk = [rubStatus, saldoStatus, compStatus, compRubricaStatus, lancStatus, mapStatus, userStatus, permStatus, pendRegStatus, reportStatus, blStatus].filter(s => s === STATUS.OK).length;
  const totalChecks = 11;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-black">Checklist de Produção</h1>
            <p className="text-sm text-gray-500 mt-1">Verificação de integridade e conectividade do sistema</p>
          </div>
          <Button variant="outline" onClick={() => setKey(k => k + 1)} disabled={allLoading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${allLoading ? 'animate-spin' : ''}`} />
            Retestar
          </Button>
        </div>

        {/* Score geral */}
        <div className={`rounded-xl p-5 mb-8 border-2 ${countOk === totalChecks ? 'bg-green-50 border-green-300' : countOk >= totalChecks * 0.7 ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300'}`}>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-black text-black">{countOk}/{totalChecks}</div>
            <div>
              <p className="font-semibold text-black text-lg">
                {countOk === totalChecks ? '✅ Sistema pronto para produção' : countOk >= totalChecks * 0.7 ? '⚠️ Sistema com alertas — verifique antes de publicar' : '❌ Sistema com erros críticos'}
              </p>
              <p className="text-sm text-gray-600">verificações passadas</p>
            </div>
          </div>
        </div>

        {/* Rubricas */}
        <Section title="💰 Rubricas Orçamentárias">
          <CheckItem label="Rubricas cadastradas" status={rubStatus} detail={rubDetail} />
          <CheckItem label="Saldos calculados" status={saldoStatus} detail={saldoDetail} />
          <CheckItem label="Mapeamentos configurados" status={mapStatus} detail={mapDetail} />
          <CheckItem label="Lançamentos registrados" status={lancStatus} detail={lancDetail} />
        </Section>

        {/* Compras */}
        <Section title="🛒 Módulo de Compras / Suprimentos">
          <CheckItem label="Entidade PurchaseRequest acessível" status={compStatus} detail={compDetail} />
          <CheckItem label="Compras vinculadas a rubricas" status={compRubricaStatus} detail={compRubricaDetail} />
          <CheckItem label="Linhas orçamentárias (BudgetLine MC3A)" status={blStatus} detail={blDetail} />
        </Section>

        {/* Usuários */}
        <Section title="👥 Usuários e Permissões">
          <CheckItem label="Usuários cadastrados" status={userStatus} detail={userDetail} />
          <CheckItem label="Permissões configuradas" status={permStatus} detail={permDetail} />
          <CheckItem label="Solicitações de acesso pendentes" status={pendRegStatus} detail={pendRegDetail} />
        </Section>

        {/* Relatórios */}
        <Section title="📋 Relatórios">
          <CheckItem label="Entidade Report acessível" status={reportStatus} detail={reportDetail} />
        </Section>

        {/* Guia de verificação manual */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-4">
          <h3 className="font-bold text-black mb-3">📝 Checklist Manual — verificar antes de publicar</h3>
          <div className="space-y-2 text-sm text-gray-700">
            {[
              'Criar nova solicitação de compra e verificar se aparece na lista',
              'Abrir aba "Rubricas" em Suprimentos e confirmar que as rubricas aparecem',
              'Acessar detalhe de uma rubrica e adicionar um lançamento manual',
              'Verificar se o saldo da rubrica foi atualizado após o lançamento',
              'Criar/editar usuário em Gestão de Usuários e salvar',
              'Editar permissões de um usuário e confirmar salvamento',
              'Submeter um relatório e verificar notificação ao coordenador',
              'Testar aprovação de solicitação de compra como coordenador',
              'Verificar upload de documento em compra',
              'Acessar Dashboard Financeiro e confirmar dados',
              'Testar exportação Excel/PDF de relatório',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 border border-gray-400 rounded flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function ChecklistProducao() {
  return <RequireAuth requireRole={['ADMIN', 'COORDENADOR']}><ChecklistInner /></RequireAuth>;
}