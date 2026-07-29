import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

const MUSEUS = ['MUMO', 'MIS', 'MHAB', 'Geral/Transversal'];

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-4 py-4 space-y-4 bg-white">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children, isAiSuggested }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {isAiSuggested && <Sparkles className="w-3 h-3 text-amber-500" />}
      </Label>
      <div className={isAiSuggested ? 'ring-2 ring-amber-300 rounded-md' : ''}>
        {children}
      </div>
    </div>
  );
}

export default function DadosExpandidosSection({ formData, set, aiSuggestedFields = {} }) {
  return (
    <div className="space-y-3">
      {/* Contato e Localização */}
      <CollapsibleSection title="📍 Contato Pessoal e Endereço" defaultOpen>
        <FieldRow label="Celular (WhatsApp)" isAiSuggested={!!aiSuggestedFields.celular}>
          <Input
            type="tel"
            value={formData.celular || ''}
            onChange={e => set('celular', e.target.value)}
            placeholder="(31) 99999-9999"
          />
        </FieldRow>

        <FieldRow label="Endereço Residencial Completo" isAiSuggested={!!aiSuggestedFields.endereco_residencial}>
          <Input
            value={formData.endereco_residencial || ''}
            onChange={e => set('endereco_residencial', e.target.value)}
            placeholder="Rua, número, bairro, cidade, UF, CEP"
          />
        </FieldRow>
      </CollapsibleSection>

      {/* Contato de Emergência */}
      <CollapsibleSection title="🚨 Contato de Emergência">
        <FieldRow label="Nome do Contato de Emergência" isAiSuggested={!!aiSuggestedFields.contato_emergencia_nome}>
          <Input
            value={formData.contato_emergencia_nome || ''}
            onChange={e => set('contato_emergencia_nome', e.target.value)}
            placeholder="Nome completo"
          />
        </FieldRow>
        <FieldRow label="Telefone do Contato de Emergência" isAiSuggested={!!aiSuggestedFields.contato_emergencia_telefone}>
          <Input
            type="tel"
            value={formData.contato_emergencia_telefone || ''}
            onChange={e => set('contato_emergencia_telefone', e.target.value)}
            placeholder="(31) 99999-9999"
          />
        </FieldRow>
      </CollapsibleSection>

      {/* Vínculo / Museu */}
      <CollapsibleSection title="🏛️ Museu Vinculado" defaultOpen>
        <FieldRow label="Museu / Centro de Custo" isAiSuggested={!!aiSuggestedFields.museu_vinculado}>
          <Select value={formData.museu_vinculado || ''} onValueChange={v => set('museu_vinculado', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o museu" />
            </SelectTrigger>
            <SelectContent>
              {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
      </CollapsibleSection>

      {/* Dados Contratuais */}
      <CollapsibleSection title="📄 Dados Contratuais" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Nº de Parcelas" isAiSuggested={!!aiSuggestedFields.contrato_num_parcelas}>
            <Input
              type="number"
              min="1"
              value={formData.contrato_num_parcelas || ''}
              onChange={e => set('contrato_num_parcelas', e.target.value)}
              placeholder="Ex: 10"
            />
          </FieldRow>
          <FieldRow label="Valor por Parcela (R$)" isAiSuggested={!!aiSuggestedFields.contrato_valor_parcela}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={formData.contrato_valor_parcela || ''}
              onChange={e => set('contrato_valor_parcela', e.target.value)}
              placeholder="Ex: 5000.00"
            />
          </FieldRow>
        </div>
        <FieldRow label="Chave PIX" isAiSuggested={!!aiSuggestedFields.pix_key}>
          <Input
            value={formData.pix_key || ''}
            onChange={e => set('pix_key', e.target.value)}
            placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
          />
        </FieldRow>
      </CollapsibleSection>

      {/* Dados PJ — exibe apenas se tipo_pessoa != PF */}
      {formData.tipo_pessoa !== 'PF' && (
        <CollapsibleSection title="🏢 Dados da Pessoa Jurídica" defaultOpen>
          <FieldRow label="CNPJ" isAiSuggested={!!aiSuggestedFields.cnpj}>
            <Input
              value={formData.cnpj || ''}
              onChange={e => set('cnpj', e.target.value)}
              placeholder="00.000.000/0001-00"
            />
          </FieldRow>
          <FieldRow label="Razão Social" isAiSuggested={!!aiSuggestedFields.empresa_nome}>
            <Input
              value={formData.empresa_nome || ''}
              onChange={e => set('empresa_nome', e.target.value)}
              placeholder="Nome da empresa"
            />
          </FieldRow>
          <FieldRow label="Endereço da Empresa" isAiSuggested={!!aiSuggestedFields.empresa_endereco}>
            <Input
              value={formData.empresa_endereco || ''}
              onChange={e => set('empresa_endereco', e.target.value)}
              placeholder="Endereço completo"
            />
          </FieldRow>
          <FieldRow label="Nome do Representante Legal" isAiSuggested={!!aiSuggestedFields.representante_legal_nome}>
            <Input
              value={formData.representante_legal_nome || ''}
              onChange={e => set('representante_legal_nome', e.target.value)}
              placeholder="Nome completo"
            />
          </FieldRow>
          <FieldRow label="CPF do Representante" isAiSuggested={!!aiSuggestedFields.representante_legal_cpf}>
            <Input
              value={formData.representante_legal_cpf || ''}
              onChange={e => set('representante_legal_cpf', e.target.value)}
              placeholder="000.000.000-00"
            />
          </FieldRow>
          <FieldRow label="Cargo do Representante" isAiSuggested={!!aiSuggestedFields.cargo_representante}>
            <Select value={formData.cargo_representante || ''} onValueChange={v => set('cargo_representante', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sócio-Gerente">Sócio-Gerente</SelectItem>
                <SelectItem value="Diretor">Diretor</SelectItem>
                <SelectItem value="Gerente">Gerente</SelectItem>
                <SelectItem value="Procurador">Procurador</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </CollapsibleSection>
      )}
    </div>
  );
}