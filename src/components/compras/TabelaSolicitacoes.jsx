import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Pencil, Trash2, CheckCircle2, RotateCcw, XCircle, Bell, Loader2, LinkIcon, ExternalLink, FileText, FileCode2, HardDrive, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { normalizeStatus } from '@/lib/normalizeStatus';
import { isFinanciallyActiveStatus } from '@/utils/finance/financeiroUtils';

const STATUS_CONFIG = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-amber-100 text-amber-700' },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700' }
};

const CENTROS = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Noturno Pampulha', 'Publicações', 'Geral'];

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_ELEGIVEIS_PAGAMENTO = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_AGUARDANDO_PAGAMENTO = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADA']);

function getNFDateSortKey(p) {
  const d = p.nf_data_emissao || p.data_nf || p.data_emissao_nf || p.aprov_admin_data || p.aprov_coord_data || p.created_date || '';
  return d ? String(d).split('T')[0] : '0000-00-00';
}

function sortByNFDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = getNFDateSortKey(a);
    const db = getNFDateSortKey(b);
    if (da === db) {
      // desempate: created_date desc
      return String(b.created_date || '').localeCompare(String(a.created_date || ''));
    }
    return db.localeCompare(da);
  });
}

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function normalizeCentro(value) {
  const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'mis' || raw === 'mis bh' || raw.includes('imagem e som')) return 'MIS';
  if (raw === 'mhab' || raw === 'mab' || raw.includes('abilio')) return 'MHAB';
  if (raw === 'mumo' || raw.includes('moda')) return 'MUMO';
  if (raw === 'geral' || raw === 'geral/transversal' || raw === 'atuacao geral') return 'Geral';
  if (raw === 'rateado') return 'Rateado';
  if (raw === 'publicacoes' || raw === 'publicações') return 'Publicações';
  if (raw.includes('pampulha')) return 'Noturno Pampulha';
  // "Noturno 2026" (legado) e "Noturno nos Museus 2026" (canônico atual) → mesmo bucket
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  return String(value || '').trim();
}

function getPurchaseValue(p) {
  return toNumber(p?.valor_pago) || toNumber(p?.valor_aprovado_admin) || toNumber(p?.valor_aprovado) || toNumber(p?.valor_final) || toNumber(p?.valor_solicitado) || toNumber(p?.valor_total) || toNumber(p?.valor) || 0;
}

function getComprovantePagamentoUrl(purchase = {}) {
  return purchase.comprovante_pagamento_url || purchase.comprovante_url || purchase.payment_receipt_url || purchase.recibo_url || '';
}

function formatDateTimeBR(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isCompraEquipe(purchase) {
  const raw = [purchase?.tipo_origem, purchase?.origem, purchase?.categoria, purchase?.descricao_item].map((v) => String(v || '').toLowerCase()).join(' ');
  return !!purchase?.team_payment_id || raw.includes('team') || raw.includes('equipe');
}

function isCompraEquipeSalario(purchase) {
  if (!purchase) return false;
  if (!!purchase.team_payment_id) return true;
  const raw = [purchase?.tipo_origem, purchase?.origem, purchase?.categoria, purchase?.tipo_solicitacao, purchase?.descricao_item, purchase?.observacoes].map((v) => String(v || '').toLowerCase()).join(' ');
  return (
    raw.includes('team') ||
    raw.includes('equipe') ||
    raw.includes('monitores') ||
    raw.includes('educadores') ||
    raw.includes('coordenadoria') ||
    raw.includes('pagamento da equipe') ||
    raw.includes('pagamento equipe')
  );
}

function categorizeSolicitacoes(purchases) {
  const categories = { geral: [], mhab: [], mis: [], mumo: [], noturno2026: [], noturnoPampulha: [], pessoas: [] };
  purchases.forEach((p) => {
    if (isCompraEquipe(p)) { categories.pessoas.push(p); }
    else {
      const centro = normalizeCentro(p?.centro_custo);
      if (centro === 'MHAB') categories.mhab.push(p);
      else if (centro === 'MIS') categories.mis.push(p);
      else if (centro === 'MUMO') categories.mumo.push(p);
      else if (centro === 'Noturno nos Museus 2026') categories.noturno2026.push(p);
      else if (centro === 'Noturno Pampulha') categories.noturnoPampulha.push(p);
      else categories.geral.push(p);
    }
  });
  return categories;
}

// Tooltip simples via title HTML nativo + wrapper para tooltip visual
function Tooltip({ content, children }) {
  return (
    <span title={content} className="cursor-default">
      {children}
    </span>
  );
}

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronUp className="ml-1 inline h-3 w-3 text-gray-300" />;
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 inline h-3 w-3 text-gray-600" />
    : <ChevronDown className="ml-1 inline h-3 w-3 text-gray-600" />;
}

