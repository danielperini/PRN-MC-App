import React from 'react';
import { CheckCircle2, AlertTriangle, Info, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ORIGEM_BADGE = {
  'IA': { label: 'IA', cls: 'bg-purple-100 text-purple-700' },
  'XML': { label: 'XML', cls: 'bg-green-100 text-green-700' },
  'Nome do arquivo': { label: 'Nome do arquivo', cls: 'bg-blue-100 text-blue-700' },
  'Dados do intake': { label: 'Intake', cls: 'bg-slate-100 text-slate-600' },
  'Descrição do intake': { label: 'Descrição', cls: 'bg-slate-100 text-slate-600' },
  'Regra de negócio': { label: 'Regra', cls: 'bg-amber-100 text-amber-700' },
  'Análise semântica': { label: 'Semântica', cls: 'bg-indigo-100 text-indigo-700' },
  'Documento': { label: 'Documento', cls: 'bg-teal-100 text-teal-700' },
};

function OrigemBadge({ origem }) {
  const cfg = ORIGEM_BADGE[origem] || { label: origem, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const CAMPO_LABELS = {
  nf_numero: 'Número NF',
  nf_valor_total: 'Valor Total',
  nf_data_emissao: 'Data de Emissão',
  nf_emitente_nome: 'Fornecedor / Emitente',
  nf_emitente_cpf_cnpj: 'CNPJ / CPF',
  descricao_servico: 'Descrição do Serviço',
  competencia: 'Competência',
  museu: 'Museu Detectado',
  pix: 'Chave PIX',
  pix_tipo: 'Tipo PIX',
  tipo_despesa: 'Tipo de Despesa',
};

function formatarValor(campo, valor) {
  if (campo === 'nf_valor_total' && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (campo === 'componentes_termo' && Array.isArray(valor)) {
    return valor.length > 0 ? valor.join(', ') : '— nenhum componente identificado';
  }
  if (campo === 'material_especificado') return valor ? 'Sim' : 'Não';
  return String(valor ?? '—');
}

const STATUS_CONFIG = {
  CONFORME: { label: 'Conforme', icon: CheckCircle2, cls: 'text-green-700 bg-green-50 border-green-200' },
  AJUSTE_NECESSARIO: { label: 'Ajuste necessário', icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  REVISAR: { label: 'Revisar manualmente', icon: AlertTriangle, cls: 'text-red-700 bg-red-50 border-red-200' },
};

export default function PainelDadosIdentificadosNF({ analise, isCoordenador, onReanalisar, reanalisando }) {
  if (!analise) return null;

  const { campos, divergencias, alertas, status, executado_em } = analise;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.REVISAR;
  const StatusIcon = statusCfg.icon;

  const camposExibir = Object.entries(campos || {}).filter(
    ([k]) => CAMPO_LABELS[k] && k !== 'componentes_termo'
  );

  const dataExecucao = executado_em
    ? new Date(executado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      {/* Cabeçalho */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${statusCfg.cls}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-semibold">Dados Identificados Automaticamente — {statusCfg.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {dataExecucao && <span className="text-[10px] opacity-60">Análise: {dataExecucao}</span>}
          {isCoordenador && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 py-0"
              onClick={onReanalisar}
              disabled={reanalisando}
            >
              {reanalisando ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Reanalisar
            </Button>
          )}
        </div>
      </div>

      {/* Divergências */}
      {divergencias?.length > 0 && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 space-y-1">
          {divergencias.map((d, i) => (
            <div key={i} className="text-xs text-red-800 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-500" />
              <span>
                <strong>DIVERGÊNCIA</strong> — Campo: <strong>{CAMPO_LABELS[d.campo] || d.campo}</strong>
                {' | '}Solicitação: <em>{String(d.solicitacao ?? '—')}</em>
                {' | '}Nota Fiscal: <em>{String(d.nota_fiscal ?? '—')}</em>
                {' | '}Ação: <strong>{d.acao}</strong>
                {d.mensagem ? ` — ${d.mensagem}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Alertas */}
      {alertas?.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 space-y-1">
          {alertas.map((a, i) => (
            <div key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>{a.tipo}</strong> — {a.mensagem}
                {a.sugestao && <span className="block text-amber-600 italic">Sugestão: {a.sugestao}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Campos */}
      <div className="divide-y divide-slate-100">
        {camposExibir.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-400">Nenhum campo extraído.</p>
        )}
        {camposExibir.map(([chave, c]) => (
          <div key={chave} className="flex items-center justify-between px-4 py-2 text-xs">
            <span className="text-slate-500 w-36 flex-shrink-0">{CAMPO_LABELS[chave]}</span>
            <span className="flex-1 font-medium text-slate-800 truncate mx-2">
              {formatarValor(chave, c.valor)}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <OrigemBadge origem={c.origem} />
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}