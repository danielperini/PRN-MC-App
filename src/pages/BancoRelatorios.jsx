import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollText, Download, Search, Calendar, FileText, Eye, FolderOpen, ExternalLink, Lock, X, Images } from 'lucide-react';
import GaleriaDocumentosDrive from '@/components/banco-relatorios/GaleriaDocumentosDrive';

function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function statusLabel(tipo) {
  return tipo === 'final' ? 'Final' : 'Parcial';
}

// Busca prévia de fotos de um relatório (máx 6 miniaturas para o card)
function usePreviewFotos(relatorio) {
  const [fotos, setFotos] = useState(null); // null = ainda carregando

  useEffect(() => {
    if (!relatorio) return;
    let mounted = true;

    async function load() {
      const todas = [];

      // Fotos salvas diretamente no relatório
      const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
      for (const ev of evidencias) {
        if (ev.foto_url) todas.push(ev.foto_url);
      }

      // Se tiver menos de 6, busca ReportPhoto do período
      if (todas.length < 6 && relatorio.data_inicio) {
        try {
          const ano = new Date(relatorio.data_inicio).getFullYear();
          const rps = await base44.entities.ReportPhoto.filter(
            { ano, galeria_oculta: false }, '-created_date', 20
          ).catch(() => []);
          const mesInicio = new Date(relatorio.data_inicio).getMonth() + 1;
          const mesFim = new Date(relatorio.data_fim || relatorio.data_inicio).getMonth() + 1;
          for (const rp of (rps || [])) {
            if (!rp.file_url) continue;
            const rpMes = rp.mes_referencia ? Number(rp.mes_referencia) : null;
            if (rpMes !== null && (rpMes < mesInicio || rpMes > mesFim)) continue;
            todas.push(rp.file_url);
            if (todas.length >= 6) break;
          }
        } catch (_) {}
      }

      // Deduplicar
      const unicas = [...new Set(todas)].slice(0, 6);
      if (mounted) setFotos(unicas);
    }

    load();
    return () => { mounted = false; };
  }, [relatorio?.id]);

  return fotos;
}

// Mini galeria inline no card
function MiniGaleria({ relatorio, onExpandir }) {
  const fotos = usePreviewFotos(relatorio);

  if (fotos === null) return null; // ainda carregando, não exibe nada
  if (fotos.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Images className="w-3 h-3 text-slate-400" />
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
          {fotos.length} foto{fotos.length > 1 ? 's' : ''} disponível{fotos.length > 1 ? 'is' : ''}
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {fotos.slice(0, 5).map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={onExpandir}
            className="group relative w-14 h-14 rounded-md overflow-hidden border border-slate-200 bg-slate-100 hover:border-slate-400 hover:shadow-sm transition-all flex-shrink-0"
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover group-hover:scale-110 transition-transform"
              onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
            />
          </button>
        ))}
        {fotos.length === 6 && (
          <button
            type="button"
            onClick={onExpandir}
            className="w-14 h-14 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 font-medium transition-colors flex-shrink-0"
          >
            +mais
          </button>
        )}
      </div>
    </div>
  );
}

