/**
 * PainelAnaliseDeterministica
 * Exibe o resultado da análise determinística de NF:
 * dados identificados, origem, status e divergências.
 */
import React from 'react';
import { CheckCircle2, AlertTriangle, Info, Zap } from 'lucide-react';

const ORIGEM_LABEL = {
  descricao_nf: 'Descrição NF',
  documento: 'Documento',
  xml: 'XML',
  nome_arquivo: 'Nome do arquivo',
  dados_estruturados: 'Dados estruturados',
};

const STATUS_CONFIG = {
  CONFORME: { label: 'Conforme', color: 'bg-green-50 border-green-200 text-green-800', icon: <CheckCircle2 className="w-4 h-4 text-green-600" /> },
  AJUSTE_NECESSARIO: { label: 'Ajuste necessário', color: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> },
  REVISAR: { label: 'Revisar', color: 'bg-red-50 border-red-200 text-red-800', icon: <AlertTriangle className="w-4 h-4 text-red-600" /> },
};

const TIPO_LABEL = {
  MANUTENCAO_ROTINA: 'Manutenção de Rotina',
  COLABORADOR_MENSAL: 'Colaborador Mensal',
  MATERIAL: 'Material',
  SERVICO_EVENTO: 'Serviço / Evento',
  OUTRO: 'Outro',
};

function CampoItem({ campo, valor, origem }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 w-32 flex-shrink-0 capitalize">{campo.replace(/_/g, ' ')}</span>
      <span className="text-xs font-medium text-slate-800 flex-1 text-right">{valor}</span>
      {origem && (
        <span className="text-[10px] rounded-full bg-slate-100 text-slate-500 px-1.5 py-0.5 flex-shrink-0">
          {ORIGEM_LABEL[origem] || origem}
        </span>
      )}
    </div>
  );
}

export default function PainelAnaliseDeterministica({ analise, isCoordenador, onReanalisar, reanalisando }) {
  if (!analise) return null;

  const statusCfg = STATUS_CONFIG[analise.status] || STATUS_CONFIG.AJUSTE_NECESSARIO;

  const camposExibir = [
    analise.museu && { campo: 'Museu', valor: analise.museu, origem: 'descricao_nf' },
    analise.funcao && { campo: 'Função', valor: analise.funcao, origem: 'descricao_nf' },
    analise.servico && { campo: 'Serviço', valor: analise.servico, origem: 'descricao_nf' },
    analise.material && { campo: 'Material', valor: analise.material, origem: 'descricao_nf' },
    analise.evento_acao && { campo: 'Evento / Ação', valor: analise.evento_acao, origem: 'descricao_nf' },
    analise.data_execucao && { campo: 'Data de Execução', valor: analise.data_execucao, origem: 'descricao_nf' },
    analise.data_evento && { campo: 'Data do Evento', valor: analise.data_evento, origem: 'descricao_nf' },
    analise.competencia && { campo: 'Competência', valor: analise.competencia, origem: 'descricao_nf' },
    analise.competencia_esperada && analise.competencia_ok === false && {
      campo: 'Competência Esperada',
      valor: analise.competencia_esperada,
      origem: 'regra',
    },
    analise.pix?.encontrado && { campo: 'PIX', valor: `${analise.pix.chave} (${analise.pix.tipo})`, origem: 'documento' },
  ].filter(Boolean);

  const temDados = camposExibir.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Cabeçalho */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${statusCfg.color}`}>
        <div className="flex items-center gap-2">
          {statusCfg.icon}
          <span className="text-xs font-semibold uppercase tracking-wide">
            Análise Automática — {statusCfg.label}
          </span>
          <span className="text-[10px] rounded bg-white/60 px-1.5 py-0.5 text-slate-600">
            {TIPO_LABEL[analise.tipo_despesa] || analise.tipo_despesa}
          </span>
        </div>
        {isCoordenador && (
          <button
            type="button"
            onClick={onReanalisar}
            disabled={reanalisando}
            className="text-[10px] text-slate-500 hover:text-slate-800 underline underline-offset-2 disabled:opacity-50"
          >
            {reanalisando ? 'Analisando...' : 'Reanalisar'}
          </button>
        )}
      </div>

      {/* Divergências */}
      {analise.divergencias?.length > 0 && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 space-y-1">
          {analise.divergencias.map((d, i) => (
            <div key={i} className="text-xs text-red-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                <strong>DIVERGÊNCIA — {d.campo}:</strong> Solicitação: <em>{d.solicitacao}</em> | Documento: <em>{d.documento}</em>
                {d.alerta && ` — ${d.alerta}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Campos identificados */}
      {temDados && (
        <div className="px-3 py-2 bg-white">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Dados identificados automaticamente
          </p>
          {camposExibir.map((c, i) => (
            <CampoItem key={i} {...c} />
          ))}
        </div>
      )}

      {/* Campos faltantes */}
      {analise.campos_faltantes?.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-[10px] text-amber-700 font-medium mb-1 flex items-center gap-1">
            <Info className="w-3 h-3" /> Campos obrigatórios ausentes na descrição:
          </p>
          <p className="text-[11px] text-amber-600">
            {analise.campos_faltantes.map((c) => c.replace(/_/g, ' ')).join(', ')}
          </p>
        </div>
      )}

      {/* Sugestão de descrição */}
      {analise.descricao_sugerida && analise.status !== 'CONFORME' && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-500 font-medium mb-1">Descrição sugerida:</p>
          <p className="text-[11px] text-slate-700 italic">{analise.descricao_sugerida}</p>
        </div>
      )}

      {/* Componentes obrigatórios */}
      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries({
            'Projeto MC': analise.componentes?.projeto_museus_centro,
            'Termo': analise.componentes?.termo_colaboracao_ok,
            'Nº Termo': analise.componentes?.numero_termo_ok,
            'SMC/FMC': analise.componentes?.parceria_smc_fmc_ok,
          }).map(([label, ok]) => (
            <span key={label} className={`text-[10px] flex items-center gap-0.5 ${ok ? 'text-green-600' : 'text-red-400'}`}>
              {ok ? '✓' : '✗'} {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}