function FilesCell({ p }) {
  // Drive backup
  const driveUrl = p.drive_backup_folder_url || p.drive_backup_nf_pdf_link || null;
  const hasBackup = p.drive_backup_status === 'concluido' || !!driveUrl;

  // PDF: prioridade backup drive, depois url armazenada
  const pdfUrl = p.drive_backup_nf_pdf_link || p.nota_fiscal_pdf_url || p.nota_fiscal_url || p.nf_pdf_url || null;

  // XML
  const xmlUrl = p.drive_backup_nf_xml_link || p.nota_fiscal_xml_url || p.xml_url || p.nf_xml_url || null;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* Backup badge */}
      {hasBackup ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
          ✔ Backup
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
          ⚠ Sem backup
        </span>
      )}

      {/* Drive */}
      {driveUrl ? (
        <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-700 underline underline-offset-1 hover:text-indigo-900">
          <HardDrive className="h-3 w-3" />Drive
        </a>
      ) : (
        <span className="text-gray-400 flex items-center gap-1"><HardDrive className="h-3 w-3" />—</span>
      )}

      {/* PDF */}
      {pdfUrl ? (
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 underline underline-offset-1 hover:text-blue-900">
          <FileText className="h-3 w-3" />PDF
        </a>
      ) : (
        <span className="text-gray-400 flex items-center gap-1"><FileText className="h-3 w-3" />—</span>
      )}

      {/* XML */}
      {xmlUrl ? (
        <a href={xmlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-green-700 underline underline-offset-1 hover:text-green-900">
          <FileCode2 className="h-3 w-3" />XML
        </a>
      ) : (
        <span className="text-gray-400 flex items-center gap-1"><FileCode2 className="h-3 w-3" />—</span>
      )}
    </div>
  );
}

const SORTABLE_COLS = ['natureza', 'fornecedor', 'rubrica', 'centro', 'status', 'valor', 'data_nf'];

