import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Loader2, ExternalLink, FileText, FileCode, Receipt, CloudUpload, CloudOff, CheckCircle2, AlertTriangle, FileX2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function PlainSelect({ value, onChange, items, placeholder, className }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 ${className || ''}`}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {items.map((it) => (
        <option key={it.value} value={it.value}>{it.label}</option>
      ))}
    </select>
  );
}

const STATUS_APROVADOS_SET = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function fmtBRL(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function getMesAnoEmissao(p) {
  const raw = String(p?.nf_data_emissao || '');
  if (!raw) return '';
  const d = new Date(raw.length >= 10 ? raw.substring(0, 10) + 'T12:00:00' : raw);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function temArquivoFiscal(p) {
  return !!(
    p?.nota_fiscal_url ||
    p?.nota_fiscal_pdf_url ||
    p?.nf_pdf_url ||
    p?.nota_fiscal_xml_url ||
    p?.xml_url ||
    p?.comprovante_url ||
    p?.comprovante_pagamento_url
  );
}

function getBackupStatus(p) {
  if (!temArquivoFiscal(p)) return 'sem_arquivo';
  if (p?.drive_backup_status === 'erro') return 'erro';
  if (p?.drive_backup_status === 'concluido' || p?.drive_backup_nf_ok === true) return 'concluido';
  if (p?.drive_backup_status === 'em_processamento') return 'em_processamento';
  // pendente padrão
  return 'pendente';
}

const STATUS_CONFIG = {
  concluido: { label: 'Concluído', className: 'bg-green-100 text-green-700 border-green-200', Icon: CheckCircle2 },
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-700 border-amber-200', Icon: CloudUpload },
  em_processamento: { label: 'Enviando', className: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Loader2 },
  erro: { label: 'Erro', className: 'bg-red-100 text-red-700 border-red-200', Icon: AlertTriangle },
  sem_arquivo: { label: 'Sem Arquivo', className: 'bg-gray-100 text-gray-500 border-gray-200', Icon: CloudOff },
};

function BackupBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  const { Icon } = cfg;
  const spinning = status === 'em_processamento';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <Icon className={`h-3 w-3 ${spinning ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function LinkIcon({ url, title, Icon }) {
  if (!url) return <Icon className="h-4 w-4 text-gray-200" aria-label={`Sem ${title}`} />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-black"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

const PAGE_SIZE = 25;

export default function BackupDriveTab() {
  const queryClient = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroAno, setFiltroAno] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [reenviandoId, setReenviandoId] = useState(null);
  const [reenviandoTodos, setReenviandoTodos] = useState(false);
  const [progressoTodos, setProgressoTodos] = useState({ atual: 0, total: 0 });
  const [limpandoMaquina, setLimpandoMaquina] = useState(false);

  // Busca todas as PurchaseRequests aprovadas/pagas (não filtra por dono — painel do coordenador)
  const { data: purchases = [], isLoading, isFetching } = useQuery({
    queryKey: ['backup-drive-aprovadas'],
    queryFn: async () => {
      const lista = await base44.entities.PurchaseRequest.list('-created_date', 500);
      return (lista || []).filter((p) => STATUS_APROVADOS_SET.has(p?.status));
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  // Polling leve: 30s enquanto houver itens em_processamento
  const temEmProcessamento = useMemo(
    () => purchases.some((p) => getBackupStatus(p) === 'em_processamento'),
    [purchases]
  );
  useQuery({
    queryKey: ['backup-drive-poll'],
    queryFn: async () => {
      const lista = await base44.entities.PurchaseRequest.list('-created_date', 500);
      return (lista || []).filter((p) => STATUS_APROVADOS_SET.has(p?.status));
    },
    enabled: temEmProcessamento,
    refetchInterval: temEmProcessamento ? 30000 : false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 10,
  });

  // Contadores
  const contadores = useMemo(() => {
    const c = { total_arquivo: 0, sincronizados: 0, pendentes: 0, erro: 0 };
    for (const p of purchases) {
      if (!temArquivoFiscal(p)) continue;
      c.total_arquivo++;
      const st = getBackupStatus(p);
      if (st === 'concluido') c.sincronizados++;
      else if (st === 'erro') c.erro++;
      else c.pendentes++;
    }
    return c;
  }, [purchases]);

  // Lista de meses/anos disponíveis
  const mesesAnosDisponiveis = useMemo(() => {
    const set = new Set();
    purchases.forEach((p) => {
      const ma = getMesAnoEmissao(p);
      if (ma) set.add(ma);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [purchases]);

  // Filtragem
  const filtradas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    return purchases.filter((p) => {
      if (!temArquivoFiscal(p) && filtroStatus !== 'sem_arquivo') {
        // sem arquivo: só aparece quando explicitamente filtrado
      }
      const st = getBackupStatus(p);
      if (filtroStatus !== 'all' && st !== filtroStatus) return false;
      const ma = getMesAnoEmissao(p);
      if (filtroMes || filtroAno) {
        if (!ma) return false;
        const [mes, ano] = ma.split('/');
        if (filtroMes && mes !== filtroMes) return false;
        if (filtroAno && ano !== filtroAno) return false;
      }
      if (buscaNorm) {
        const hay = `${p?.nf_numero || ''} ${p?.fornecedor_nome || ''} ${p?.nf_emitente_nome || ''} ${p?.descricao_item || ''}`.toLowerCase();
        if (!hay.includes(buscaNorm)) return false;
      }
      return true;
    });
  }, [purchases, filtroStatus, filtroMes, filtroAno, busca]);

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const inicio = paginaAtual * PAGE_SIZE;
  const paginaItens = filtradas.slice(inicio, inicio + PAGE_SIZE);

  React.useEffect(() => {
    setPagina(0);
  }, [filtroStatus, filtroMes, filtroAno, busca]);

  async function reenviarIndividual(p) {
    if (!p?.id) return;
    // Otimista: marca como em_processamento para feedback imediato
    queryClient.setQueryData(['backup-drive-aprovadas'], (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((item) =>
        item.id === p.id ? { ...item, drive_backup_status: 'em_processamento' } : item
      );
    });
    setReenviandoId(p.id);
    try {
      const resp = await base44.functions.invoke('backupDiarioNFsDrive', { ids: [p.id], limite: 1 });
      const result = resp?.data || resp;
      if (result?.ok === false) throw new Error(result?.error || 'Falha no reenvio');
      toast.success('Reenvio para o Drive concluído.');
      // Atualiza cache com dados frescos
      const fresco = await base44.entities.PurchaseRequest.get(p.id).catch(() => null);
      if (fresco) {
        queryClient.setQueryData(['backup-drive-aprovadas'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((item) => (item.id === p.id ? { ...item, ...fresco } : item));
        });
      }
    } catch (err) {
      toast.error('Erro ao reenviar: ' + (err?.message || 'erro desconhecido'));
      // Reverte para o status anterior
      const fresco = await base44.entities.PurchaseRequest.get(p.id).catch(() => null);
      if (fresco) {
        queryClient.setQueryData(['backup-drive-aprovadas'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((item) => (item.id === p.id ? { ...item, ...fresco } : item));
        });
      }
    } finally {
      setReenviandoId(null);
    }
  }

  async function reenviarTodosPendentes() {
    const pendentes = purchases.filter((p) => {
      const st = getBackupStatus(p);
      return st === 'pendente' || st === 'erro';
    });
    if (pendentes.length === 0) {
      toast.info('Não há itens pendentes para reenviar.');
      return;
    }
    setReenviandoTodos(true);
    setProgressoTodos({ atual: 0, total: pendentes.length });
    try {
      // Marca todos como em_processamento otimistamente
      queryClient.setQueryData(['backup-drive-aprovadas'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) => {
          const st = getBackupStatus(item);
          if (st !== 'pendente' && st !== 'erro') return item;
          return { ...item, drive_backup_status: 'em_processamento' };
        });
      });
      // Processa em lotes de 30 (limite suportado pela função)
      const LOTE = 30;
      let enviados = 0;
      for (let i = 0; i < pendentes.length; i += LOTE) {
        const loteIds = pendentes.slice(i, i + LOTE).map((p) => p.id);
        try {
          const resp = await base44.functions.invoke('backupDiarioNFsDrive', { ids: loteIds, limite: loteIds.length });
          const result = resp?.data || resp;
          if (result?.ok === false) {
            console.warn('Lote de reenvio retornou erro:', result?.error);
          }
        } catch (err) {
          console.warn('Erro no lote de reenvio:', err);
        }
        enviados += loteIds.length;
        setProgressoTodos({ atual: enviados, total: pendentes.length });
      }
      toast.success(`${pendentes.length} reenvio(s) disparado(s) para o Drive.`);
      // Atualiza cache com dados frescos
      await queryClient.invalidateQueries({ queryKey: ['backup-drive-aprovadas'] });
      await queryClient.refetchQueries({ queryKey: ['backup-drive-aprovadas'] });
    } catch (err) {
      toast.error('Erro ao reenviar todos: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setReenviandoTodos(false);
      setProgressoTodos({ atual: 0, total: 0 });
    }
  }

  async function limparNomesMaquina() {
    if (limpandoMaquina) return;
    setLimpandoMaquina(true);
    try {
      const dryResp = await base44.functions.invoke('renomearNFsDrive', { dryRun: true });
      const dry = dryResp?.data || dryResp;
      const totalRenomear = Number(dry?.total_renomeados ?? dry?.renomeados ?? dry?.total ?? 0);
      if (!totalRenomear) {
        toast.info('Nenhum arquivo de máquina encontrado para renomear.');
        setLimpandoMaquina(false);
        return;
      }
      const confirmar = window.confirm(
        `${totalRenomear} arquivo(s) serão renomeados no Drive. Confirmar renomeação?`
      );
      if (!confirmar) {
        setLimpandoMaquina(false);
        return;
      }
      const execResp = await base44.functions.invoke('renomearNFsDrive', { dryRun: false });
      const exec = execResp?.data || execResp;
      const renomeados = Number(exec?.total_renomeados ?? exec?.renomeados ?? 0);
      const erros = Number(exec?.total_erros ?? exec?.erros ?? 0);
      toast.success(`${renomeados} renomeado(s) · ${erros} erro(s)`);
      await queryClient.invalidateQueries({ queryKey: ['backup-drive-aprovadas'] });
    } catch (err) {
      toast.error('Falha ao limpar nomes de máquina: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setLimpandoMaquina(false);
    }
  }

  function exportarCsv() {
    const header = ['Numero NF', 'Fornecedor', 'Valor', 'Mes/Ano', 'Status Backup', 'Ultimo Backup', 'PDF', 'XML', 'Comprovante'];
    const rows = filtradas.map((p) => [
      p?.nf_numero || '',
      (p?.fornecedor_nome || p?.nf_emitente_nome || '').replace(/;/g, ','),
      Number(p?.valor_pago || p?.valor_aprovado_admin || p?.nf_valor_total || p?.valor_solicitado || 0).toFixed(2),
      getMesAnoEmissao(p),
      STATUS_CONFIG[getBackupStatus(p)].label,
      p?.backup_last_synced_at ? new Date(p.backup_last_synced_at).toLocaleString('pt-BR') : '',
      p?.drive_backup_nf_pdf_link || p?.nota_fiscal_url || '',
      p?.drive_backup_nf_xml_link || p?.nota_fiscal_xml_url || '',
      p?.drive_backup_comprovante_link || p?.comprovante_url || '',
    ]);
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-drive-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Contadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Com arquivo</p>
          <p className="text-xl font-semibold text-gray-900">{contadores.total_arquivo}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs text-green-700">Sincronizados</p>
          <p className="text-xl font-semibold text-green-700">{contadores.sincronizados}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">Pendentes</p>
          <p className="text-xl font-semibold text-amber-700">{contadores.pendentes}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-700">Com erro</p>
          <p className="text-xl font-semibold text-red-700">{contadores.erro}</p>
        </div>
      </div>

      {/* Filtros + Ações topo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Input
            placeholder="Buscar NF, fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <PlainSelect
          value={filtroStatus}
          onChange={(v) => setFiltroStatus(v || 'all')}
          placeholder="Status backup"
          items={[
            { value: 'all', label: 'Todos status' },
            { value: 'concluido', label: 'Concluído' },
            { value: 'pendente', label: 'Pendente' },
            { value: 'erro', label: 'Erro' },
            { value: 'sem_arquivo', label: 'Sem arquivo' },
          ]}
        />
        <PlainSelect
          value={filtroMes ? `${filtroMes}/${filtroAno}` : 'all'}
          onChange={(v) => {
            if (!v || v === 'all') {
              setFiltroMes('');
              setFiltroAno('');
            } else {
              const [m, a] = v.split('/');
              setFiltroMes(m);
              setFiltroAno(a);
            }
          }}
          placeholder="Mês/Ano"
          items={[
            { value: 'all', label: 'Todos os meses' },
            ...mesesAnosDisponiveis.map((ma) => ({ value: ma, label: ma })),
          ]}
        />
        <Button variant="outline" size="sm" onClick={exportarCsv}>
          Exportar CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={limparNomesMaquina}
          disabled={limpandoMaquina}
          title="Renomeia arquivos de máquina no Drive para o padrão oficial"
        >
          {limpandoMaquina ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Limpar nomes
        </Button>
        <Button
          size="sm"
          className="bg-black text-white hover:bg-gray-800"
          onClick={reenviarTodosPendentes}
          disabled={reenviandoTodos || contadores.pendentes === 0}
        >
          {reenviandoTodos ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Reenviar Todos Pendentes ({contadores.pendentes})
        </Button>
      </div>

      {reenviandoTodos && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-blue-700">Enviando para o Drive...</span>
            <span className="text-blue-700">{progressoTodos.atual}/{progressoTodos.total}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progressoTodos.total ? (progressoTodos.atual / progressoTodos.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabela */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
          <FileX2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Nenhuma NF aprovada encontrada com os filtros selecionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Número NF</th>
                <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Mês/Ano</th>
                <th className="px-3 py-2 text-left font-medium">Status Backup</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Último Backup</th>
                <th className="hidden md:table-cell px-3 py-2 text-center font-medium">Links</th>
                <th className="px-3 py-2 text-center font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginaItens.map((p) => {
                const st = getBackupStatus(p);
                const enviando = reenviandoId === p.id || st === 'em_processamento';
                const valor = Number(p?.valor_pago || p?.valor_aprovado_admin || p?.nf_valor_total || p?.valor_solicitado || 0);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{p?.nf_numero || '—'}</td>
                    <td className="px-3 py-2 text-gray-900">{p?.fornecedor_nome || p?.nf_emitente_nome || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{fmtBRL(valor)}</td>
                    <td className="hidden md:table-cell px-3 py-2 text-gray-600">{getMesAnoEmissao(p) || '—'}</td>
                    <td className="px-3 py-2"><BackupBadge status={st} /></td>
                    <td className="hidden md:table-cell px-3 py-2 text-gray-600">
                      {p?.backup_last_synced_at
                        ? new Date(p.backup_last_synced_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <LinkIcon
                          url={p?.drive_backup_nf_pdf_link || p?.nota_fiscal_url || p?.nf_pdf_url}
                          title="Abrir PDF no Drive"
                          Icon={FileText}
                        />
                        <LinkIcon
                          url={p?.drive_backup_nf_xml_link || p?.nota_fiscal_xml_url || p?.xml_url}
                          title="Abrir XML no Drive"
                          Icon={FileCode}
                        />
                        <LinkIcon
                          url={p?.drive_backup_comprovante_link || p?.comprovante_url || p?.comprovante_pagamento_url}
                          title="Abrir Comprovante no Drive"
                          Icon={Receipt}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => reenviarIndividual(p)}
                        disabled={enviando || st === 'concluido' || st === 'sem_arquivo'}
                        title={st === 'concluido' ? 'Já sincronizado' : st === 'sem_arquivo' ? 'Sem arquivo fiscal' : 'Reenviar para Drive'}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                          enviando
                            ? 'bg-blue-50 text-blue-600'
                            : st === 'concluido'
                            ? 'text-green-400 cursor-default'
                            : st === 'sem_arquivo'
                            ? 'text-gray-300 cursor-default'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                        }`}
                      >
                        {enviando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {filtradas.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Mostrando {inicio + 1}–{Math.min(inicio + PAGE_SIZE, filtradas.length)} de {filtradas.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={paginaAtual === 0}
            >
              Anterior
            </Button>
            <span className="px-2 py-1 text-gray-500">
              Página {paginaAtual + 1} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={paginaAtual >= totalPaginas - 1}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {isFetching && !isLoading && (
        <p className="text-xs text-gray-400">Atualizando lista...</p>
      )}
    </div>
  );
}