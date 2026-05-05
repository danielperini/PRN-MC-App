import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isCoordenador } from '@/components/auth/permissions';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import PurchaseCard from '@/components/compras/PurchaseCard';
import RubricasGrid from '@/components/rubricas/RubricasGrid';
import TeamManager from '@/components/compras/TeamManager';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import { Plus, RefreshCw } from 'lucide-react';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'QUITADO']);

function normalizeStatus(s) {
  return String(s || '').toUpperCase().trim();
}

function fmtBRL(value) {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function getPurchaseValue(p) {
  return (
    p?.valor_aprovado_admin ??
    p?.valor_aprovado ??
    p?.valor_pago ??
    p?.valor_total ??
    p?.valor_solicitado ??
    0
  );
}

function getPurchaseFileUrl(p, attachmentByPurchaseId) {
  return (
    p?.nota_fiscal_url ||
    p?.comprovante_url ||
    p?.orcamento_url ||
    attachmentByPurchaseId?.[p?.id] ||
    null
  );
}

export default function Compras() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const coordenador = isCoordenador(currentUser);

  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [filterStatus, setFilterStatus] = useState('TODOS');

  // Purchases
  const { data: purchases = [], isLoading: loadingPurchases, refetch: refetchPurchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 200),
    enabled: !!currentUser,
  });

  // Rubricas
  const { data: rubricas = [], refetch: refetchRubricas } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list(),
    enabled: coordenador,
  });

  // Attachments (para links de documentos)
  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments-compras'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 500),
    enabled: !!currentUser,
  });

  const attachmentByPurchaseId = React.useMemo(() => {
    const map = {};
    for (const att of attachments) {
      if (att.report_id && !map[att.report_id]) {
        map[att.report_id] = att.file_url;
      }
    }
    return map;
  }, [attachments]);

  // Filtragem de compras
  const filteredPurchases = React.useMemo(() => {
    let list = purchases;

    if (!coordenador) {
      const email = String(currentUser?.email || '').toLowerCase();
      list = list.filter((p) =>
        String(p.created_by || '').toLowerCase() === email ||
        String(p.user_email || '').toLowerCase() === email ||
        String(p.solicitante_email || '').toLowerCase() === email
      );
    }

    if (filterStatus !== 'TODOS') {
      list = list.filter((p) => normalizeStatus(p.status) === filterStatus);
    }

    return list;
  }, [purchases, coordenador, currentUser, filterStatus]);

  const meusPagamentos = React.useMemo(() => {
    const email = String(currentUser?.email || '').toLowerCase();
    return purchases.filter((p) => {
      const isMine = coordenador || (
        String(p.created_by || '').toLowerCase() === email ||
        String(p.user_email || '').toLowerCase() === email ||
        String(p.solicitante_email || '').toLowerCase() === email
      );
      return isMine && STATUS_APROVADOS.has(normalizeStatus(p.status));
    });
  }, [purchases, coordenador, currentUser]);

  const tabs = [
    { id: 'lista', label: 'Solicitações' },
    { id: 'meus_pagamentos', label: 'Meus Pagamentos' },
    ...(coordenador ? [{ id: 'aprovacoes', label: 'Aprovações' }] : []),
    ...(coordenador ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
    { id: 'documentos', label: 'Documentos' },
    ...(coordenador ? [{ id: 'equipe', label: 'Equipe' }] : []),
  ];

  function handleNewPurchase() {
    setEditingPurchase(null);
    setShowForm(true);
  }

  function handleEditPurchase(purchase) {
    setEditingPurchase(purchase);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingPurchase(null);
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  }

  const STATUS_OPTIONS = [
    'TODOS',
    'RASCUNHO',
    'SOLICITADO',
    'APROVADO_COORD',
    'APROVADO_ADMIN',
    'RECUSADO',
    'CANCELADO',
    'PAGO',
  ];

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compras e Pagamentos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie solicitações de compra e pagamentos do projeto
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetchPurchases()}
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={handleNewPurchase}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Nova solicitação
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 mb-6 flex w-fit gap-1 overflow-x-auto rounded-none bg-gray-100 p-1 px-4 md:-mx-6 md:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-white text-black shadow' : 'text-gray-500 hover:text-black'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Lista de Solicitações */}
      {tab === 'lista' && (
        <div className="space-y-4">
          {/* Filtro de status */}
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                }`}
              >
                {s === 'TODOS' ? 'Todos' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {loadingPurchases ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Nenhuma solicitação encontrada.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPurchases.map((p) => (
                <PurchaseCard
                  key={p.id}
                  purchase={p}
                  currentUser={currentUser}
                  isCoordenador={coordenador}
                  onEdit={() => handleEditPurchase(p)}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['purchases'] })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Meus Pagamentos */}
      {tab === 'meus_pagamentos' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Meus Pagamentos</h2>

          {meusPagamentos.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">
              Nenhum pagamento aprovado encontrado.
            </div>
          ) : (
            <div className="space-y-2">
              {meusPagamentos.map((p) => {
                const valor = getPurchaseValue(p);
                const fileUrl = getPurchaseFileUrl(p, attachmentByPurchaseId);

                return (
                  <div
                    key={p.id}
                    className="border rounded-lg p-3 flex justify-between items-center bg-white"
                  >
                    <div>
                      <p className="font-medium text-sm">{p.descricao_item || '—'}</p>
                      <p className="text-xs text-gray-500">{p.fornecedor_nome || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Status: <span className="font-medium text-gray-600">{p.status || '—'}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtBRL(valor)}</p>
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          Ver documento
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Aprovações (coordenadores) */}
      {tab === 'aprovacoes' && coordenador && (
        <AprovacoesFila
          purchases={purchases}
          currentUser={currentUser}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['purchases'] })}
        />
      )}

      {/* Tab: Rubricas */}
      {tab === 'rubricas' && coordenador && (
        <RubricasGrid
          rubricas={rubricas}
          onRefresh={() => refetchRubricas()}
        />
      )}

      {/* Tab: Documentos */}
      {tab === 'documentos' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Documentos</h2>
          <p className="text-sm text-gray-500">
            Acesse o módulo de{' '}
            <a href="/EntradaUnica" className="text-blue-600 underline">
              Entrada Única de Documentos
            </a>{' '}
            para enviar notas fiscais e outros documentos.
          </p>
        </div>
      )}

      {/* Tab: Equipe */}
      {tab === 'equipe' && coordenador && (
        <TeamManager currentUser={currentUser} />
      )}

      {/* Modal de nova/edição de solicitação */}
      {showForm && (
        <PurchaseFormDialog
          purchase={editingPurchase}
          currentUser={currentUser}
          isCoordenador={coordenador}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}