export default function BancoRelatorios() {
  const [relatorios, setRelatorios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [filtroMuseu, setFiltroMuseu] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAno, setFiltroAno] = useState('');

  const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Casa Kubitschek', 'Casa do Baile', 'MAP'];
  const anosDisponiveis = [...new Set(relatorios.map(r => r.data_inicio?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);

  useEffect(() => {
    carregarRelatorios();
  }, []);

  async function carregarRelatorios() {
    setLoading(true);
    try {
      const lista = await base44.entities.RelatorioExecucaoObjeto.filter({ publicado: true }, '-publicado_em', 100);
      setRelatorios(Array.isArray(lista) ? lista : []);
    } catch {
      setRelatorios([]);
    } finally {
      setLoading(false);
    }
  }

  const filtrados = relatorios.filter(r => {
    if (busca) {
      const q = busca.toLowerCase();
      const match =
        (r.titulo_publicacao || '').toLowerCase().includes(q) ||
        (r.data_inicio || '').includes(q) ||
        (r.data_fim || '').includes(q) ||
        (r.tipo || '').toLowerCase().includes(q) ||
        (r.filtro_museu || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filtroMuseu && (r.filtro_museu || '').toLowerCase() !== filtroMuseu.toLowerCase() && r.filtro_museu !== 'todos') return false;
    if (filtroTipo && r.tipo !== filtroTipo) return false;
    if (filtroAno && !(r.data_inicio || '').startsWith(filtroAno)) return false;
    return true;
  });

  const temFiltroAtivo = busca || filtroMuseu || filtroTipo || filtroAno;

  function limparFiltros() {
    setBusca('');
    setFiltroMuseu('');
    setFiltroTipo('');
    setFiltroAno('');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6" />
            Banco de Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Relatórios de Execução do Objeto autorizados para publicação
          </p>
        </div>
        <Badge variant="outline">{filtrados.length} relatório(s) disponível(is)</Badge>
      </div>

      {/* Banner de acesso restrito + pasta Drive */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Lock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">Acesso restrito a observadores autorizados</p>
            <p className="text-xs text-slate-500 mt-0.5">Somente relatórios marcados como prontos para publicação pelo ordenador estão disponíveis aqui.</p>
          </div>
        </div>
        <a
          href="https://drive.google.com/drive/folders/1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          <FolderOpen className="w-4 h-4 text-slate-500" />
          Pasta no Drive
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, período, museu..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={filtroMuseu}
            onChange={e => setFiltroMuseu(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 min-w-[160px]"
          >
            <option value="">Todos os museus</option>
            {MUSEUS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 min-w-[140px]"
          >
            <option value="">Todos os tipos</option>
            <option value="parcial">Parcial</option>
            <option value="final">Final</option>
          </select>
          <select
            value={filtroAno}
            onChange={e => setFiltroAno(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 min-w-[110px]"
          >
            <option value="">Todos os anos</option>
            {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {temFiltroAtivo && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{filtrados.length} resultado(s) encontrado(s)</p>
            <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors">
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando relatórios...</div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {temFiltroAtivo ? 'Nenhum relatório encontrado para os filtros selecionados.' : 'Nenhum relatório publicado ainda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtrados.map(r => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={r.tipo === 'final' ? 'default' : 'secondary'}>
                      {statusLabel(r.tipo)}
                    </Badge>
                    {r.filtro_museu && r.filtro_museu !== 'todos' && (
                      <Badge variant="outline">{r.filtro_museu}</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm leading-tight">
                    {r.titulo_publicacao || `Relatório de Execução — ${fmtDate(r.data_inicio)} a ${fmtDate(r.data_fim)}`}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>Período: {fmtDate(r.data_inicio)} a {fmtDate(r.data_fim)}</span>
                    {r.publicado_em && (
                      <span className="ml-2">• Publicado em {fmtDate(r.publicado_em?.slice(0,10))}</span>
                    )}
                  </div>
                  {r.publicado_por && (
                    <p className="text-xs text-muted-foreground">Autorizado por: {r.publicado_por}</p>
                  )}

                  {/* Miniaturas inline */}
                  <MiniGaleria
                    relatorio={r}
                    onExpandir={() => setDetalhe(detalhe?.id === r.id ? null : r)}
                  />
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setDetalhe(detalhe?.id === r.id ? null : r)}>
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Ver resumo
                  </Button>
                  {r.export_pdf_url && (
                    <a href={r.export_pdf_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <Download className="w-3.5 h-3.5 mr-1" />PDF
                      </Button>
                    </a>
                  )}
                  {r.drive_backup_url && (
                    <a href={r.drive_backup_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost">Drive</Button>
                    </a>
                  )}
                </div>
              </CardContent>

              {detalhe?.id === r.id && (
                <CardContent className="border-t pt-4 pb-4 space-y-3">
                  {r.descricao_acoes?.texto_editado || r.descricao_acoes?.texto_ia ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Descrição das Ações</p>
                      <p className="text-sm whitespace-pre-wrap text-slate-700 line-clamp-6">
                        {r.descricao_acoes?.texto_editado || r.descricao_acoes?.texto_ia}
                      </p>
                    </div>
                  ) : null}
                  {(r.cronograma_metas || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Metas ({r.cronograma_metas.length})
                      </p>
                      <div className="space-y-1">
                        {r.cronograma_metas.slice(0, 5).map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className={
                                (m.status_meta || '').includes('Integral') ? 'border-green-500 text-green-700' :
                                (m.status_meta || '').includes('Parcial') ? 'border-yellow-500 text-yellow-700' :
                                'border-red-400 text-red-600'
                              }
                            >
                              {m.percentual_execucao || 0}%
                            </Badge>
                            <span className="truncate">{m.meta_nome}</span>
                          </div>
                        ))}
                        {r.cronograma_metas.length > 5 && (
                          <p className="text-xs text-muted-foreground">+ {r.cronograma_metas.length - 5} metas...</p>
                        )}
                      </div>
                    </div>
                  )}
                  {r.publico_alvo?.realizado_direto > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-slate-50 border p-3">
                        <p className="text-xs text-muted-foreground">Público direto realizado</p>
                        <p className="font-bold text-lg">{(r.publico_alvo.realizado_direto || 0).toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-muted-foreground">{r.publico_alvo.percentual_direto || 0}% da meta</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 border p-3">
                        <p className="text-xs text-muted-foreground">Público indireto estimado</p>
                        <p className="font-bold text-lg">{(r.publico_alvo.realizado_indireto || 0).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                  )}

                  {/* Galeria de fotos vinculadas ao período */}
                  <div className="border-t pt-4">
                    <GaleriaDocumentosDrive relatorio={r} />
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}