function formatDateBR(value) {
  if (!value) return '';
  // Se já vier no formato YYYY-MM-DD
  const parts = String(value).split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

function RenderTabela({ items, rubricaById, isCoordenador, podeAprovar, currentUser, onDelete, onApprove, onReturn, onUnapprove, onMarkPaid, onAccess, onCentroUpdated, onCentroCustoSaved, sendingNotif, handleSendNotification }) {
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [editingDataNF, setEditingDataNF] = useState(null); // id da linha em edição
  const [dataNFValue, setDataNFValue] = useState('');
  const [editingCentroId, setEditingCentroId] = useState(null); // id da linha em edição
  const [centroValue, setCentroValue] = useState('');
  const [savingCentro, setSavingCentro] = useState(false);

  async function handleSaveCentro(p, newValue) {
    setEditingCentroId(null);
    if (!newValue || newValue === (p.centro_custo || '')) return;

    const aprovado = STATUS_APROVADOS.has(normalizeStatus(p.status));
    // Atualização otimista imediata — sem esperar o servidor
    const updatedRecord = { ...p, centro_custo: newValue };
    onCentroUpdated?.(updatedRecord);

    setSavingCentro(true);
    try {
      if (aprovado && p.rubrica_debitada_em && p.rubrica_id) {
        const res = await base44.functions.invoke('purchaseActions', {
          action: 'trocar_rubrica',
          purchaseId: p.id,
          novaRubricaId: p.rubrica_id,
          novoCentroCusto: newValue,
          novoValor: getPurchaseValue(p),
        });
        const result = res?.data || res;
        if (result?.success === false) throw new Error(result?.error || 'Falha no reequilíbrio.');
        onCentroCustoSaved?.(p.id, newValue);
        // Reconcilia com dados do servidor se disponíveis
        if (result?.purchase) onCentroUpdated?.(result.purchase);
        toast.success('Centro de custo atualizado e saldo da rubrica reequilibrado.');
      } else {
        await base44.entities.PurchaseRequest.update(p.id, { centro_custo: newValue });
        onCentroCustoSaved?.(p.id, newValue);
        toast.success('Centro de custo atualizado.');
      }
    } catch (e) {
      // Reverte o cache otimista se o servidor falhou
      onCentroUpdated?.(p);
      toast.warning('Erro ao salvar centro de custo: ' + (e?.message || 'desconhecido'));
    } finally {
      setSavingCentro(false);
    }
  }

  function handleSort(field) {
    if (!SORTABLE_COLS.includes(field)) return;
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    // Ordenação padrão: data da NF decrescente (mais recente no topo)
    if (!sortField) return sortByNFDateDesc(items);
    return [...items].sort((a, b) => {
      let va = '', vb = '';
      const ra = a.rubrica_id ? rubricaById[a.rubrica_id] : null;
      const rb = b.rubrica_id ? rubricaById[b.rubrica_id] : null;

      if (sortField === 'natureza') {
        va = ra ? `${ra.natureza_despesa || ''} ${ra.nome_natureza || ''}` : (a.natureza_despesa || '');
        vb = rb ? `${rb.natureza_despesa || ''} ${rb.nome_natureza || ''}` : (b.natureza_despesa || '');
      } else if (sortField === 'fornecedor') {
        va = a.fornecedor_nome || a.nf_emitente_nome || '';
        vb = b.fornecedor_nome || b.nf_emitente_nome || '';
      } else if (sortField === 'rubrica') {
        va = ra ? (ra.grupo || '') + (ra.rubrica || '') : (a.rubrica_nome || '');
        vb = rb ? (rb.grupo || '') + (rb.rubrica || '') : (b.rubrica_nome || '');
      } else if (sortField === 'centro') {
        va = a._centro_custo_normalizado || '';
        vb = b._centro_custo_normalizado || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      } else if (sortField === 'valor') {
        return sortDir === 'asc' ? getPurchaseValue(a) - getPurchaseValue(b) : getPurchaseValue(b) - getPurchaseValue(a);
      }
      if (sortField === 'data_nf') {
        const da = a.nf_data_emissao || a.aprov_admin_data || a.aprov_coord_data || a.created_date || '';
        const db = b.nf_data_emissao || b.aprov_admin_data || b.aprov_coord_data || b.created_date || '';
        const cmp = da.localeCompare(db);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const cmp = String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortField, sortDir, rubricaById]);

  function ThSortable({ field, className = '', children }) {
    const sortable = SORTABLE_COLS.includes(field);
    return (
      <th
        className={`px-3 py-3 font-medium text-gray-600 ${sortable ? 'cursor-pointer select-none hover:text-gray-900' : ''} ${className}`}
        onClick={sortable ? () => handleSort(field) : undefined}
      >
        {children}
        {sortable && <SortIcon field={field} sortField={sortField} sortDir={sortDir} />}
      </th>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-left">
          <ThSortable field="descricao" className="w-[18%]">Descrição</ThSortable>
          <ThSortable field="natureza" className="w-[12%]">Natureza</ThSortable>
          <th className="px-3 py-3 font-medium text-gray-600 w-[5%] text-center">Cód.</th>
          <ThSortable field="fornecedor" className="w-[12%]">Fornecedor</ThSortable>
          <ThSortable field="centro" className="w-[7%]">Centro</ThSortable>
          <ThSortable field="rubrica" className="w-[14%]">Rubrica</ThSortable>
          <ThSortable field="status" className="w-[9%]">Status</ThSortable>
          <ThSortable field="valor" className="w-[7%] text-right">Valor</ThSortable>
          <ThSortable field="data_nf" className="w-[8%] text-center">Data NF</ThSortable>
          <th className="px-3 py-3 font-medium text-gray-600 w-[9%] text-center">Arquivos</th>
          <th className="px-3 py-3 font-medium text-gray-600 w-[8%] text-center">Ações</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => {
          const statusKey = normalizeStatus(p.status);
          const status = STATUS_CONFIG[statusKey] || { label: p.status || '—', color: 'bg-gray-100 text-gray-600' };
          const aprovado = STATUS_APROVADOS.has(statusKey);
          const pendenteAprovacao = !aprovado && statusKey !== 'RECUSADO' && statusKey !== 'CANCELADO';
          const rubrica = p.rubrica_id ? rubricaById[p.rubrica_id] : null;

          // Natureza da despesa
          const naturezaCodigo = rubrica?.natureza_despesa || rubrica?.numero_natureza || p.natureza_despesa || '';
          const naturezaNome = rubrica?.nome_natureza || rubrica?.nome || '';
          const naturezaDisplay = naturezaCodigo && naturezaNome
            ? `${naturezaCodigo} – ${naturezaNome}`
            : naturezaCodigo || naturezaNome || '—';

          // Rubrica: grupo + nome em 2 linhas
          const rubricaGrupo = rubrica?.grupo || '';
          const rubricaNome = rubrica?.rubrica || rubrica?.nome || p?.rubrica_nome || p?.rubrica || '—';
          const rubricaTooltip = [rubricaGrupo, rubricaNome].filter(Boolean).join(' › ');

          const valor = getPurchaseValue(p);
          const comprovantePagamentoUrl = getComprovantePagamentoUrl(p);
          const pago = statusKey === 'PAGO';
          const aguardandoPagamento = STATUS_AGUARDANDO_PAGAMENTO.has(statusKey) && !pago;
          const comprovantePendente = pago && !comprovantePagamentoUrl;
          const pagoEmFormatado = formatDateTimeBR(p.pago_em || p.data_pagamento);
          const compraEquipe = isCompraEquipe(p);
          const menuAberto = menuOpenId === p.id;
          const podeEditarAprovada = isCoordenador && aprovado;
          const podeAcessar = !aprovado || podeEditarAprovada;
          const podeMarcarPago = podeAprovar && STATUS_ELEGIVEIS_PAGAMENTO.has(statusKey);

          const descricaoCompleta = p.descricao_item || p.objeto || '—';
          const fornecedorNome = p.fornecedor_nome || p.nf_emitente_nome || '—';
          const fornecedorCNPJ = p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj || '';

          const tdStyle = { whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.3' };

          return (
            <tr key={p.id} className={`border-b align-top transition-colors ${
              aguardandoPagamento
                ? 'border-orange-200 bg-orange-50/40 hover:bg-orange-50'
                : `border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`
            }`}>

              {/* Descrição — até 3 linhas com tooltip */}
              <td className="px-3 py-2.5" style={tdStyle}>
                {(p.duplicada_financeira === true || p.incluir_no_somatorio === false) && (
                  <div className="mb-1 rounded bg-red-50 px-2 py-0.5 text-[10px] text-red-700 font-medium border border-red-100">
                    ⚠ Duplicata financeira detectada. Este lançamento não entra no somatório.
                  </div>
                )}
                <Tooltip content={descricaoCompleta}>
                  <p className="font-medium text-gray-900" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {descricaoCompleta}
                  </p>
                </Tooltip>
                {p.meta_id && (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {p.meta_id === 'MC3A-EXTRA' && p.meta_extra_descricao ? p.meta_extra_descricao : p.meta_id}
                  </p>
                )}
                {compraEquipe && (
                  <span className="mt-1 inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">Equipe</span>
                )}
              </td>

              {/* Natureza da Despesa */}
              <td className="px-3 py-2.5" style={tdStyle}>
                <Tooltip content={naturezaDisplay}>
                  <span className="text-xs text-gray-700">{naturezaDisplay}</span>
                </Tooltip>
              </td>

              {/* Código Nº 4 do orçamento */}
              <td className="px-3 py-2.5 text-center" style={tdStyle}>
                {(() => {
                  const codDisplay = p.cod || rubrica?.codigo;
                  const statusCod = p.status_cod;
                  if (codDisplay) {
                    return (
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-block rounded px-1.5 py-0.5 font-mono text-xs bg-amber-100 text-amber-800">{codDisplay}</span>
                        {statusCod === 'REVISAR' && (
                          <Tooltip content={p.motivo_revisao || 'Requer revisão manual'}>
                            <AlertTriangle className="h-3 w-3 text-amber-500 cursor-help flex-shrink-0" />
                          </Tooltip>
                        )}
                      </span>
                    );
                  }
                  if (statusCod === 'SEM_RUBRICA' || statusCod === 'SEM_CODIGO') {
                    return <span className="inline-block rounded px-1.5 py-0.5 font-mono text-xs bg-gray-100 text-gray-400">?</span>;
                  }
                  return <span className="text-gray-300 text-xs">—</span>;
                })()}
              </td>

              {/* Fornecedor */}
              <td className="px-3 py-2.5" style={tdStyle}>
                <Tooltip content={`${fornecedorNome}${fornecedorCNPJ ? '\n' + fornecedorCNPJ : ''}`}>
                  <p className="text-xs font-medium text-gray-800">{fornecedorNome}</p>
                  {fornecedorCNPJ && <p className="text-[11px] text-gray-400">{fornecedorCNPJ}</p>}
                </Tooltip>
              </td>

              {/* Centro — editável inline para coordenadores/admin */}
              <td className="px-3 py-2.5" style={tdStyle}>
                {editingCentroId === p.id ? (
                  <select
                    autoFocus
                    value={centroValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCentroValue(value);
                      handleSaveCentro(p, value);
                    }}
                    disabled={savingCentro}
                    className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {!CENTROS.includes(p.centro_custo) && p.centro_custo && (
                      <option value={p.centro_custo}>{p.centro_custo}</option>
                    )}
                    {CENTROS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : isCoordenador ? (
                  <button
                    type="button"
                    title="Clique para editar o centro de custo"
                    onClick={() => { setEditingCentroId(p.id); setCentroValue(p.centro_custo || ''); }}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {p._centro_custo_normalizado || '—'}
                  </button>
                ) : p._centro_custo_normalizado ? (
                  <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{p._centro_custo_normalizado}</span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>

              {/* Rubrica: grupo + nome */}
              <td className="px-3 py-2.5" style={tdStyle}>
                <Tooltip content={rubricaTooltip}>
                  {rubricaGrupo && <p className="text-[11px] text-gray-400">{rubricaGrupo}</p>}
                  <p className="text-xs text-gray-800">{rubricaNome}</p>
                </Tooltip>
              </td>

              {/* Status */}
              <td className={`py-2.5 ${aguardandoPagamento ? 'pl-2 border-l-4 border-orange-400' : 'px-3'}`} style={tdStyle}>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${aguardandoPagamento ? 'bg-orange-100 text-orange-800' : status.color}`}>{status.label}</span>
                {aguardandoPagamento && (
                  <p className="mt-0.5 text-[11px] font-semibold text-orange-700">⏳ Aguardando pagamento</p>
                )}
                {pagoEmFormatado && <p className="mt-1 text-[11px] leading-tight text-gray-400">{pagoEmFormatado}</p>}
                {comprovantePendente && (
                  <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Comprovante pendente</span>
                )}
                {/* Badges de auditoria financeira */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {isFinanciallyActiveStatus(p.status) ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">✓ No somatório</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">Fora do somatório</span>
                  )}
                  {(p.duplicada_financeira === true || p.incluir_no_somatorio === false) && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                      <AlertTriangle className="h-2.5 w-2.5" />Duplicata financeira
                    </span>
                  )}
                </div>
              </td>

              {/* Valor */}
              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900" style={tdStyle}>
                {fmtBRL(valor)}
              </td>

              {/* Data NF — editável inline */}
              <td className="px-3 py-2.5 text-center" style={tdStyle}>
                {editingDataNF === p.id ? (
                  <input
                    autoFocus
                    type="date"
                    value={dataNFValue}
                    onChange={(e) => setDataNFValue(e.target.value)}
                    onBlur={async () => {
                      setEditingDataNF(null);
                      if (dataNFValue !== (p.nf_data_emissao || '')) {
                        // Atualização otimista imediata
                        onCentroUpdated?.({ ...p, nf_data_emissao: dataNFValue });
                        try {
                          await base44.entities.PurchaseRequest.update(p.id, { nf_data_emissao: dataNFValue });
                          toast.success('Data de emissão atualizada.');
                        } catch {
                          // Reverte em caso de erro
                          onCentroUpdated?.(p);
                          toast.error('Erro ao salvar data de emissão.');
                        }
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingDataNF(null); }}
                    className="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <button
                    type="button"
                    title="Clique para editar a data de emissão"
                    onClick={() => { setEditingDataNF(p.id); setDataNFValue(p.nf_data_emissao || ''); }}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-blue-50 hover:text-blue-700 ${p.nf_data_emissao ? 'text-gray-700' : 'text-gray-300'}`}
                  >
                    {p.nf_data_emissao ? formatDateBR(p.nf_data_emissao) : '—'}
                  </button>
                )}
              </td>

              {/* Arquivos */}
              <td className="px-3 py-2.5 text-center">
                <FilesCell p={p} />
              </td>

              {/* Ações */}
              <td className="px-3 py-2.5">
                <div className="relative flex items-center justify-center gap-1">
                  {podeAcessar && (
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAccess(p); }} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-black" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isCoordenador && (
                    <button type="button" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm('Tem certeza que deseja deletar esta solicitação?')) await onDelete(p.id); }} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Deletar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {podeMarcarPago && (
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkPaid?.(p); }} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${pago ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'}`} title={pago ? 'Comprovante' : 'Marcar pago'}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(menuAberto ? null : p.id); }} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700" title="Mais ações">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>
                  </button>
                  {menuAberto && (
                    <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onAccess(p); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"><LinkIcon className="h-3.5 w-3.5" />Acessar solicitação</button>
                      {podeAprovar && pendenteAprovacao && (<>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onApprove(p); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-green-700 hover:bg-green-50"><CheckCircle2 className="h-3.5 w-3.5" />Aprovar</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onReturn(p); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"><RotateCcw className="h-3.5 w-3.5" />Devolver</button>
                      </>)}
                      {podeAprovar && aprovado && (
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onUnapprove(p); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><XCircle className="h-3.5 w-3.5" />Desaprovar</button>
                      )}
                      <div className="my-1 h-px bg-gray-100" />
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); handleSendNotification(p); }} disabled={sendingNotif[p.id]} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                        {sendingNotif[p.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                        Enviar Notificação
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TabelaSolicitacoes({ purchases, rubricas, attachmentByPurchaseId, isCoordenador, currentUser, podeAprovarSolicitacoes, hasGestaoCompras, onDelete, onApprove, onReturn, onUnapprove, onMarkPaid, onAccess, onCentroUpdated, onCentroCustoSaved, userPermission, canSeeEquipeSalarios }) {
  const [sendingNotif, setSendingNotif] = useState({});
  // Segunda camada de segurança: se canSeeEquipeSalarios for explicitamente false,
  // filtra qualquer compra de equipe/salário que tenha vazado até aqui
  const canSee = canSeeEquipeSalarios !== false ? true : isCoordenador;
  const purchasesFiltered = canSee ? (purchases || []) : (purchases || []).filter(p => !isCompraEquipeSalario(p));

  async function handleSendNotification(p) {
    const valor = getPurchaseValue(p);
    const fornecedor = p.fornecedor_nome || p.nf_emitente_nome || '—';
    const descricao = p.descricao_item || p.objeto || '—';
    const centro = p._centro_custo_normalizado || p.centro_custo || '—';
    const nfNum = p.nf_numero ? ` · NF ${p.nf_numero}` : '';
    const texto = [`Fornecedor: ${fornecedor}`, `Descrição: ${descricao}`, `Centro de custo: ${centro}`, `Valor: ${fmtBRL(valor)}${nfNum}`, '', 'Enviar notificação de aprovação para Daniel Perini?'].join('\n');
    if (!window.confirm(texto)) return;
    setSendingNotif((s) => ({ ...s, [p.id]: true }));
    try {
      await base44.functions.invoke('notifyPurchaseApprovedToFinanceiro', { purchaseId: p.id, action: 'send_approval', recipients: ['danielperini.mc@viadutodasartes.org.br', 'daniel@periniprojetos.com.br'] });
      toast.success('Notificação enviada com sucesso.');
    } catch (e) {
      toast.error('Erro ao enviar notificação: ' + (e?.message || 'desconhecido'));
    } finally {
      setSendingNotif((s) => ({ ...s, [p.id]: false }));
    }
  }

  const rubricaById = useMemo(() => {
    const m = {};
    (rubricas || []).forEach((r) => { if (r?.id) m[r.id] = r; });
    return m;
  }, [rubricas]);

  if (!purchasesFiltered || purchasesFiltered.length === 0) return null;

  const podeAprovar = isCoordenador || podeAprovarSolicitacoes === true || hasGestaoCompras === true;
  const categories = categorizeSolicitacoes(purchasesFiltered);
  const isObservador = !isCoordenador && userPermission?.base_role === 'OBSERVADOR';

  const museusCentroCategories = [
    { key: 'geral', label: 'Geral', visible: isCoordenador },
    { key: 'mhab', label: 'MHAB', visible: !isObservador },
    { key: 'mis', label: 'MIS', visible: !isObservador },
    { key: 'mumo', label: 'MUMO', visible: !isObservador },
    { key: 'pessoas', label: 'Pessoas', visible: isCoordenador }
  ].filter((cat) => cat.visible && categories[cat.key].length > 0);

  const noturnoCategorias = [
    { key: 'noturno2026', label: 'Noturno 2026', visible: true },
    { key: 'noturnoPampulha', label: 'Noturno Pampulha', visible: true }
  ].filter((cat) => cat.visible && categories[cat.key].length > 0);

  const sharedProps = { rubricaById, isCoordenador, podeAprovar, currentUser, onDelete, onApprove, onReturn, onUnapprove, onMarkPaid, onAccess, onCentroUpdated, onCentroCustoSaved, sendingNotif, handleSendNotification };

  return (
    <div className="space-y-8">
      {museusCentroCategories.map((cat) => (
        <div key={cat.key}>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{cat.label}</h3>
            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{categories[cat.key].length}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <RenderTabela items={categories[cat.key]} {...sharedProps} />
          </div>
        </div>
      ))}

      {noturnoCategorias.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-purple-200" />
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700">Noturno nos Museus</span>
            <div className="h-px flex-1 bg-purple-200" />
          </div>
          {noturnoCategorias.map((cat) => (
            <div key={cat.key}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-lg font-semibold text-purple-900">{cat.label}</h3>
                <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{categories[cat.key].length}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-purple-200">
                <RenderTabela items={categories[cat.key]} {...sharedProps} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}