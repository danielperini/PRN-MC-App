import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';

// Mapeamento: campo do formulário → campo do TeamMember + metadata
const FIELD_MAP = [
  { formKey: 'cpf',                     contractKey: 'cpf',                      label: 'CPF',                    confidence: 1.0 },
  { formKey: 'telefone',                contractKey: 'telefone',                  label: 'Telefone',               confidence: 0.9 },
  { formKey: 'email_pessoal',           contractKey: 'email_pessoal',             label: 'Email Pessoal',          confidence: 0.9 },
  { formKey: 'cnpj',                    contractKey: 'cnpj',                      label: 'CNPJ',                   confidence: 1.0 },
  { formKey: 'empresa_nome',            contractKey: 'empresa_nome',              label: 'Razão Social',           confidence: 0.9 },
  { formKey: 'empresa_endereco',        contractKey: 'empresa_endereco',          label: 'Endereço Empresa',       confidence: 0.85 },
  { formKey: 'representante_legal_nome',contractKey: 'representante_legal_nome',  label: 'Representante Legal',    confidence: 0.95 },
  { formKey: 'representante_legal_cpf', contractKey: 'representante_legal_cpf',   label: 'CPF do Representante',   confidence: 0.95 },
  { formKey: 'cargo_representante',     contractKey: 'cargo_representante',       label: 'Cargo do Representante', confidence: 0.85 },
  { formKey: 'banco',                   contractKey: 'banco',                     label: 'Banco',                  confidence: 0.95 },
  { formKey: 'agencia',                 contractKey: 'agencia',                   label: 'Agência',                confidence: 0.95 },
  { formKey: 'conta',                   contractKey: 'conta',                     label: 'Conta',                  confidence: 0.95 },
  { formKey: 'tipo_conta',              contractKey: 'tipo_conta',                label: 'Tipo de Conta',          confidence: 1.0 },
  { formKey: 'pix_key',                 contractKey: 'pix_key',                   label: 'Chave PIX',              confidence: 0.9 },
];

/**
 * Busca o TeamMember vinculado ao utilizador autenticado como fonte do contrato.
 * O contrato e os dados extraídos pela IA ficam no próprio TeamMember.
 */
async function fetchBestContract(userEmail) {
  const members = await base44.entities.TeamMember.filter({ user_email: userEmail });
  if (!members?.length) return null;
  // Priorizar membro com contrato_url (contrato anexado)
  const withContract = members.filter(m => m.contrato_url);
  if (withContract.length) {
    return withContract.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
  }
  // Fallback: qualquer membro com dados financeiros
  return members.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
}

/**
 * Extrai os valores do TeamMember e monta as sugestões.
 * Retorna { fieldKey: { aiValue, confidence, sourceContractId, sourceFileName } }
 */
function extractSuggestions(member) {
  const suggestions = {};
  const sourceFileName = member.contrato_url
    ? (member.user_name ? `Contrato de ${member.user_name}` : 'Contrato anexado')
    : `Perfil de equipe (${member.funcao || member.user_name})`;
  for (const { formKey, contractKey, confidence } of FIELD_MAP) {
    const aiValue = member[contractKey];
    if (aiValue !== undefined && aiValue !== null && String(aiValue).trim() !== '') {
      suggestions[formKey] = {
        aiValue: String(aiValue).trim(),
        confidence,
        sourceContractId: member.id,
        sourceFileName,
      };
    }
  }
  return suggestions;
}

/**
 * Aplica a regra: finalValue = manualValue ?? aiValue ?? ""
 * manualFields: Set de campos que o utilizador editou manualmente.
 */
export function applyAiSuggestions(formData, suggestions, manualFields) {
  const next = { ...formData };
  for (const [key, suggestion] of Object.entries(suggestions)) {
    if (!manualFields.has(key)) {
      next[key] = suggestion.aiValue;
    }
  }
  return next;
}

export default function ContractAutoFill({ userEmail, onApply, appliedFields = {} }) {
  const [loading, setLoading] = useState(false);
  const [contract, setContract] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await fetchBestContract(userEmail);
      if (!found) {
        setError('Nenhum cadastro de equipe encontrado para este utilizador. Peça ao coordenador para cadastrá-lo em Gerenciar Equipe.');
        setLoading(false);
        return;
      }
      setContract(found);
      const s = extractSuggestions(found);
      if (!Object.keys(s).length) {
        setError('O cadastro de equipe foi encontrado mas não possui dados preenchidos ainda. Aguarde o coordenador completar o contrato.');
        setLoading(false);
        return;
      }
      setSuggestions(s);
      setExpanded(true);
    } catch (e) {
      setError('Erro ao buscar contrato: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (suggestions) onApply(suggestions);
  };

  const filledCount = suggestions ? Object.keys(suggestions).length : 0;
  const appliedCount = Object.keys(appliedFields).length;

  if (appliedCount > 0 && !expanded) {
    return (
      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-violet-800">
          <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
          <span><strong>{appliedCount} campos</strong> preenchidos automaticamente com dados do contrato <em>{contract?.numero_termo || ''}</em>. Edite livremente.</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(true)} className="text-xs text-violet-600 hover:underline">Ver detalhes</button>
          <button onClick={() => setDismissed(true)} className="ml-2 text-violet-400 hover:text-violet-700"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-violet-900">Autopreenchimento por contrato</p>
            <p className="text-xs text-violet-700 mt-0.5">
              {suggestions
                ? `Fonte: ${contract?.user_name ? `Contrato de ${contract.user_name}` : 'Perfil de equipe'} — ${filledCount} campos disponíveis para preenchimento.`
                : 'Preencha automaticamente com os dados do seu contrato cadastrado pela coordenação.'}
            </p>
            {error && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {suggestions && (
            <button onClick={() => setExpanded(v => !v)} className="text-violet-500 hover:text-violet-700">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => setDismissed(true)} className="text-violet-400 hover:text-violet-700"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {!suggestions && (
        <div className="px-4 pb-4">
          <Button
            type="button"
            size="sm"
            onClick={handleLoad}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
          >
            {loading ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Buscando contrato...</> : <><Sparkles className="w-3 h-3 mr-1.5" />Buscar e preencher com contrato</>}
          </Button>
        </div>
      )}

      {suggestions && expanded && (
        <div className="border-t border-violet-200 bg-white/60 px-4 py-3 space-y-3">
          <div className="text-xs text-violet-700 font-medium">
            Campos encontrados em <em>{contract?.user_name ? `Contrato de ${contract.user_name}` : 'Perfil de equipe'}</em>:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(suggestions).map(([key, s]) => {
              const label = FIELD_MAP.find(f => f.formKey === key)?.label || key;
              const isApplied = !!appliedFields[key];
              return (
                <div key={key} className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2 ${isApplied ? 'border-green-200 bg-green-50 text-green-800' : 'border-violet-200 bg-violet-50/50 text-violet-800'}`}>
                  <span className="font-medium truncate">{label}</span>
                  <span className="truncate text-right max-w-[120px]">{s.aiValue}</span>
                  {isApplied && <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
            >
              <Sparkles className="w-3 h-3 mr-1.5" />
              {appliedCount > 0 ? 'Reaplicar dados do contrato' : 'Aplicar dados do contrato'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(false)} className="text-xs">
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}