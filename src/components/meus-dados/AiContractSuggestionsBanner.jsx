import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, X, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';

// Novos campos extraíveis do contrato
const EXTENDED_FIELD_MAP = [
  { formKey: 'cpf', label: 'CPF' },
  { formKey: 'telefone', label: 'Telefone' },
  { formKey: 'celular', label: 'Celular' },
  { formKey: 'email_pessoal', label: 'Email Pessoal' },
  { formKey: 'endereco_residencial', label: 'Endereço Residencial' },
  { formKey: 'contato_emergencia_nome', label: 'Contato de Emergência' },
  { formKey: 'contato_emergencia_telefone', label: 'Tel. de Emergência' },
  { formKey: 'museu_vinculado', label: 'Museu Vinculado' },
  { formKey: 'contrato_num_parcelas', label: 'Nº de Parcelas' },
  { formKey: 'contrato_valor_parcela', label: 'Valor por Parcela' },
  { formKey: 'pix_key', label: 'Chave PIX' },
  { formKey: 'cnpj', label: 'CNPJ' },
  { formKey: 'empresa_nome', label: 'Razão Social' },
  { formKey: 'empresa_endereco', label: 'Endereço Empresa' },
  { formKey: 'representante_legal_nome', label: 'Representante Legal' },
  { formKey: 'representante_legal_cpf', label: 'CPF Representante' },
  { formKey: 'cargo_representante', label: 'Cargo Representante' },
  { formKey: 'banco', label: 'Banco' },
  { formKey: 'agencia', label: 'Agência' },
  { formKey: 'conta', label: 'Conta' },
  { formKey: 'tipo_conta', label: 'Tipo de Conta' },
];

function labelFor(key) {
  return EXTENDED_FIELD_MAP.find(f => f.formKey === key)?.label || key;
}

export default function AiContractSuggestionsBanner({ userEmail, onConfirm, appliedFields = {} }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [contractSource, setContractSource] = useState('');
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const appliedCount = Object.keys(appliedFields).length;

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      // Buscar contrato aprovado do usuário em DocumentIntake
      const intakes = await base44.entities.DocumentIntake.filter({
        user_email: userEmail,
        entidade_destino: 'TeamMember',
        status_processamento: 'APROVADO',
      }, '-created_date', 5);

      const contrato = intakes.find(i => i.contrato_drive_url || i.arquivo_original_url);

      if (!contrato) {
        // Fallback: buscar TeamMember com dados
        const members = await base44.entities.TeamMember.filter({ user_email: userEmail });
        const member = members?.[0];
        if (!member) {
          setError('Nenhum contrato aprovado encontrado. Faça o upload via Entrada de Documentos.');
          setLoading(false);
          return;
        }
        // Montar sugestões a partir do TeamMember
        const s = {};
        for (const { formKey } of EXTENDED_FIELD_MAP) {
          const v = member[formKey];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            s[formKey] = { aiValue: String(v).trim(), source: 'perfil_equipe' };
          }
        }
        if (!Object.keys(s).length) {
          setError('Cadastro de equipe encontrado mas sem dados suficientes para sugestões.');
          setLoading(false);
          return;
        }
        setContractSource(member.user_name || 'Perfil de Equipe');
        setSuggestions(s);
        setExpanded(true);
        setLoading(false);
        return;
      }

      // Invocar extração de dados do contrato via IA
      const fileUrl = contrato.contrato_drive_url || contrato.arquivo_original_url;
      setContractSource(contrato.file_name_final || contrato.file_name_original || 'Contrato');

      const res = await base44.functions.invoke('extrairDadosContratoIA', {
        contract_url: fileUrl,
        user_email: userEmail,
        team_member_id: contrato.contrato_team_member_id,
      });

      const data = res?.data || {};
      const s = {};
      const mapping = {
        cpf: data.cpf,
        celular: data.celular || data.telefone_celular,
        telefone: data.telefone,
        email_pessoal: data.email_pessoal || data.email,
        endereco_residencial: data.endereco_residencial || data.endereco,
        contato_emergencia_nome: data.contato_emergencia_nome,
        contato_emergencia_telefone: data.contato_emergencia_telefone,
        museu_vinculado: data.museu || data.museu_vinculado,
        contrato_num_parcelas: data.num_parcelas || data.numero_parcelas || data.parcelas,
        contrato_valor_parcela: data.valor_parcela || data.valor_por_parcela,
        pix_key: data.pix_key || data.chave_pix,
        cnpj: data.cnpj,
        empresa_nome: data.empresa_nome || data.razao_social,
        empresa_endereco: data.empresa_endereco,
        representante_legal_nome: data.representante_legal_nome,
        representante_legal_cpf: data.representante_legal_cpf,
        cargo_representante: data.cargo_representante,
        banco: data.banco,
        agencia: data.agencia,
        conta: data.conta,
        tipo_conta: data.tipo_conta,
      };

      for (const [key, val] of Object.entries(mapping)) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          s[key] = { aiValue: String(val).trim(), source: 'contrato_ia' };
        }
      }

      if (!Object.keys(s).length) {
        setError('A IA não conseguiu extrair dados suficientes do contrato. Preencha manualmente.');
        setLoading(false);
        return;
      }
      setSuggestions(s);
      setExpanded(true);
    } catch (e) {
      setError('Erro ao analisar contrato: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (suggestions) onConfirm(suggestions);
  };

  const pendingCount = suggestions ? Object.keys(suggestions).filter(k => !appliedFields[k]).length : 0;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {appliedCount > 0
                ? `✓ ${appliedCount} campos preenchidos pelo contrato — revise e salve`
                : 'Preencher automaticamente com dados do contrato'}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {suggestions
                ? `Fonte: ${contractSource} · ${pendingCount} campo(s) com sugestão IA pendente de confirmação`
                : 'A IA extrai dados do seu contrato aprovado: parcelas, PIX, endereço, dados PJ e mais.'}
            </p>
            {error && (
              <p className="text-xs text-red-700 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {suggestions && (
            <button type="button" onClick={() => setExpanded(v => !v)} className="text-amber-600 hover:text-amber-800">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button type="button" onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-700 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!suggestions && (
        <div className="px-4 pb-4">
          <Button
            type="button"
            size="sm"
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
          >
            {loading
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Analisando contrato...</>
              : <><Sparkles className="w-3 h-3 mr-1.5" />Analisar contrato e sugerir campos</>}
          </Button>
        </div>
      )}

      {suggestions && expanded && (
        <div className="border-t border-amber-200 bg-white/70 px-4 py-3 space-y-3">
          <p className="text-xs text-amber-800 font-medium">
            Campos com fundo amarelo foram sugeridos pela IA. Confirme para aplicar ao formulário:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {Object.entries(suggestions).map(([key, s]) => {
              const applied = !!appliedFields[key];
              return (
                <div
                  key={key}
                  className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2 ${applied ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                >
                  <span className="font-medium truncate flex-shrink-0">{labelFor(key)}</span>
                  <span className="truncate text-right text-slate-600 max-w-[140px]">{s.aiValue}</span>
                  {applied && <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
            >
              <Sparkles className="w-3 h-3 mr-1.5" />
              {appliedCount > 0 ? 'Reaplicar sugestões' : 'Aplicar sugestões ao formulário'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(false)} className="text-xs">
              Fechar
            </Button>
          </div>
          <p className="text-xs text-amber-600">Nada é salvo automaticamente — clique em "Salvar Dados" após revisar.</p>
        </div>
      )}
    </div>
  );
}