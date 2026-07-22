import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, ExternalLink, Search, Download,
  FolderOpen, FileText, Globe, CheckCircle2, AlertTriangle, XCircle, Sparkles
} from 'lucide-react';

const TIPOS_LABEL = {
  google_drive_pasta: '📁 Pasta Drive',
  google_drive_arquivo: '📄 Arquivo Drive',
  google_sheets: '📊 Sheets',
  google_docs: '📝 Docs',
  google_forms: '📋 Forms',
  relatorio_pdf: '📑 Relatório',
  nota_fiscal: '🧾 Nota Fiscal',
  foto: '🖼️ Foto',
  site_externo: '🌐 Site Externo',
  youtube: '▶️ YouTube',
  instagram: '📷 Instagram',
  adobe: '🎨 Adobe',
  truncado: '⚠️ Truncado',
};

const SITUACAO_CONFIG = {
  ok: { label: 'OK', cor: 'bg-green-100 text-green-700 border-green-200', icone: CheckCircle2 },
  pendente: { label: 'Pendente', cor: 'bg-amber-100 text-amber-700 border-amber-200', icone: AlertTriangle },
  truncado: { label: 'Truncado', cor: 'bg-red-100 text-red-700 border-red-200', icone: XCircle },
  aberto_publicamente: { label: 'Público', cor: 'bg-blue-100 text-blue-700 border-blue-200', icone: Globe },
  erro: { label: 'Erro', cor: 'bg-red-100 text-red-700 border-red-200', icone: XCircle },
};

