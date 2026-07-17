import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollText, Download, Search, Calendar, FileText, Eye, FolderOpen, ExternalLink, Lock } from 'lucide-react';

function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function statusLabel(tipo) {
  return tipo === 'final' ? 'Final' : 'Parcial';
}

export default function BancoRelatorios() {
  const [relatorios, setRelatorios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [detalhe, setDetalhe] = useState(null);

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
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      (r.titulo_publicacao || '').toLowerCase().includes(q) ||
      (r.data_inicio || '').includes(q) ||
      (r.data_fim || '').includes(q) ||
      (r.tipo || '').toLowerCase().includes(q) ||
      (r.filtro_museu || '').toLowerCase().includes(q)
    );
  });

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, período, museu..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando relatórios...</div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {busca ? 'Nenhum relatório encontrado para esta busca.' : 'Nenhum relatório publicado ainda.'}
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
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}