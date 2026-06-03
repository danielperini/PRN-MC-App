import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  Pencil,
  Trash2,
  X,
  Eye,
  ShieldAlert,
  FileWarning,
  DollarSign,
} from 'lucide-react';

/* ─── helpers ─── */
function fmtBRL(value) {
  const n = toNumber(value);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function csvEscape(v) {
  const t = String(v ?? '');
  if (/[;"\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
function STATUS_APROVADOS(status) {
  return new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']).has(String(status || '').toUpperCase());
}

/* ─── categorização das linhas de auditoria ─── */
function categorize(solicitacoes) {
  const duplicidade = [];
  const rubricaIncompativel = [];
  const erroFinanceiro = [];
  const semDocumento = [];

  solicitacoes.forEach((linha) => {
    let added = false;
    if (linha.issues.some((i) => i.toLowerCase().includes('duplicidade'))) {
      duplicidade.push({ ...linha, motivoDuplicidade: linha.issues.find((i) => i.toLowerCase().includes('duplicidade')) || '' });
      added = true;
    }
    if (linha.issues.some((i) => i.toLowerCase().includes('rubrica possivelmente'))) {
      rubricaIncompativel.push(linha);
      added = true;
    }
    if (linha.issues.some((i) =>
      i.toLowerCase().includes('valor zerado') ||
      i.toLowerCase().includes('débito financeiro') ||
      i.toLowerCase().includes('saldo')
    )) {
      erroFinanceiro.push(linha);
      added = true;
    }
    if (!linha.hasPdf || linha.issues.some((i) => i.toLowerCase().includes('sem documento') || i.toLowerCase().includes('sem xml'))) {
      semDocumento.push(linha);
      added = true;
    }
    // garantir que solicitações críticas sem nenhuma categoria apareçam em erroFinanceiro
    if (!added && linha.severity === 'critica') {
      erroFinanceiro.push(linha);
    }
  });

  return { duplicidade, rubricaIncompativel, erroFinanceiro, semDocumento };
}

/* ─── confirmação de exclusão ─── */
function ConfirmDeleteModal({ linha, onConfirm, onCancel }) {
  const isAprovada = STATUS_APROVADOS(linha?.status);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Confirmar exclusão</h3>
            <p className="mt-1 text-sm text-slate-600">
              Tem certeza que deseja excluir esta solicitação? Esta ação pode afetar rubricas e saldos.
            </p>
            {isAprovada && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>Atenção:</strong> Esta solicitação está aprovada. Antes de excluir, o valor da rubrica correspondente será estornado automaticamente.
              </div>
            )}
            {linha && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                <p><span className="font-medium">Fornecedor:</span> {linha.fornecedor || '—'}</p>
                <p><span className="font-medium">NF:</span> {linha.nf || '—'}</p>
                <p><span className="font-medium">Valor:</span> {fmtBRL(linha.valor)}</p>
                <p><span className="font-medium">Status:</span> {linha.statusLabel}</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Excluir solicitação
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── badge de severidade ─── */
function SeverityBadge({ severity }) {
  if (severity === 'critica') return <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Crítica</span>;
  if (severity === 'atencao') return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Atenção</span>;
  return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">OK</span>;
}

/* ─── linha de ação de uma solicitação ─── */
function LinhaAcao({ linha, onEdit, onDelete, onIgnore, showRubricaSugerida, showMotivo, showDocInfo }) {
  const fileUrl = linha.fileUrl || '';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={linha.severity} />
            {linha.nf && <span className="text-xs font-medium text-slate-500">NF {linha.nf}</span>}
            <span className="text-sm font-semibold text-slate-900 truncate">{linha.fornecedor || '—'}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{linha.descricao || '—'}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold tabular-nums text-slate-900">{fmtBRL(linha.valor)}</p>
          <p className="text-xs text-slate-500">{linha.statusLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {linha.centroAtual && <span><span className="font-medium">Centro:</span> {linha.centroAtual}</span>}
        {linha.rubricaAtual && <span><span className="font-medium">Rubrica:</span> {linha.rubricaAtual}</span>}
        {linha.metaAtual && <span><span className="font-medium">Meta:</span> {linha.metaAtual}</span>}
      </div>

      {showMotivo && linha.motivoDuplicidade && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          <span className="font-semibold">Motivo:</span> {linha.motivoDuplicidade}
        </p>
      )}

      {showRubricaSugerida && linha.rubricaSugerida && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <span className="font-semibold">Rubrica sugerida:</span> {linha.rubricaSugerida}
          {linha.centroSugerido ? ` · Centro: ${linha.centroSugerido}` : ''}
        </p>
      )}

      {showDocInfo && (
        <div className="flex gap-3 text-xs">
          <span className={linha.hasPdf ? 'text-emerald-700' : 'text-red-700'}>PDF/NF: {linha.hasPdf ? 'Sim' : 'Não'}</span>
          <span className={linha.hasXml ? 'text-emerald-700' : 'text-amber-700'}>XML/Comprovante: {linha.hasXml ? 'Sim' : 'Não'}</span>
        </div>
      )}

      {linha.issues.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-500">
          {linha.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => onEdit(linha)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <ExternalLink className="h-3 w-3" /> Abrir arquivo
          </a>
        )}
        <button
          onClick={() => onDelete(linha)}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <Trash2 className="h-3 w-3" /> Marcar para exclusão
        </button>
        <button
          onClick={() => onIgnore(linha)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <Eye className="h-3 w-3" /> Ignorar alerta
        </button>
      </div>
    </div>
  );
}

/* ─── seção dentro do modal ─── */
function Secao({ titulo, icon: Icon, count, cor, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const corClass = {
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  }[cor] || 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={`rounded-2xl border ${corClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">{titulo}</h3>
            <p className="text-xs opacity-75">{count} {count === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
        <span className="text-xs font-medium">{open ? '▲ Recolher' : '▼ Expandir'}</span>
      </button>
      {open && <div className="border-t border-current/10 p-4 space-y-3">{children}</div>}
    </div>
  );
}

/* ─── MODAL PRINCIPAL ─── */
export default function AuditoriaRevisaoModal({ solicitacoes, onClose, onEditPurchase, currentUser }) {
  const [ignorados, setIgnorados] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null); // linha a excluir
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [actionLog, setActionLog] = useState([]);

  const categorias = useMemo(() => {
    const visiveis = solicitacoes.filter((l) => !ignorados.has(l.id) && !deletedIds.has(l.id));
    return categorize(visiveis);
  }, [solicitacoes, ignorados, deletedIds]);

  const totalItens = categorias.duplicidade.length + categorias.rubricaIncompativel.length +
    categorias.erroFinanceiro.length + categorias.semDocumento.length;

  function logAction(linha, acao, detalhe = '') {
    setActionLog((prev) => [
      {
        id: linha.id,
        fornecedor: linha.fornecedor,
        nf: linha.nf,
        valor: linha.valor,
        acao,
        detalhe,
        usuario: currentUser?.email || 'Desconhecido',
        data: new Date().toLocaleString('pt-BR'),
      },
      ...prev,
    ]);
  }

  function handleIgnore(linha) {
    setIgnorados((prev) => new Set([...prev, linha.id]));
    logAction(linha, 'IGNORAR_ALERTA');
  }

  function handleDeleteRequest(linha) {
    setConfirmDelete(linha);
  }

  async function handleDeleteConfirm() {
    const linha = confirmDelete;
    if (!linha) return;
    setConfirmDelete(null);

    const isAprovada = STATUS_APROVADOS(linha.status);
    try {
      // Estornar rubrica se aprovada
      if (isAprovada && linha.rubricaId) {
        const rubrica = await base44.entities.Rubrica.get(linha.rubricaId).catch(() => null);
        if (rubrica) {
          const novoUtilizado = Math.max(0, toNumber(rubrica.valor_utilizado) - toNumber(linha.valor));
          const novoSaldo = toNumber(rubrica.valor_rubrica) - novoUtilizado;
          await base44.entities.Rubrica.update(rubrica.id, {
            valor_utilizado: novoUtilizado,
            saldo: novoSaldo,
            percentual_utilizado: rubrica.valor_rubrica > 0 ? (novoUtilizado / toNumber(rubrica.valor_rubrica)) * 100 : 0,
          }).catch(() => {});
        }
      }

      await base44.entities.PurchaseRequest.delete(linha.id);
      setDeletedIds((prev) => new Set([...prev, linha.id]));
      logAction(linha, 'EXCLUIR', isAprovada ? 'Rubrica estornada antes da exclusão' : '');
    } catch (err) {
      console.error('Erro ao excluir solicitação:', err);
      logAction(linha, 'ERRO_EXCLUSÃO', err?.message || 'Erro desconhecido');
    }
  }

  function handleEdit(linha) {
    logAction(linha, 'ABRIR_EDICAO');
    if (onEditPurchase) onEditPurchase(linha.id);
  }

  function exportarRelatorio() {
    const rows = [
      ['ID', 'Fornecedor', 'NF', 'Valor', 'Status', 'Categoria', 'Problemas', 'Ação realizada', 'Usuário', 'Data/hora'],
      ...actionLog.map((entry) => [
        entry.id, entry.fornecedor, entry.nf, entry.valor,
        '', '', entry.detalhe, entry.acao, entry.usuario, entry.data,
      ]),
    ];
    if (actionLog.length === 0) {
      // exportar todos os itens auditados mesmo sem ações
      const todos = [
        ...categorias.duplicidade.map((l) => ({ ...l, _categoria: 'Duplicidade' })),
        ...categorias.rubricaIncompativel.map((l) => ({ ...l, _categoria: 'Rubrica incompatível' })),
        ...categorias.erroFinanceiro.map((l) => ({ ...l, _categoria: 'Erro financeiro' })),
        ...categorias.semDocumento.map((l) => ({ ...l, _categoria: 'Sem documento' })),
      ];
      rows.push(...todos.map((l) => [l.id, l.fornecedor, l.nf, l.valor, l.statusLabel, l._categoria, l.issues.join(' | '), '', '', '']));
    }
    downloadCsv(`auditoria-revisao-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 p-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FileSearch className="h-4 w-4" />
                Auditoria de Solicitações
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Resultado da Auditoria — Solicitações para Revisão</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalItens} {totalItens === 1 ? 'item identificado' : 'itens identificados'} para revisão.
                Nenhuma alteração é feita automaticamente.
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex-shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo */}
          <div className="space-y-4 p-5">
            {totalItens === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium">Nenhum item pendente de revisão. Tudo verificado!</p>
              </div>
            )}

            {/* 1. Duplicidades */}
            {categorias.duplicidade.length > 0 && (
              <Secao titulo="Solicitações com possível duplicidade" icon={ShieldAlert} count={categorias.duplicidade.length} cor="red" defaultOpen>
                {categorias.duplicidade.map((linha) => (
                  <LinhaAcao
                    key={linha.id}
                    linha={linha}
                    showMotivo
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
                    onIgnore={handleIgnore}
                  />
                ))}
              </Secao>
            )}

            {/* 2. Rubrica incompatível */}
            {categorias.rubricaIncompativel.length > 0 && (
              <Secao titulo="Solicitações com rubrica incompatível" icon={AlertTriangle} count={categorias.rubricaIncompativel.length} cor="amber" defaultOpen>
                {categorias.rubricaIncompativel.map((linha) => (
                  <LinhaAcao
                    key={linha.id}
                    linha={linha}
                    showRubricaSugerida
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
                    onIgnore={handleIgnore}
                  />
                ))}
              </Secao>
            )}

            {/* 3. Erro financeiro */}
            {categorias.erroFinanceiro.length > 0 && (
              <Secao titulo="Solicitações com erro financeiro" icon={DollarSign} count={categorias.erroFinanceiro.length} cor="amber">
                {categorias.erroFinanceiro.map((linha) => (
                  <LinhaAcao
                    key={linha.id}
                    linha={linha}
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
                    onIgnore={handleIgnore}
                  />
                ))}
              </Secao>
            )}

            {/* 4. Sem documento */}
            {categorias.semDocumento.length > 0 && (
              <Secao titulo="Solicitações sem documento obrigatório" icon={FileWarning} count={categorias.semDocumento.length} cor="red">
                {categorias.semDocumento.map((linha) => (
                  <LinhaAcao
                    key={linha.id}
                    linha={linha}
                    showDocInfo
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
                    onIgnore={handleIgnore}
                  />
                ))}
              </Secao>
            )}

            {/* Log de ações */}
            {actionLog.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">Log de ações desta sessão</h4>
                <div className="space-y-1">
                  {actionLog.map((entry, i) => (
                    <div key={i} className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="font-medium">{entry.data}</span>
                      <span>·</span>
                      <span className="font-semibold text-slate-800">{entry.acao}</span>
                      <span>·</span>
                      <span>{entry.fornecedor} (NF {entry.nf || '—'}, {fmtBRL(entry.valor)})</span>
                      {entry.detalhe && <span>· {entry.detalhe}</span>}
                      <span className="text-slate-400">— {entry.usuario}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5">
            <button
              onClick={exportarRelatorio}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Exportar relatório da auditoria
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <ConfirmDeleteModal
          linha={confirmDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}