import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Sparkles, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Eye, Play, Info } from 'lucide-react';
import { toast } from 'sonner';

const CAMPO_LABELS = {
  nome_profissional: 'Nome',
  funcao: 'Função',
  museu: 'Museu',
  mes_referencia: 'Mês',
  ano: 'Ano',
  resumo_periodo: 'Resumo do período',
  resumo_executivo: 'Resumo executivo',
  pontos_positivos: 'Pontos positivos',
  desafios: 'Desafios',
  sugestoes: 'Sugestões',
  comentarios_gerais: 'Comentários',
  publico_geral: 'Público geral',
};

function CampoIA({ label, value }) {
  const [expandido, setExpandido] = useState(false);
  if (!value) return null;
  const texto = String(value);
  const longo = texto.length > 120;
  return (
    <div className="py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
        {longo && !expandido ? texto.slice(0, 120) + '…' : texto}
        {longo && (
          <button
            onClick={() => setExpandido(e => !e)}
            className="ml-1 text-blue-500 hover:underline text-[10px]"
          >
            {expandido ? 'menos' : 'ver tudo'}
          </button>
        )}
      </p>
    </div>
  );
}

function CardArquivo({ item, modo }) {
  const [expandido, setExpandido] = useState(false);
  const ia = item.dados_ia;
  const statusColor = {
    'dry-run': 'border-blue-200 bg-blue-50',
    'preenchido': 'border-green-200 bg-green-50',
    'criado': 'border-emerald-200 bg-emerald-50',
    'duplicado': 'border-gray-200 bg-gray-50',
    'importado': 'border-slate-200 bg-slate-50',
    'importado_sem_relatorio': 'border-orange-200 bg-orange-50',
  }[item.status] || 'border-gray-100 bg-white';

  const statusBadge = {
    'dry-run': <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">Preview IA</Badge>,
    'preenchido': <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">Preenchido</Badge>,
    'criado': <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">Criado</Badge>,
    'duplicado': <Badge variant="secondary" className="text-[10px]">Duplicado</Badge>,
    'importado': <Badge variant="outline" className="text-[10px]">Importado</Badge>,
    'importado_sem_relatorio': <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-[10px]">Importado (sem relat.)</Badge>,
  }[item.status] || <Badge variant="outline" className="text-[10px]">{item.status}</Badge>;

  return (
    <div className={`rounded-xl border ${statusColor} overflow-hidden`}>
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer"
        onClick={() => ia && setExpandido(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{item.filename}</p>
          <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.subject}</p>
          {ia && (
            <p className="text-[10px] text-blue-600 mt-0.5">
              {[ia.nome_profissional, ia.museu, ia.mes_referencia && ia.ano ? `${ia.mes_referencia}/${ia.ano}` : null]
                .filter(Boolean).join(' · ')}
              {item.atividades_count > 0 ? ` · ${item.atividades_count} atividade(s)` : ''}
              {item.atividades?.length > 0 || (item.campos_preenchidos?.length > 0) ?
                ` · ${(item.campos_preenchidos || []).join(', ')}` : ''}
            </p>
          )}
          {item.erro && <p className="text-[10px] text-red-500 mt-0.5 truncate">{item.erro}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge}
          {ia && (
            <button className="text-gray-400 hover:text-gray-700">
              {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Preview dos dados extraídos pela IA */}
      {expandido && ia && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-white space-y-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Dados extraídos pela IA
          </p>
          <div className="grid md:grid-cols-2 gap-x-6">
            <div>
              {Object.entries(CAMPO_LABELS).slice(0, 7).map(([k, label]) => (
                ia[k] ? <CampoIA key={k} label={label} value={ia[k]} /> : null
              ))}
            </div>
            <div>
              {Object.entries(CAMPO_LABELS).slice(7).map(([k, label]) => (
                ia[k] ? <CampoIA key={k} label={label} value={ia[k]} /> : null
              ))}
            </div>
          </div>

          {/* Preview das atividades */}
          {(item.atividades_preview || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Atividades extraídas ({item.atividades_count})
              </p>
              <div className="space-y-1.5">
                {item.atividades_preview.map((a, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      a.classificacao === 'META' ? 'bg-purple-400' :
                      a.classificacao === 'EXTRA' ? 'bg-blue-400' : 'bg-gray-400'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700">{a.titulo}</p>
                      <p className="text-[10px] text-gray-400">
                        {[a.data, a.publico ? `${a.publico} participantes` : null, a.classificacao].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                ))}
                {item.atividades_count > (item.atividades_preview?.length || 0) && (
                  <p className="text-[10px] text-gray-400 pl-3">
                    + {item.atividades_count - (item.atividades_preview?.length || 0)} atividade(s) não exibidas
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PainelGmailRelatorios() {
  const [etapa, setEtapa] = useState('idle'); // idle | simulando | validando | aplicando | concluido
  const [resultado, setResultado] = useState(null);
  const [aplicando, setAplicando] = useState(false);

  // Etapa 1: Simulação (dryRun=true) — analisa e mostra preview
  async function handleSimular() {
    setEtapa('simulando');
    setResultado(null);
    toast.info('Analisando e-mails com IA… aguarde (pode levar 1–2 minutos).');
    try {
      const res = await base44.functions.invoke('buscarRelatoriosGmailViaduto', {
        maxResults: 50,
        dryRun: true,
        preencherRelatorios: true,
      });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      setEtapa('validando');
      const count = (d.resultados || []).filter(r => r.status === 'dry-run').length;
      if (count === 0) {
        toast.info('Nenhum arquivo novo encontrado (todos já importados ou sem anexos relevantes).');
      } else {
        toast.success(`${count} arquivo(s) analisado(s) pela IA. Revise os dados antes de confirmar.`);
      }
    } catch (e) {
      toast.error('Erro na análise: ' + (e?.message || e));
      setEtapa('idle');
    }
  }

  // Etapa 2: Aplicar (dryRun=false) — salva e preenche
  async function handleAplicar() {
    setAplicando(true);
    setEtapa('aplicando');
    toast.info('Salvando e preenchendo relatórios… aguarde.');
    try {
      const res = await base44.functions.invoke('buscarRelatoriosGmailViaduto', {
        maxResults: 50,
        dryRun: false,
        preencherRelatorios: true,
      });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultado(d);
      setEtapa('concluido');
      toast.success(`${d.importados} arquivo(s) importados · ${d.relatoriosPreenchidos} relatório(s) preenchidos`);
    } catch (e) {
      toast.error('Erro ao aplicar: ' + (e?.message || e));
      setEtapa('validando');
    } finally {
      setAplicando(false);
    }
  }

  const itensPreview = (resultado?.resultados || []).filter(r => r.status === 'dry-run');
  const itensConcluidos = (resultado?.resultados || []).filter(r => ['preenchido', 'criado'].includes(r.status));
  const itensDuplicados = (resultado?.resultados || []).filter(r => r.status === 'duplicado');

  return (
    <div className="rounded-2xl border border-blue-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-blue-900">Relatórios via Gmail</h2>
            <p className="text-xs text-blue-600">danielperini.mc@viadutodasartes.org.br · IA analisa e preenche automaticamente</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(etapa === 'idle' || etapa === 'concluido') && (
            <Button
              onClick={handleSimular}
              size="sm"
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl"
            >
              <Eye className="w-3.5 h-3.5" />
              {etapa === 'concluido' ? 'Analisar novamente' : 'Analisar e-mails'}
            </Button>
          )}

          {etapa === 'simulando' && (
            <Button disabled size="sm" className="gap-1.5 bg-blue-600 text-white rounded-xl">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando…
            </Button>
          )}

          {etapa === 'validando' && itensPreview.length > 0 && (
            <Button
              onClick={handleAplicar}
              size="sm"
              className="gap-1.5 bg-green-600 text-white hover:bg-green-700 rounded-xl"
            >
              <Play className="w-3.5 h-3.5" />
              Confirmar e preencher ({itensPreview.length})
            </Button>
          )}

          {etapa === 'aplicando' && (
            <Button disabled size="sm" className="gap-1.5 bg-green-600 text-white rounded-xl">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aplicando…
            </Button>
          )}
        </div>
      </div>

      {/* Estado inicial */}
      {etapa === 'idle' && (
        <div className="px-5 py-8 text-center">
          <Mail className="w-8 h-8 text-blue-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">Análise em duas etapas</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Primeiro a IA analisa os e-mails e mostra um preview dos dados extraídos para você validar.
            Só depois de confirmar os dados são salvos.
          </p>
        </div>
      )}

      {/* Preview dos dados para validação */}
      {(etapa === 'validando' || etapa === 'simulando') && resultado && (
        <div className="p-5 space-y-4">

          {/* Contadores */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Analisados', value: itensPreview.length, color: 'text-blue-700' },
              { label: 'Ignorados/Dup.', value: resultado.ignorados || 0, color: 'text-gray-500' },
              { label: 'Erros', value: resultado.erros || 0, color: 'text-red-600' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Aviso de validação */}
          {itensPreview.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Revise os dados abaixo</strong> antes de confirmar. Expanda cada arquivo para ver os campos que serão preenchidos nos relatórios.
              </span>
            </div>
          )}

          {/* Lista de arquivos com preview */}
          {itensPreview.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Arquivos para importar:</p>
              {itensPreview.map((item, i) => (
                <CardArquivo key={i} item={item} modo="preview" />
              ))}
            </div>
          )}

          {/* Duplicados */}
          {itensDuplicados.length > 0 && (
            <details className="rounded-xl border border-gray-100 overflow-hidden">
              <summary className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 cursor-pointer">
                {itensDuplicados.length} arquivo(s) já existente(s) — ignorados
              </summary>
              <div className="px-4 py-2 space-y-1 max-h-32 overflow-y-auto">
                {itensDuplicados.map((item, i) => (
                  <p key={i} className="text-[10px] text-gray-400 truncate">• {item.filename}</p>
                ))}
              </div>
            </details>
          )}

          {itensPreview.length === 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-6 text-center">
              <CheckCircle2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhum arquivo novo encontrado.</p>
              <p className="text-xs text-gray-400 mt-0.5">Todos os anexos relevantes já foram importados anteriormente.</p>
            </div>
          )}
        </div>
      )}

      {/* Resultado após aplicação */}
      {etapa === 'concluido' && resultado && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Importados', value: resultado.importados || 0, color: 'text-blue-700' },
              { label: 'Relatórios preenchidos', value: resultado.relatoriosPreenchidos || 0, color: 'text-green-700' },
              { label: 'Ignorados', value: resultado.ignorados || 0, color: 'text-gray-500' },
              { label: 'Erros', value: resultado.erros || 0, color: 'text-red-600' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {itensConcluidos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Relatórios processados:</p>
              {itensConcluidos.map((item, i) => (
                <CardArquivo key={i} item={item} modo="resultado" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}