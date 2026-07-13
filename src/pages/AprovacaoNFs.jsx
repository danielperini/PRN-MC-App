import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText, CheckCircle, XCircle, ExternalLink, Search, X,
  FileCode2, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function StatusXML({ intake }) {
  const temXml = !!(intake.nf_xml_url || intake.data?.nf_xml_url);
  if (temXml) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 rounded-full px-2.5 py-1">
      <FileCode2 className="w-3 h-3" /> XML vinculado
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-100 rounded-full px-2.5 py-1">
      <AlertCircle className="w-3 h-3" /> Sem XML
    </span>
  );
}

function NFCard({ intake, onAprovar, onRejeitar, processando }) {
  const [expandido, setExpandido] = useState(false);
  const d = intake.data || intake;
  const xmlUrl = d.nf_xml_url || intake.nf_xml_url;
  const pdfUrl = d.arquivo_original_url || intake.arquivo_original_url;
  const temXml = !!xmlUrl;
  const valor = d.nf_valor_total || intake.nf_valor_total;
  const fornecedor = d.nf_emitente_nome || d.fornecedor_nome || intake.fornecedor_nome || d.file_name_final || intake.file_name_final || '—';
  const numero = d.nf_numero || intake.nf_numero;
  const data_emissao = d.nf_data_emissao || intake.nf_data_emissao;
  const centro = d.centro_custo || intake.centro_custo;
  const rubrica = d.rubrica_nome_sugerida || '';
  const fileName = d.file_name_final || d.file_name_original || intake.file_name_final || intake.file_name_original || '—';

  // Pendências da IA
  const pendencias = d.resultado_ia?.response?.pendencias || [];
  const score = d.resultado_ia?.response?.score_confiabilidade;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      temXml ? 'border-gray-200' : 'border-orange-200'
    }`}>
      {/* Linha colorida topo */}
      <div className={`h-1 w-full ${temXml ? 'bg-green-400' : 'bg-orange-400'}`} />

      <div className="p-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              temXml ? 'bg-green-50' : 'bg-orange-50'
            }`}>
              <FileText className={`w-4 h-4 ${temXml ? 'text-green-600' : 'text-orange-500'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate" title={fileName}>{fileName}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{fornecedor}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusXML intake={intake} />
                {numero && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">NF {numero}</span>
                )}
                {data_emissao && (
                  <span className="text-[10px] text-gray-400">{data_emissao}</span>
                )}
                {score != null && (
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                    score >= 85 ? 'bg-green-100 text-green-700' : score >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                  }`}>
                    IA {score}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className="text-lg font-bold text-slate-900">{fmtBRL(valor)}</p>
            {centro && <span className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{centro}</span>}
          </div>
        </div>

        {/* Rubrica */}
        {rubrica && (
          <p className="text-[11px] text-gray-500 mt-2 truncate">
            <span className="font-semibold">Rubrica:</span> {rubrica}
          </p>
        )}

        {/* Links PDF / XML */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors">
              <ExternalLink className="w-3 h-3" /> Ver PDF
            </a>
          )}
          {xmlUrl && (
            <a href={xmlUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors">
              <FileCode2 className="w-3 h-3" /> Ver XML
            </a>
          )}
          {pendencias.length > 0 && (
            <button
              onClick={() => setExpandido(v => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-100 transition-colors"
            >
              <AlertCircle className="w-3 h-3" />
              {pendencias.length} pendência{pendencias.length !== 1 ? 's' : ''}
              {expandido ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Pendências expandidas */}
        {expandido && pendencias.length > 0 && (
          <div className="mt-3 rounded-xl bg-orange-50 border border-orange-100 p-3 space-y-1.5">
            {pendencias.map((p, i) => (
              <p key={i} className="text-[11px] text-orange-700 flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {p}
              </p>
            ))}
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button
            size="sm"
            disabled={processando === intake.id}
            onClick={() => onAprovar(intake)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5 rounded-xl"
          >
            {processando === intake.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle className="w-3.5 h-3.5" />
            }
            Aprovar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={processando === intake.id}
            onClick={() => onRejeitar(intake)}
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5 rounded-xl"
          >
            <XCircle className="w-3.5 h-3.5" /> Rejeitar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AprovacaoNFs() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtroXml, setFiltroXml] = useState('todos'); // 'todos' | 'com_xml' | 'sem_xml'
  const [processando, setProcessando] = useState(null);

  const { data: intakes = [], isLoading, refetch } = useQuery({
    queryKey: ['intakes-aprovacao'],
    queryFn: () => base44.entities.DocumentIntake.filter({ status_processamento: 'ENVIADO_APROVACAO' }, '-created_date', 200),
    staleTime: 1000 * 60 * 2,
  });

  const filtrados = useMemo(() => {
    return intakes.filter(item => {
      const d = item.data || item;
      const temXml = !!(d.nf_xml_url || item.nf_xml_url);

      if (filtroXml === 'com_xml' && !temXml) return false;
      if (filtroXml === 'sem_xml' && temXml) return false;

      if (busca) {
        const b = busca.toLowerCase();
        const fileName = (d.file_name_final || d.file_name_original || item.file_name_final || '').toLowerCase();
        const fornecedor = (d.nf_emitente_nome || d.fornecedor_nome || item.fornecedor_nome || '').toLowerCase();
        const numero = String(d.nf_numero || item.nf_numero || '').toLowerCase();
        return fileName.includes(b) || fornecedor.includes(b) || numero.includes(b);
      }
      return true;
    });
  }, [intakes, busca, filtroXml]);

  const comXml = useMemo(() => intakes.filter(i => !!(i.data?.nf_xml_url || i.nf_xml_url)).length, [intakes]);
  const semXml = intakes.length - comXml;

  async function handleAprovar(intake) {
    setProcessando(intake.id);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO'
      });
      // Se tiver purchase_request_id, atualizar o status lá também
      const prId = intake.data?.purchase_request_id || intake.entidade_destino_id;
      if (prId && (intake.entidade_destino === 'PurchaseRequest' || intake.data?.entidade_destino === 'PurchaseRequest')) {
        await base44.entities.PurchaseRequest.update(prId, { status: 'APROVADO_COORD' });
      }
      toast.success('NF aprovada com sucesso!');
      await refetch();
    } catch (e) {
      toast.error('Erro ao aprovar: ' + (e?.message || String(e)));
    } finally {
      setProcessando(null);
    }
  }

  async function handleRejeitar(intake) {
    setProcessando(intake.id);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'REJEITADO'
      });
      const prId = intake.data?.purchase_request_id || intake.entidade_destino_id;
      if (prId && (intake.entidade_destino === 'PurchaseRequest' || intake.data?.entidade_destino === 'PurchaseRequest')) {
        await base44.entities.PurchaseRequest.update(prId, { status: 'RECUSADO' });
      }
      toast.success('NF rejeitada.');
      await refetch();
    } catch (e) {
      toast.error('Erro ao rejeitar: ' + (e?.message || String(e)));
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shadow-sm">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Aprovação de NFs</h1>
            <p className="text-sm text-gray-400">Notas fiscais aguardando aprovação com status dos XMLs</p>
          </div>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2 rounded-xl">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{intakes.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total aguardando</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{comXml}</p>
          <p className="text-xs text-green-600 mt-0.5">Com XML</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{semXml}</p>
          <p className="text-xs text-orange-500 mt-0.5">Sem XML</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, fornecedor, número…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-black">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'com_xml', label: 'Com XML' },
            { key: 'sem_xml', label: 'Sem XML' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroXml(f.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                filtroXml === f.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              <Filter className="w-3 h-3" /> {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Carregando NFs…</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">Nenhuma NF aguardando aprovação</p>
          <p className="text-sm text-gray-400 mt-1">
            {busca || filtroXml !== 'todos' ? 'Tente mudar os filtros' : 'Todas as NFs foram processadas'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{filtrados.length} nota{filtrados.length !== 1 ? 's' : ''} encontrada{filtrados.length !== 1 ? 's' : ''}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {filtrados.map(intake => (
              <NFCard
                key={intake.id}
                intake={intake}
                onAprovar={handleAprovar}
                onRejeitar={handleRejeitar}
                processando={processando}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}