function SituacaoBadge({ situacao }) {
  const cfg = SITUACAO_CONFIG[situacao] || SITUACAO_CONFIG.pendente;
  const Icone = cfg.icone;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.cor}`}>
      <Icone className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function LinkRow({ link }) {
  return (
    <tr className="border-b hover:bg-slate-50 transition-colors">
      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{TIPOS_LABEL[link.tipo] || link.tipo}</td>
      <td className="px-3 py-2 text-sm font-medium max-w-xs truncate" title={link.nome}>{link.nome || '—'}</td>
      <td className="px-3 py-2">
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs truncate max-w-xs"
          title={link.url}
        >
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
          {link.url?.slice(0, 60)}{link.url?.length > 60 ? '…' : ''}
        </a>
      </td>
      <td className="px-3 py-2"><SituacaoBadge situacao={link.situacao} /></td>
      <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate" title={link.origem}>{link.origem || '—'}</td>
      <td className="px-3 py-2 text-xs text-slate-400">{link.paginas_referencia || '—'}</td>
    </tr>
  );
}

export default function AcervoLinks() {
  const [links, setLinks] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [progresso, setProgresso] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroSituacao, setFiltroSituacao] = useState('todos');

  async function carregarLinks() {
    setCarregando(true);
    try {
      const lista = await base44.entities.LinkAcervo.list('-gerado_em', 2000);
      setLinks(Array.isArray(lista) ? lista : []);
    } catch (e) {
      toast.error('Erro ao carregar acervo: ' + e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarLinks(); }, []);

  async function executarConsolidacao() {
    setExecutando(true);
    setResultado(null);
    setProgresso([{ fase: 'inicio', msg: 'Iniciando consolidação...', ts: new Date().toISOString() }]);
    try {
      const res = await base44.functions.invoke('consolidarLinksAcervo', {});
      const data = res?.data || res;
      if (data.error) throw new Error(data.error);
      setResultado(data);
      setProgresso(data.progresso || []);
      toast.success(`Consolidação concluída — ${data.total_links} links no acervo.`);
      await carregarLinks();
    } catch (e) {
      toast.error('Erro na consolidação: ' + (e?.message || String(e)));
    } finally {
      setExecutando(false);
    }
  }

  const linksFiltrados = links.filter(l => {
    const buscaOk = !busca || (l.nome || '').toLowerCase().includes(busca.toLowerCase()) || (l.url || '').toLowerCase().includes(busca.toLowerCase());
    const tipoOk = filtroTipo === 'todos' || l.tipo === filtroTipo;
    const situacaoOk = filtroSituacao === 'todos' || l.situacao === filtroSituacao;
    return buscaOk && tipoOk && situacaoOk;
  });

  const stats = {
    total: links.length,
    ok: links.filter(l => l.situacao === 'ok').length,
    publico: links.filter(l => l.situacao === 'aberto_publicamente').length,
    pendente: links.filter(l => l.situacao === 'pendente').length,
    truncado: links.filter(l => l.situacao === 'truncado').length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Acervo de Links</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consolidação automática de todos os links do sistema e Google Drive
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregarLinks} disabled={carregando}>
            <RefreshCw className={`w-4 h-4 mr-1 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            onClick={executarConsolidacao}
            disabled={executando}
            className="bg-slate-900 hover:bg-slate-700 text-white"
          >
            {executando
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Sparkles className="w-4 h-4 mr-2 text-yellow-400" />}
            {executando ? 'Consolidando...' : 'Consolidar Acervo'}
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', valor: stats.total, cor: 'text-slate-800' },
          { label: 'OK', valor: stats.ok, cor: 'text-green-700' },
          { label: 'Público', valor: stats.publico, cor: 'text-blue-700' },
          { label: 'Pendente', valor: stats.pendente, cor: 'text-amber-700' },
          { label: 'Truncado', valor: stats.truncado, cor: 'text-red-700' },
        ].map(s => (
          <Card key={s.label} className="text-center py-3">
            <CardContent className="p-0">
              <p className={`text-2xl font-bold ${s.cor}`}>{s.valor}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Painel de progresso da execução */}
      {executando && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Executando consolidação em 7 fases...
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {progresso.map((p, i) => (
                <div key={i} className="text-xs text-blue-600 flex gap-2">
                  <span className="font-medium">[{p.fase}]</span>
                  <span>{p.msg}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado da última execução */}
      {resultado && !executando && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-green-800 font-semibold mb-3">
              <CheckCircle2 className="w-5 h-5" />
              Consolidação concluída — {resultado.timestamp?.slice(0, 10)}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                { l: 'Total links', v: resultado.total_links },
                { l: 'Reparados', v: resultado.total_reparados },
                { l: 'Abertos', v: resultado.total_abertos },
                { l: 'Pendentes', v: resultado.total_pendentes },
              ].map(s => (
                <div key={s.l} className="bg-white rounded-lg border border-green-200 p-3 text-center">
                  <p className="text-xl font-bold text-green-800">{s.v}</p>
                  <p className="text-xs text-green-600">{s.l}</p>
                </div>
              ))}
            </div>
            {resultado.pdf_drive_url && (
              <a
                href={resultado.pdf_drive_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-green-700 font-medium hover:underline"
              >
                <Download className="w-4 h-4" />
                Abrir relatório HTML no Drive
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filtros e tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links do Acervo ({linksFiltrados.length})</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou URL..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {Object.entries(TIPOS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroSituacao} onValueChange={setFiltroSituacao}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="ok">✅ OK</SelectItem>
                <SelectItem value="aberto_publicamente">🌍 Público</SelectItem>
                <SelectItem value="pendente">⏳ Pendente</SelectItem>
                <SelectItem value="truncado">⚠️ Truncado</SelectItem>
                <SelectItem value="erro">❌ Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {carregando ? (
            <div className="py-12 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando acervo...
            </div>
          ) : linksFiltrados.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              {links.length === 0
                ? 'Nenhum link no acervo. Execute a consolidação para popular.'
                : 'Nenhum link encontrado com os filtros aplicados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Nome</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">URL</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Situação</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Origem</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Páginas</th>
                  </tr>
                </thead>
                <tbody>
                  {linksFiltrados.map(link => (
                    <LinkRow key={link.id} link={link} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}