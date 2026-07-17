import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import PainelGmailRelatorios from '@/components/varredura/PainelGmailRelatorios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderSearch, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown,
  ChevronUp, Loader2, User, Calendar, Building2, Activity, Image,
  ClipboardCheck, X, FileText, FolderOpen, Play, Info, Zap, Clock,
  RotateCcw, FileCheck2, ImageIcon, Mail, Sparkles, Camera, Receipt, ExternalLink
} from 'lucide-react';

// ── Painel: Fotos vinculadas a atividades via Drive ──
function PainelFotosAtividades() {
  const [rodando, setRodando] = useState(false);
  const [pastaId, setPastaId] = useState('');
  const [modo, setModo] = useState('preview');
  const [resultado, setResultado] = useState(null);

  async function handleVarrer() {
    setRodando(true);
    setResultado(null);
    toast.info(modo === 'preview' ? 'Analisando fotos no Drive…' : 'Importando fotos do Drive para o sistema…');
    try {
      const res = await base44.functions.invoke('importarFotosPastaAtividades', {
        pasta_raiz_id: pastaId.trim() || undefined,
        modo,
        limite_pastas: 20,
        limite_fotos_por_pasta: 30,
      });
      const d = res.data;
      setResultado(d);
      if (modo === 'preview') {
        toast.success(`Preview: ${d.total_pastas || 0} álbuns · ${d.total_fotos || 0} fotos encontradas · ${d.total_vinculadas || 0} vinculadas a atividades`);
      } else {
        toast.success(`Importação: ${d.fotos_importadas || 0} fotos importadas · ${d.atividades_atualizadas || 0} atividades atualizadas`);
      }
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  const d = resultado;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Camera className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">Fotos de Atividades — Varredura Drive</h2>
            <p className="text-xs text-emerald-600">Busca fotos nas pastas do Drive e vincula às atividades correspondentes no sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-emerald-200 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setModo('preview')}
              className={`px-3 py-1.5 font-medium transition-colors ${modo === 'preview' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`}
            >
              Pré-visualizar
            </button>
            <button
              type="button"
              onClick={() => setModo('import')}
              className={`px-3 py-1.5 font-medium transition-colors ${modo === 'import' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`}
            >
              Importar
            </button>
          </div>
          <Button
            onClick={handleVarrer}
            disabled={rodando}
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl"
          >
            {rodando
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Varrendo…</>
              : <><Camera className="w-3.5 h-3.5" /> {modo === 'preview' ? 'Analisar' : 'Importar fotos'}</>
            }
          </Button>
        </div>
      </div>

      {/* Campo opcional de pasta */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={pastaId}
            onChange={e => setPastaId(e.target.value)}
            placeholder="ID da pasta raiz (deixe vazio para usar a pasta padrão das atividades)"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Padrão: pasta raiz de fotos de atividades configurada no Drive do projeto</p>
      </div>

      {/* Resultado */}
      {d && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Álbuns/pastas', value: d.total_pastas ?? d.pastas_processadas ?? 0, color: 'text-gray-700' },
              { label: 'Fotos encontradas', value: d.total_fotos ?? d.fotos_encontradas ?? 0, color: 'text-emerald-700' },
              { label: 'Vinculadas a atividades', value: d.total_vinculadas ?? d.vinculadas ?? 0, color: 'text-blue-700' },
              { label: modo === 'preview' ? 'Novas a importar' : 'Importadas', value: d.total_novas ?? d.fotos_importadas ?? 0, color: 'text-indigo-700' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {modo === 'preview' && d.total_novas > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>{d.total_novas} fotos novas encontradas. Mude para "Importar" e execute para adicioná-las ao sistema.</span>
              <button onClick={() => setModo('import')} className="ml-2 underline font-medium whitespace-nowrap text-xs">Importar agora</button>
            </div>
          )}

          {d.amostras?.length > 0 && (
            <details className="rounded-xl border border-emerald-100 overflow-hidden" open>
              <summary className="bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 cursor-pointer">{d.amostras.length} amostra(s) de fotos encontradas</summary>
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {d.amostras.slice(0, 15).map((f, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate font-medium">{f.drive_nome || f.nome}</p>
                      <p className="text-[10px] text-gray-400 truncate">{f.pasta_nome || f.museu} · {f.autor || '—'}</p>
                    </div>
                    {f.drive_url && (
                      <a href={f.drive_url} target="_blank" rel="noreferrer" className="text-emerald-500 hover:text-emerald-700 shrink-0">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {d.erros?.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              {d.erros.length} erro(s) durante o processamento.
            </div>
          )}
        </div>
      )}

      {!d && !rodando && (
        <div className="px-5 py-6 text-center">
          <Camera className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Varre as pastas de fotos no Drive, identifica o museu, mês e autor pelo nome da pasta,</p>
          <p className="text-xs text-gray-400">e vincula automaticamente cada foto à atividade correspondente no sistema.</p>
        </div>
      )}
    </div>
  );
}

// ── Painel: NFs sem aprovação desde fevereiro ──
function PainelNFsSemAprovacao() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos | nao_aprovadas | pendentes

  async function handleBuscar() {
    setRodando(true);
    setResultado(null);
    toast.info('Buscando NFs sem aprovação desde fevereiro…');
    try {
      const dataCorte = new Date('2026-02-01');
      const statusBuscar = filtroStatus === 'pendentes'
        ? ['SOLICITADO']
        : ['RASCUNHO', 'SOLICITADO', 'DEVOLVIDO', 'RECUSADO'];

      // Buscar cada status em paralelo
      const lotes = await Promise.all(
        statusBuscar.map(status =>
          base44.entities.PurchaseRequest.filter({ status }, '-created_date', 300).catch(() => [])
        )
      );

      const todasRaw = lotes.flat();

      // 1. Deduplicar por id (evita registros duplicados vindos de múltiplas queries)
      const seenIds = new Set();
      const semDuplicataId = todasRaw.filter(nf => {
        if (seenIds.has(nf.id)) return false;
        seenIds.add(nf.id);
        return true;
      });

      // 2. Excluir duplicatas financeiras e registros explicitamente excluídos do somatório
      const semDuplicataFinanceira = semDuplicataId.filter(nf =>
        nf.duplicada_financeira !== true &&
        nf.incluir_no_somatorio !== false &&
        nf.duplicidade_status !== 'confirmada'
      );

      // 3. Excluir NFs com chave de acesso idêntica (mesmo XML, registrado duas vezes)
      const seenChave = new Set();
      const semDuplicataChave = semDuplicataFinanceira.filter(nf => {
        if (!nf.nf_chave_acesso) return true; // sem chave = não dá pra deduplicar, manter
        if (seenChave.has(nf.nf_chave_acesso)) return false;
        seenChave.add(nf.nf_chave_acesso);
        return true;
      });

      // 4. Filtrar por data >= fev/2026 (usa data de emissão NF se disponível, senão created_date)
      const filtradas = semDuplicataChave.filter(nf => {
        const dataStr = nf.nf_data_emissao || nf.created_date;
        if (!dataStr) return true; // sem data: incluir por precaução
        return new Date(dataStr) >= dataCorte;
      });

      // 5. Agrupar por status
      const porStatus = {};
      filtradas.forEach(nf => {
        const s = nf.status || 'RASCUNHO';
        if (!porStatus[s]) porStatus[s] = [];
        porStatus[s].push(nf);
      });

      setResultado({ total: filtradas.length, porStatus, lista: filtradas });
      toast.success(`${filtradas.length} NF(s) únicas sem aprovação desde fevereiro`);
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  const STATUS_LABEL = {
    RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
    SOLICITADO: { label: 'Aguardando aprovação', color: 'bg-yellow-100 text-yellow-800' },
    DEVOLVIDO: { label: 'Devolvido', color: 'bg-orange-100 text-orange-800' },
    RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
    APROVADO_COORD: { label: 'Aprovado coord.', color: 'bg-blue-100 text-blue-800' },
    APROVADO_ADMIN: { label: 'Aprovado admin', color: 'bg-green-100 text-green-700' },
    CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
    PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  };

  function formatBRL(v) {
    if (!v && v !== 0) return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-rose-100 bg-rose-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center">
            <Receipt className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-rose-900">NFs sem Aprovação — Desde Fevereiro/2026</h2>
            <p className="text-xs text-rose-600">Lista notas fiscais que ainda não foram aprovadas no sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="rounded-lg border border-rose-200 bg-white text-xs px-3 py-1.5 text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            <option value="todos">Todos os status não aprovados</option>
            <option value="pendentes">Apenas aguardando aprovação</option>
          </select>
          <Button
            onClick={handleBuscar}
            disabled={rodando}
            size="sm"
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-xl"
          >
            {rodando
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…</>
              : <><FolderSearch className="w-3.5 h-3.5" /> Buscar NFs</>
            }
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="p-5 space-y-4">
          {/* Cards de resumo por status */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(resultado.porStatus).map(([status, nfs]) => {
              const cfg = STATUS_LABEL[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
              return (
                <div key={status} className={`rounded-xl px-3 py-2 text-center min-w-[100px] ${cfg.color} border border-black/5`}>
                  <p className="text-lg font-bold">{nfs.length}</p>
                  <p className="text-[10px] font-medium">{cfg.label}</p>
                </div>
              );
            })}
          </div>

          {/* Valor total pendente */}
          {resultado.lista.length > 0 && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
              <p className="text-xs text-rose-600 font-medium">Valor total das NFs não aprovadas:</p>
              <p className="text-xl font-bold text-rose-800">
                {formatBRL(resultado.lista.reduce((s, nf) => s + (nf.valor_solicitado || nf.nf_valor_total || 0), 0))}
              </p>
            </div>
          )}

          {/* Lista de NFs */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 flex items-center justify-between">
              <span>{resultado.total} NF(s) sem aprovação</span>
              <span className="text-gray-400">Ordenadas por data de criação</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {resultado.lista.map((nf, i) => {
                const cfg = STATUS_LABEL[nf.status] || { label: nf.status, color: 'bg-gray-100 text-gray-700' };
                return (
                  <div key={nf.id || i} className="px-4 py-3 flex items-start gap-3">
                    <Receipt className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-800 font-semibold truncate">{nf.descricao_item || nf.fornecedor_nome || 'Sem descrição'}</p>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            {nf.fornecedor_nome && <span>{nf.fornecedor_nome} · </span>}
                            {nf.centro_custo && <span>{nf.centro_custo} · </span>}
                            {nf.nf_data_emissao ? new Date(nf.nf_data_emissao).toLocaleDateString('pt-BR') : new Date(nf.created_date).toLocaleDateString('pt-BR')}
                          </p>
                          {nf.numero_processamento && (
                            <p className="text-[10px] text-gray-400 font-mono">{nf.numero_processamento}</p>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-xs font-bold text-gray-700">{formatBRL(nf.valor_solicitado || nf.nf_valor_total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!resultado && !rodando && (
        <div className="px-5 py-6 text-center">
          <Receipt className="w-8 h-8 text-rose-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Clique em "Buscar NFs" para listar todas as notas fiscais</p>
          <p className="text-xs text-gray-400">com status de rascunho, aguardando aprovação ou devolvidas desde fevereiro/2026.</p>
        </div>
      )}
    </div>
  );
}

const PASTA_RAIZ_PADRAO = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';

// ── Item Card ──
function ItemCard({ item, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const d = item.dados_ia || {};
  const atividades = d.atividades || [];
  const confianca = item.confianca || 0;
  const colorConf = confianca >= 70
    ? 'bg-green-100 text-green-800 border-green-200'
    : confianca >= 40
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-red-100 text-red-800 border-red-200';

  return (
    <div className={`rounded-xl border p-4 space-y-2 transition-all ${item.selecionado ? 'border-black bg-white shadow-sm' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={!!item.selecionado}
          onChange={() => onToggle(item)}
          className="mt-1 w-4 h-4 rounded accent-black shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-black truncate">{item.arquivo_nome}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorConf}`}>
              {confianca}% confiança
            </span>
            {item.duplicidade === 'provavel' && (
              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 bg-orange-50">
                Possível duplicata
              </Badge>
            )}
            {item.usuario_status === 'localizado' ? (
              <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50">
                <User className="w-3 h-3 mr-1" />Usuário ok
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">
                <User className="w-3 h-3 mr-1" />Usuário não localizado
              </Badge>
            )}
            {item.fotos_count > 0 && (
              <Badge variant="outline" className="text-[10px] border-purple-200 text-purple-700 bg-purple-50">
                <Image className="w-3 h-3 mr-1" />{item.fotos_count} foto{item.fotos_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-gray-400 hover:text-black">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pl-7">
        <span className="flex items-center gap-1 text-gray-600 truncate">
          <User className="w-3 h-3 shrink-0" />{item.profissional_nome || '—'}
        </span>
        <span className="flex items-center gap-1 text-gray-600">
          <Building2 className="w-3 h-3 shrink-0" />{item.museu || '—'}
        </span>
        <span className="flex items-center gap-1 text-gray-600">
          <Calendar className="w-3 h-3 shrink-0" />{item.mes || '—'}/{item.ano || '—'}
        </span>
        <span className="flex items-center gap-1 text-gray-600">
          <Activity className="w-3 h-3 shrink-0" />{atividades.length} atividade{atividades.length !== 1 ? 's' : ''}
        </span>
      </div>

      {expanded && (
        <div className="pl-7 border-t border-gray-100 pt-3 space-y-2">
          {item.usuario_vinculado && (
            <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              Usuário: <strong>{item.usuario_vinculado.nome}</strong> — {item.usuario_vinculado.email}
            </div>
          )}
          {item.duplicidade === 'provavel' && (
            <div className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              Possível duplicata detectada. Verifique antes de importar.
            </div>
          )}
          {atividades.slice(0, 6).map((a, i) => (
            <p key={i} className="text-xs text-gray-600">
              • {a.titulo} {a.classificacao ? <span className="text-gray-400">({a.classificacao})</span> : ''}
            </p>
          ))}
          {atividades.length > 6 && (
            <p className="text-xs text-gray-400">+ {atividades.length - 6} atividades adicionais...</p>
          )}
          {item.campos_ausentes?.length > 0 && (
            <p className="text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Campos ausentes: {item.campos_ausentes.join(', ')}
            </p>
          )}
          {item.fotos_vinculadas?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.fotos_vinculadas.slice(0, 6).map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer"
                  className="text-[10px] bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600 hover:text-black truncate max-w-[120px]">
                  🖼 {f.nome}
                </a>
              ))}
              {item.fotos_vinculadas.length > 6 && (
                <span className="text-[10px] text-gray-400">+{item.fotos_vinculadas.length - 6} fotos</span>
              )}
            </div>
          )}
          {item.arquivo_url && (
            <a href={item.arquivo_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <FileText className="w-3 h-3" /> Abrir PDF no Drive
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Resultado de importação ──
function ResultadoCard({ r }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-xs border ${r.status === 'ok' ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'}`}>
      <p className="font-semibold text-gray-800 truncate">{r.arquivo_nome}</p>
      <div className="flex gap-3 mt-0.5 text-gray-500">
        <span>{r.atividades_criadas} atividade{r.atividades_criadas !== 1 ? 's' : ''}</span>
        <span>{r.fotos_criadas} foto{r.fotos_criadas !== 1 ? 's' : ''}</span>
      </div>
      {r.avisos?.length > 0 && (
        <p className="text-amber-600 mt-0.5">{r.avisos.slice(0, 2).join(' · ')}{r.avisos.length > 2 ? ` +${r.avisos.length - 2}` : ''}</p>
      )}
      {r.erros?.length > 0 && <p className="text-red-600 mt-0.5">{r.erros[0]}</p>}
    </div>
  );
}

// ── Painel Completar Campos com IA ──
function PainelCompletarCampos() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleCompletar() {
    setRodando(true);
    setResultado(null);
    toast.info('IA preenchendo campos vazios de todos os relatórios… aguarde.');
    try {
      const res = await base44.functions.invoke('completarCamposRelatorios', {
        modo: 'todos',
        apenas_vazios: true,
        limite: 50,
      });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      toast.success(`${d.preenchidos} relatório(s) completados com IA!`);
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-green-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-green-100 bg-green-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-green-900">Completar Campos com IA</h2>
            <p className="text-xs text-green-600">Preenche resumo, avaliação e atividades nos relatórios com campos vazios</p>
          </div>
        </div>
        <Button
          onClick={handleCompletar}
          disabled={rodando}
          size="sm"
          className="gap-1.5 bg-green-600 text-white hover:bg-green-700 rounded-xl"
        >
          {rodando
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preenchendo…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Completar todos</>
          }
        </Button>
      </div>

      {resultado && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Verificados', value: resultado.total_verificados, color: 'text-gray-700' },
              { label: 'Completados', value: resultado.preenchidos, color: 'text-green-700' },
              { label: 'Erros', value: resultado.erros, color: 'text-red-600' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          {resultado.resultados?.filter(r => r.status === 'preenchido').length > 0 && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                Relatórios completados
              </div>
              <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {resultado.resultados.filter(r => r.status === 'preenchido').map((r, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 font-medium">{r.author} — {r.museu}</p>
                      <p className="text-[10px] text-gray-500">{r.mes}/{r.ano}</p>
                      {r.campos_preenchidos?.length > 0 && (
                        <p className="text-[10px] text-green-600">{r.campos_preenchidos.join(' · ')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!resultado && !rodando && (
        <div className="px-5 py-6 text-center">
          <Sparkles className="w-8 h-8 text-green-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Analisa todos os relatórios e preenche os campos vazios (resumo, pontos positivos, desafios, atividades) usando IA.</p>
          <p className="text-xs text-gray-400 mt-1">Campos já preenchidos não são sobrescritos.</p>
        </div>
      )}
    </div>
  );
}

// ── Painel Gmail Viaduto (substituído por componente dedicado) ──
function PainelGmailViaduto() {
  const [rodando, setRodando] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleBuscar() {
    setRodando(true);
    setResultado(null);
    toast.info(dryRun ? 'Simulando busca no Gmail (sem salvar)…' : 'Buscando relatórios no Gmail do Viaduto… isso pode levar alguns minutos.');
    try {
      const res = await base44.functions.invoke('buscarRelatoriosGmailViaduto', {
        maxResults: 100,
        dryRun,
        preencherRelatorios: true,
      });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      if (dryRun) {
        toast.success(`Simulação: ${d.importados} arquivos encontrados nos e-mails`);
      } else {
        toast.success(`${d.importados} arquivos importados · ${d.relatoriosPreenchidos} relatórios preenchidos`);
      }
    } catch (e) {
      toast.error('Erro na busca: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-blue-100 flex items-center justify-between bg-blue-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Mail className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-blue-900">Buscar Relatórios no Gmail</h2>
            <p className="text-xs text-blue-600">danielperini.mc@viadutodasartes.org.br · IA lê, analisa e preenche automaticamente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5">
            <input
              type="checkbox"
              id="gmail-dryrun"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600"
            />
            <label htmlFor="gmail-dryrun" className="text-xs text-blue-700 cursor-pointer">Simulação</label>
          </div>
          <Button
            onClick={handleBuscar}
            disabled={rodando}
            size="sm"
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl"
          >
            {rodando
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…</>
              : <><Sparkles className="w-3.5 h-3.5" /> Buscar e preencher</>
            }
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Emails processados', value: resultado.resultados?.length || 0, color: 'text-gray-700' },
              { label: 'Arquivos importados', value: resultado.importados || 0, color: 'text-blue-700' },
              { label: 'Relatórios preenchidos', value: resultado.relatoriosPreenchidos || 0, color: 'text-green-700' },
              { label: 'Ignorados/duplicados', value: resultado.ignorados || 0, color: 'text-gray-500' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {resultado.dryRun && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <strong>Modo simulação:</strong> nenhum dado foi alterado. Desmarque "Simulação" para aplicar.
            </div>
          )}

          {resultado.resultados?.filter(r => r.status !== 'duplicado' && r.status !== 'ignorado').length > 0 && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                Arquivos processados
              </div>
              <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
                {resultado.resultados.filter(r => r.status !== 'duplicado' && r.status !== 'ignorado').map((r, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      r.status === 'criado' || r.status === 'preenchido' ? 'bg-green-400' :
                      r.status === 'importado' ? 'bg-blue-400' :
                      r.status === 'dry-run' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate font-medium">{r.filename}</p>
                      <p className="text-[10px] text-gray-500 truncate">{r.subject}</p>
                      {r.atividades > 0 && <p className="text-[10px] text-green-600">{r.atividades} atividade(s) extraída(s)</p>}
                      {r.erro && <p className="text-[10px] text-red-500 truncate">{r.erro}</p>}
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      r.status === 'criado' ? 'border-green-300 text-green-700 bg-green-50' :
                      r.status === 'preenchido' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                      r.status === 'dry-run' ? 'border-yellow-300 text-yellow-700 bg-yellow-50' :
                      'border-gray-200 text-gray-500'
                    }`}>
                      {r.status === 'criado' ? 'Relatório criado' :
                       r.status === 'preenchido' ? 'Relatório preenchido' :
                       r.status === 'importado' ? 'Importado' :
                       r.status === 'dry-run' ? 'Simulado' : r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!resultado && !rodando && (
        <div className="px-5 py-6 text-center">
          <Mail className="w-8 h-8 text-blue-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Busca e-mails com anexos de relatórios (PDF/DOCX) no Gmail do Viaduto das Artes.</p>
          <p className="text-xs text-gray-400">A IA lê cada arquivo e preenche automaticamente os relatórios no sistema.</p>
        </div>
      )}
    </div>
  );
}

// ── Painel NFs do Drive com diagnóstico e importação sem corte de data ──
function PainelNFsDrive() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [ignorarCorte, setIgnorarCorte] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  async function handleDiagnostico() {
    setRodando(true);
    setResultado(null);
    toast.info('Executando diagnóstico das pastas mensais…');
    try {
      const res = await base44.functions.invoke('syncDriveNotasFiscaisDesdeMarco2026', {
        modoDiagnostico: true,
        triggeredBy: 'manual',
      });
      const d = res.data;
      setResultado({ tipo: 'diagnostico', ...d });
      toast.success(`Diagnóstico concluído: ${d.total_pdfs} PDFs encontrados, ${d.pdfs_validos_para_importar} válidos para importar`);
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  async function handleImportar() {
    setRodando(true);
    setResultado(null);
    toast.info(dryRun ? 'Simulando importação de NFs…' : `Importando NFs das pastas mensais${ignorarCorte ? ' (sem filtro de data)' : ''}…`);
    try {
      const res = await base44.functions.invoke('syncDriveNotasFiscaisDesdeMarco2026', {
        dryRun,
        ignorarDataCorte: ignorarCorte,
        maxFiles: 10,
        triggeredBy: 'manual',
      });
      const d = res.data;
      setResultado({ tipo: 'importacao', ...d });
      if (dryRun) {
        toast.success(`Simulação: ${d.total_lidos} arquivos encontrados, ${d.importados} seriam importados`);
      } else {
        toast.success(`Importação: ${d.importados} NFs importadas · ${d.duplicados} duplicadas · ${d.erros} erros`);
      }
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  const d = resultado;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <FolderSearch className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-indigo-900">NFs do Drive — Pastas Mensais</h2>
            <p className="text-xs text-indigo-600">Diagnóstico e importação de PDFs/XMLs nas pastas mensais do projeto</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleDiagnostico}
            disabled={rodando}
            variant="outline"
            size="sm"
            className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-xl"
          >
            {rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Info className="w-3.5 h-3.5" />}
            Diagnóstico
          </Button>
          <Button
            onClick={handleImportar}
            disabled={rodando}
            size="sm"
            className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl"
          >
            {rodando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Executando…</> : <><Play className="w-3.5 h-3.5" /> {dryRun ? 'Simular' : 'Importar'}</>}
          </Button>
        </div>
      </div>

      {/* Opções */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
          <span className="text-xs text-gray-600">Simulação (não salva)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={ignorarCorte} onChange={e => setIgnorarCorte(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
          <span className="text-xs text-gray-600">Ignorar corte de data (busca todos os PDFs, inclusive anteriores a mar/2026)</span>
        </label>
      </div>

      {/* Resultado */}
      {d?.tipo === 'diagnostico' && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total PDFs', value: d.total_pdfs, color: 'text-gray-700' },
              { label: 'Válidos p/ importar', value: d.pdfs_validos_para_importar, color: 'text-green-700' },
              { label: 'Bloqueados por nome', value: d.pdfs_bloqueados_por_nome, color: 'text-orange-600' },
              { label: 'Anteriores ao corte', value: d.pdfs_anteriores_ao_corte, color: 'text-red-600' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value ?? 0}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>
          {d.dica && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              {d.dica}
            </div>
          )}
          {d.pastas?.length > 0 && (
            <details className="rounded-xl border border-gray-100 overflow-hidden">
              <summary className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 cursor-pointer">{d.pastas.length} pasta(s) encontrada(s)</summary>
              <div className="p-3 space-y-1 max-h-40 overflow-y-auto">
                {d.pastas.map((p, i) => <p key={i} className="text-xs text-gray-600 font-mono">{p || '/'}</p>)}
              </div>
            </details>
          )}
          {d.amostra_pdfs_validos?.length > 0 && (
            <details className="rounded-xl border border-green-100 overflow-hidden">
              <summary className="bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 cursor-pointer">Amostra de PDFs válidos ({d.amostra_pdfs_validos.length})</summary>
              <div className="p-3 space-y-1 max-h-40 overflow-y-auto">
                {d.amostra_pdfs_validos.map((f, i) => <p key={i} className="text-xs text-gray-600 truncate"><span className="text-gray-400">{f.pasta}/</span>{f.nome}</p>)}
              </div>
            </details>
          )}
          {d.amostra_pdfs_antigos?.length > 0 && (
            <details className="rounded-xl border border-orange-100 overflow-hidden">
              <summary className="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 cursor-pointer">PDFs anteriores ao corte — use "Ignorar corte de data" para importar ({d.amostra_pdfs_antigos.length})</summary>
              <div className="p-3 space-y-1 max-h-40 overflow-y-auto">
                {d.amostra_pdfs_antigos.map((f, i) => <p key={i} className="text-xs text-gray-600 truncate"><span className="text-gray-400">{f.pasta}/</span>{f.nome} <span className="text-gray-400">({f.data?.slice(0,10)})</span></p>)}
              </div>
            </details>
          )}
        </div>
      )}

      {d?.tipo === 'importacao' && (
        <div className="p-5 space-y-4">
          {d.dry_run_report && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <strong>Simulação:</strong> nenhum dado foi alterado. Desmarque "Simulação" para aplicar.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Encontrados', value: d.total_lidos, color: 'text-gray-700' },
              { label: 'Importados', value: d.importados, color: 'text-green-700' },
              { label: 'PDF+XML pareados', value: d.pareamentos, color: 'text-indigo-700' },
              { label: 'Duplicados', value: d.duplicados, color: 'text-orange-600' },
              { label: 'Cancelados', value: d.cancelados, color: 'text-yellow-600' },
              { label: 'Erros', value: d.erros, color: 'text-red-600' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value ?? 0}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          {d.tem_mais && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              Há mais arquivos a processar. Execute novamente para continuar.
            </div>
          )}
          {d.detalhe_pareamentos?.length > 0 && (
            <details className="rounded-xl border border-indigo-100 overflow-hidden" open>
              <summary className="bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 cursor-pointer">{d.detalhe_pareamentos.length} par(es) PDF+XML vinculados automaticamente</summary>
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {d.detalhe_pareamentos.map((p, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-indigo-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate font-medium">{p.pdf}</p>
                      <p className="text-[10px] text-indigo-600 truncate">↔ {p.xml}</p>
                      <p className="text-[10px] text-gray-400">score {p.score} · {p.motivo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {d.detalhamento?.length > 0 && (
            <details className="rounded-xl border border-gray-100 overflow-hidden">
              <summary className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 cursor-pointer">Detalhamento ({d.detalhamento.length} arquivos)</summary>
              <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {d.detalhamento.map((item, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.status === 'importado' ? 'bg-green-400' : item.status === 'duplicado' ? 'bg-orange-400' : item.status === 'ignorado' ? 'bg-gray-300' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate font-medium">{item.nome}</p>
                      <p className="text-[10px] text-gray-400 truncate">{item.pasta || item.motivo || item.status}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.status === 'importado' ? 'bg-green-100 text-green-700' : item.status === 'duplicado' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!d && !rodando && (
        <div className="px-5 py-6 text-center">
          <FolderSearch className="w-8 h-8 text-indigo-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Clique em <strong>Diagnóstico</strong> para ver quantos PDFs existem nas pastas mensais e por que não estão sendo encontrados.</p>
          <p className="text-xs text-gray-400 mt-1">Se todos os PDFs são anteriores a mar/2026, marque "Ignorar corte de data" e depois clique em Simular/Importar.</p>
        </div>
      )}
    </div>
  );
}

// ── Painel Varredura NFs Fev-Jul ──
function PainelNFsFevJul() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleVarrer() {
    setRodando(true);
    setResultado(null);
    toast.info('Varrendo Drive em busca de NFs de fev-jul 2026… aguarde.');
    try {
      const res = await base44.functions.invoke('auditarNFsDriveFevJul', {});
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      toast.success(`Varredura concluída: ${d.resumo.intakes_criados} NF(s) novas importadas · ${d.resumo.duplicatas_descartadas} duplicatas descartadas`);
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  const r = resultado?.resumo;

  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-amber-900">Varredura de NFs — Fev a Jul/2026</h2>
            <p className="text-xs text-amber-600">Importa XMLs novos do Drive, descarta duplicatas pelos 5 critérios</p>
          </div>
        </div>
        <Button
          onClick={handleVarrer}
          disabled={rodando}
          size="sm"
          className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700 rounded-xl"
        >
          {rodando
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Varrendo…</>
            : <><FolderSearch className="w-3.5 h-3.5" /> Varrer agora</>
          }
        </Button>
      </div>

      {r && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'XMLs encontrados', value: r.xmls_encontrados_drive, color: 'text-gray-700' },
              { label: 'Duplicatas descartadas', value: r.duplicatas_descartadas, color: 'text-orange-600' },
              { label: 'NFs novas importadas', value: r.novas_nfs_encontradas, color: 'text-green-700' },
              { label: 'Intakes criados', value: r.intakes_criados, color: 'text-blue-700' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {resultado.novas_importadas?.length > 0 && (
            <div className="rounded-xl border border-green-100 overflow-hidden">
              <div className="bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 border-b border-green-100">
                NFs importadas para revisão
              </div>
              <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {resultado.novas_importadas.map((nf, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 font-medium truncate">{nf.arquivo}</p>
                      <p className="text-[10px] text-gray-400">Intake criado: {nf.intake_id?.substring(0, 12)}…</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultado.duplicatas?.length > 0 && (
            <details className="rounded-xl border border-orange-100 overflow-hidden">
              <summary className="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 cursor-pointer">
                {resultado.duplicatas.length} duplicata(s) descartada(s) — clique para ver
              </summary>
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {resultado.duplicatas.map((d, i) => (
                  <div key={i} className="px-4 py-2 flex items-start gap-2">
                    <X className="w-3 h-3 text-orange-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-600 truncate">{d.arquivo}</p>
                      <p className="text-[10px] text-orange-600">{d.motivo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {resultado.erros?.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              {resultado.erros.length} erro(s) durante o processamento.
            </div>
          )}
        </div>
      )}

      {!r && !rodando && (
        <div className="px-5 py-6 text-center">
          <FileText className="w-8 h-8 text-amber-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Varre a pasta de exportações do Drive, filtra XMLs de NF de fev-jul/2026 e importa apenas as notas únicas.</p>
          <p className="text-xs text-gray-400 mt-1">NFs já existentes no sistema são descartadas automaticamente pelos 5 critérios (chave, número, valor, data, CNPJ).</p>
        </div>
      )}
    </div>
  );
}

// ── Painel de Sincronização Automática ──
function PainelSincAuto() {
  const [rodando, setRodando] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleSincronizar() {
    setRodando(true);
    setResultado(null);
    toast.info(dryRun ? 'Executando simulação (dry run)…' : 'Sincronizando relatórios do Drive…');
    try {
      const res = await base44.functions.invoke('sincronizarRelatoriosDrive', {
        folder_id: PASTA_RAIZ_PADRAO,
        dry_run: dryRun,
        limite_pdfs: 25,
      });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      const s = d.stats;
      toast.success(
        dryRun
          ? `Simulação concluída: ${s.total_pdfs_varridos} PDFs analisados`
          : `Sincronização concluída: ${s.relatorios_criados} criado(s), ${s.relatorios_atualizados} atualizado(s)`
      );
    } catch (e) {
      toast.error('Erro na sincronização: ' + (e?.message || e));
    } finally {
      setRodando(false);
    }
  }

  const s = resultado?.stats;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-black">Sincronização Automática</h2>
            <p className="text-xs text-gray-400">Executa todos os dias às 03h · Até 25 PDFs por ciclo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
            <input
              type="checkbox"
              id="dryrun-toggle"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="w-3.5 h-3.5 accent-black"
            />
            <label htmlFor="dryrun-toggle" className="text-xs text-gray-600 cursor-pointer">Simulação</label>
          </div>
          <Button
            onClick={handleSincronizar}
            disabled={rodando}
            size="sm"
            className="gap-1.5 bg-black text-white hover:bg-gray-800 rounded-xl"
          >
            {rodando
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Executando…</>
              : <><RotateCcw className="w-3.5 h-3.5" /> Executar agora</>
            }
          </Button>
        </div>
      </div>

      {/* Estatísticas da última execução */}
      {s && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'PDFs varridos', value: s.total_pdfs_varridos, icon: <FileText className="w-4 h-4 text-gray-400" /> },
              { label: 'Criados', value: s.relatorios_criados, icon: <FileCheck2 className="w-4 h-4 text-green-500" />, color: 'text-green-700' },
              { label: 'Atualizados', value: s.relatorios_atualizados, icon: <RefreshCw className="w-4 h-4 text-blue-400" />, color: 'text-blue-700' },
              { label: 'Atividades restauradas', value: s.atividades_restauradas, icon: <Activity className="w-4 h-4 text-purple-400" />, color: 'text-purple-700' },
              { label: 'Fotos vinculadas', value: s.fotos_vinculadas, icon: <ImageIcon className="w-4 h-4 text-pink-400" />, color: 'text-pink-700' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <div className="flex justify-center mb-1">{item.icon}</div>
                <p className={`text-xl font-bold ${item.color || 'text-black'}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {resultado?.dry_run && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <strong>Modo simulação:</strong> nenhum dado foi alterado. Remova o modo simulação para aplicar as mudanças.
            </div>
          )}

          {s.erros > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              {s.erros} arquivo(s) com erro durante o processamento.
            </div>
          )}

          {s.detalhes?.length > 0 && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                Detalhes da execução
              </div>
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {s.detalhes.map((d, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${d.status === 'ok' ? 'bg-green-400' : d.status === 'sem_autor' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{d.arquivo}</p>
                      {d.usuario && <p className="text-[10px] text-gray-500">{d.usuario} · {d.museu} · {d.mes_ano}</p>}
                      {d.acoes?.slice(0, 2).map((a, j) => (
                        <p key={j} className="text-[10px] text-gray-400">{a}</p>
                      ))}
                      {d.erro && <p className="text-[10px] text-red-500 truncate">{d.erro}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!s && !rodando && (
        <div className="px-5 py-6 text-center">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">A próxima execução automática é às 03h00.</p>
          <p className="text-xs text-gray-400">Clique em "Executar agora" para rodar imediatamente.</p>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──
export default function VarreduraDrive() {
  const [pastaId, setPastaId] = useState(PASTA_RAIZ_PADRAO);
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState([]);  // itens do preview
  const [resumo, setResumo] = useState(null);         // stats da varredura
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState(null);
  const [etapa, setEtapa] = useState('idle'); // idle | varrendo | revisao | importado

  // ── Varredura ──
  async function handleVarrer() {
    if (!pastaId.trim()) { toast.warning('Informe o ID da pasta do Drive.'); return; }
    setCarregando(true);
    setResultados([]);
    setResumo(null);
    setResultadoImport(null);
    setEtapa('varrendo');
    toast.info('Varrendo pastas do Drive com IA… isso pode levar alguns minutos.');
    try {
      const res = await base44.functions.invoke('previewImportarRelatoriosDrive', { folder_id: pastaId.trim() });
      const data = res.data;
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido na varredura');

      setResultados(data.resultados || []);
      setResumo({
        total_arquivos: data.total_arquivos,
        total_pdfs: data.total_pdfs,
        total_imagens: data.total_imagens,
        pasta_id: data.pasta_id,
      });
      setEtapa('revisao');
      toast.success(`Varredura concluída: ${data.total_pdfs} PDF(s), ${data.total_imagens} imagem(ns).`);
    } catch (e) {
      toast.error('Erro na varredura: ' + (e?.message || e));
      setEtapa('idle');
    } finally {
      setCarregando(false);
    }
  }

  // ── Toggle seleção ──
  function handleToggle(item) {
    setResultados(prev => prev.map(i =>
      i.arquivo_id === item.arquivo_id ? { ...i, selecionado: !i.selecionado } : i
    ));
  }

  function toggleTodos(val) {
    setResultados(prev => prev.map(i => ({ ...i, selecionado: val })));
  }

  const selecionados = resultados.filter(i => i.selecionado);

  // ── Confirmar importação ──
  async function handleImportar() {
    if (selecionados.length === 0) { toast.warning('Selecione ao menos um relatório.'); return; }
    setImportando(true);
    toast.info(`Importando ${selecionados.length} relatório(s)…`);
    try {
      const res = await base44.functions.invoke('confirmarImportacaoRelatoriosDrive', {
        itens_confirmados: selecionados.map(i => ({
          arquivo_nome: i.arquivo_nome,
          arquivo_url: i.arquivo_url,
          dados_ia: i.dados_ia,
          usuario_vinculado: i.usuario_vinculado,
          profissional_nome: i.profissional_nome,
          profissional_email: i.profissional_email,
          museu: i.museu,
          mes: i.mes,
          mes_num: i.mes_num,
          ano: i.ano,
          fotos_vinculadas: i.fotos_vinculadas || [],
        })),
      });
      setResultadoImport(res.data);
      setEtapa('importado');
      toast.success(`Importação concluída: ${res.data.total_sucesso}/${res.data.total_processados} relatório(s).`);
    } catch (e) {
      toast.error('Erro na importação: ' + (e?.message || e));
    } finally {
      setImportando(false);
    }
  }

  // ── Pós-importação: vincular fotos com IA ──
  async function handleVincularFotosIA() {
    toast.info('Vinculando fotos com IA via programação dos museus…');
    try {
      const res = await base44.functions.invoke('sincronizacaoFinalDrive', { dry_run: false, limite: 80 });
      const s = res.data?.stats || {};
      toast.success(`${s.legendas_geradas_ia || 0} legendas geradas pela IA · ${s.vinculadas_programacao || 0} fotos vinculadas à programação`);
    } catch (e) {
      toast.error('Erro ao vincular fotos: ' + (e?.message || e));
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
          <FolderSearch className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-black">Varredura do Google Drive</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Identifica relatórios pendentes nas pastas, analisa PDFs com IA, vincula fotos e importa para o sistema.
          </p>
        </div>
      </div>

      {/* Fotos de Atividades — Varredura Drive */}
      <PainelFotosAtividades />

      {/* NFs sem aprovação desde fevereiro */}
      <PainelNFsSemAprovacao />

      {/* NFs Drive — Diagnóstico + Importação */}
      <PainelNFsDrive />

      {/* NFs Fev-Jul */}
      <PainelNFsFevJul />

      {/* Gmail Viaduto — com validação prévia dos dados extraídos pela IA */}
      <PainelGmailRelatorios />

      {/* Completar campos com IA */}
      <PainelCompletarCampos />

      {/* Sincronização Automática */}
      <PainelSincAuto />

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 shrink-0">ou faça uma varredura manual com revisão</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Configuração de pasta */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-black">Pasta do Drive</h2>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={pastaId}
            onChange={e => setPastaId(e.target.value)}
            placeholder="ID da pasta raiz do Drive (ex: 1gMPRXyamu9Y...)"
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <Button
            onClick={handleVarrer}
            disabled={carregando}
            className="gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-5"
          >
            {carregando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Varrendo...</>
              : <><Play className="w-4 h-4" /> Iniciar varredura</>
            }
          </Button>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
          <p>A varredura percorre <strong>todas as subpastas</strong> recursivamente, analisa cada PDF com IA e vincula as imagens encontradas na mesma pasta ao relatório correspondente.</p>
        </div>
      </div>

      {/* Varrendo... skeleton */}
      {carregando && (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-black">Analisando PDFs com IA…</p>
            <p className="text-xs text-gray-400 mt-1">Isso pode levar 1–3 minutos dependendo da quantidade de arquivos.</p>
          </div>
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-1.5 w-16 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full bg-black rounded-full animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumo da varredura */}
      {resumo && etapa !== 'idle' && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Arquivos encontrados', value: resumo.total_arquivos, color: 'bg-gray-50' },
            { label: 'PDFs de relatórios', value: resumo.total_pdfs, color: 'bg-blue-50' },
            { label: 'Imagens encontradas', value: resumo.total_imagens, color: 'bg-purple-50' },
          ].map((s, i) => (
            <div key={i} className={`${s.color} rounded-xl border border-gray-100 p-4 text-center`}>
              <p className="text-2xl font-bold text-black">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de resultados para revisão */}
      {etapa === 'revisao' && resultados.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-black">{resultados.length} relatório{resultados.length !== 1 ? 's' : ''} detectado{resultados.length !== 1 ? 's' : ''}</h2>
              <p className="text-xs text-gray-500">{selecionados.length} selecionado{selecionados.length !== 1 ? 's' : ''} para importação</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleTodos(true)} className="text-xs text-blue-600 hover:underline">Selecionar todos</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => toggleTodos(false)} className="text-xs text-gray-500 hover:underline">Desmarcar</button>
              <button
                onClick={handleVarrer}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black border border-gray-200 rounded-lg px-3 py-1.5 hover:border-black transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Re-varrer
              </button>
            </div>
          </div>

          <div className="p-5 space-y-2 max-h-[600px] overflow-y-auto">
            {resultados.map((item, i) => (
              <ItemCard key={item.arquivo_id || i} item={item} onToggle={handleToggle} />
            ))}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
            <Button
              onClick={handleImportar}
              disabled={importando || selecionados.length === 0}
              className="w-full gap-2 bg-black text-white hover:bg-gray-800 h-11 text-sm"
            >
              {importando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
                : <><ClipboardCheck className="w-4 h-4" /> Importar {selecionados.length} relatório{selecionados.length !== 1 ? 's' : ''}</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Resultado da importação */}
      {etapa === 'importado' && resultadoImport && (
        <div className="rounded-2xl border border-green-200 bg-white overflow-hidden">
          <div className="px-5 py-4 bg-green-50 border-b border-green-100 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                Importação concluída — {resultadoImport.total_sucesso}/{resultadoImport.total_processados} relatório{resultadoImport.total_sucesso !== 1 ? 's' : ''} importado{resultadoImport.total_sucesso !== 1 ? 's' : ''}
              </p>
              {resultadoImport.total_erro > 0 && (
                <p className="text-xs text-red-600 mt-0.5">{resultadoImport.total_erro} com erro</p>
              )}
            </div>
          </div>

          <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
            {resultadoImport.resultados?.map((r, i) => (
              <ResultadoCard key={i} r={r} />
            ))}
          </div>

          {/* Vincular fotos com IA pós-importação */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
            <p className="text-xs text-gray-500">
              Os relatórios foram importados. Agora você pode vincular as fotos às atividades usando a IA, cruzando com a programação de cada museu.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleVincularFotosIA}
                variant="outline"
                className="flex-1 gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Activity className="w-4 h-4" /> Vincular fotos com IA
              </Button>
              <Button
                onClick={() => { setEtapa('idle'); setResultados([]); setResumo(null); setResultadoImport(null); }}
                variant="outline"
                className="flex-1 gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Nova varredura
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sem resultados */}
      {etapa === 'revisao' && resultados.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <FolderSearch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">Nenhum PDF de relatório encontrado</p>
          <p className="text-xs text-gray-400 mt-1">Verifique se o ID da pasta está correto e se existem PDFs nas subpastas.</p>
        </div>
      )}
    </div>
  );
}