import React from 'react';
import { Button } from '@/components/ui/button';
import { getFieldStateLabel, getFieldStateColor } from '@/hooks/useDocumentAnalysis';
import { RotateCcw, Sparkles, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

const FIELD_LABELS = {
  fornecedor_nome: 'Fornecedor',
  fornecedor_cpf_cnpj: 'CPF/CNPJ',
  nf_numero: 'Nº da NF',
  nf_valor_total: 'Valor',
  nf_data_emissao: 'Data emissão',
  nf_chave_acesso: 'Chave de acesso',
  descricao_servico: 'Descrição',
  categoria: 'Categoria',
  tipo_gasto: 'Tipo',
  centro_custo: 'Centro de custo',
  rubrica: 'Rubrica',
  meta: 'Meta',
  meio_pagamento: 'Meio pgto',
  dados_bancarios: 'Dados bancários',
  chave_pix: 'Chave PIX',
  competencia: 'Competência',
  municipio: 'Município',
  observacoes: 'Observações',
  contrato_numero: 'Contrato',
  nf_valor_liquido: 'Valor líquido',
  nf_retencoes: 'Retenções',
};

function formatValor(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (typeof v === 'object' && v?.nome) return v.nome;
  return String(v);
}

function barColor(count, total) {
  if (!total) return 'bg-gray-200';
  const pct = count / total;
  if (pct >= 0.7) return 'bg-green-500';
  if (pct >= 0.4) return 'bg-amber-500';
  return 'bg-red-400';
}

export default function AnalysisSummary({ dadosAnalise, analisando, onReanalisar, fieldStates }) {
  if (analisando) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-blue-700">Analisando documentos...</span>
        </div>
        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
        <p className="text-xs text-blue-500">Lendo XML, PDF e cruzando com cadastros internos...</p>
      </div>
    );
  }

  if (!dadosAnalise?.campos || !Object.keys(dadosAnalise.campos).length) return null;

  const { campos, resumo, erros } = dadosAnalise;
  const entries = Object.entries(campos).filter(([, c]) => c?.valor);
  const total = entries.length + (resumo?.nao_localizados || 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* Resumo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-700">Análise dos documentos</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={onReanalisar}
          disabled={analisando}
        >
          <RotateCcw className="h-3 w-3" />
          Reanalisar
        </Button>
      </div>

      {/* Barras de progresso */}
      <div className="flex gap-2 text-xs">
        <div className="flex-1 text-center">
          <div className={`text-lg font-bold ${barColor(resumo?.preenchidos || 0, total)}`} style={{ color: undefined }}>
            {resumo?.preenchidos || 0}
          </div>
          <div className="text-gray-500">preenchidos</div>
        </div>
        <div className="flex-1 text-center">
          <div className={`text-lg font-bold ${(resumo?.sugeridos || 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>  
            {resumo?.sugeridos || 0}
          </div>
          <div className="text-gray-500">sugeridos</div>
        </div>
        <div className="flex-1 text-center">
          <div className={`text-lg font-bold ${(resumo?.nao_localizados || 0) > 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {resumo?.nao_localizados || 0}
          </div>
          <div className="text-gray-500">não localizados</div>
        </div>
      </div>

      {/* Tabela de campos */}
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Campo</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Valor</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Origem</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500">Confiança</th>
              <th className="text-center px-3 py-2 font-medium text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, campo]) => (
              <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2 font-medium text-gray-600">
                  {FIELD_LABELS[key] || key}
                </td>
                <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">
                  {formatValor(campo.valor)}
                </td>
                <td className="px-3 py-2 text-gray-400 capitalize">
                  {campo.origem === 'xml' ? 'XML' :
                   campo.origem === 'ia_pdf' ? 'IA + PDF' :
                   campo.origem === 'cadastro' ? 'Cadastro' :
                   campo.origem === 'inferencia' ? 'IA + contexto' :
                   campo.origem === 'rubrica' ? 'Rubrica' :
                   campo.origem || 'IA'}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`font-semibold ${
                    (campo.confianca || 0) >= 90 ? 'text-green-600' :
                    (campo.confianca || 0) >= 70 ? 'text-amber-600' :
                    'text-red-500'
                  }`}>
                    {campo.confianca || 0}%
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[10px] font-semibold ${getFieldStateColor(fieldStates?.[key] || campo.estado)}`}>
                    {getFieldStateLabel(fieldStates?.[key] || campo.estado)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Erros */}
      {erros?.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 space-y-1">
          {erros.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400">
        Os campos com confiança alta foram preenchidos automaticamente. Confira as sugestões e confirme os dados.
      </p>
    </div>
  );
}