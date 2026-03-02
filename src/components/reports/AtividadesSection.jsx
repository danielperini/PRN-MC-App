import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const MUSEUS_ATIV = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

const EMPTY_ATIVIDADE = {
  data_inicio: '',
  data_fim: '',
  museu: '',
  tipo_acao: '',
  nome: '',
  publico_estimado: '',
  produto_realizado: '',
  quantidade_produto: '',
  objetivo: '',
  descricao_executado: '',
  equipe_envolvida: '',
  resultados_impactos: '',
  problemas: '',
  solucoes: '',
  equipe_responsavel: '',
};

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function AtividadeCard({ atividade, index, canEdit, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Atividade {index + 1}
          </span>
          {atividade.nome && (
            <span className="text-sm font-medium text-black">{atividade.nome}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              variant="ghost" size="icon"
              className="text-red-400 h-7 w-7"
              onClick={e => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-6">
          {/* Dados básicos */}
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Data de início">
              <Input
                type="date"
                value={atividade.data_inicio || ''}
                onChange={e => onChange('data_inicio', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Data de término (opcional)">
              <Input
                type="date"
                value={atividade.data_fim || ''}
                onChange={e => onChange('data_fim', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Museu / Local">
              <Select value={atividade.museu || ''} onValueChange={v => onChange('museu', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MUSEUS_ATIV.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de ação">
              <Select value={atividade.tipo_acao || ''} onValueChange={v => onChange('tipo_acao', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ACAO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nome da atividade" required>
              <Input
                placeholder="Nome"
                value={atividade.nome || ''}
                onChange={e => onChange('nome', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Equipe responsável" required>
              <Select value={atividade.equipe_responsavel || ''} onValueChange={v => onChange('equipe_responsavel', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Público estimado">
              <Input
                type="number"
                placeholder="0"
                value={atividade.publico_estimado || ''}
                onChange={e => onChange('publico_estimado', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Produto realizado">
              <Input
                placeholder="Ex: Vídeo, Folder, Oficina..."
                value={atividade.produto_realizado || ''}
                onChange={e => onChange('produto_realizado', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Quantidade do produto">
              <Input
                type="number"
                placeholder="0"
                value={atividade.quantidade_produto || ''}
                onChange={e => onChange('quantidade_produto', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
          </div>

          {/* Registro detalhado */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registro Detalhado</p>
            <div className="space-y-3">
              <Field label="Objetivo">
                <Textarea
                  placeholder="Objetivo da atividade..."
                  value={atividade.objetivo || ''}
                  onChange={e => onChange('objetivo', e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                />
              </Field>
              <Field label="Descrição do executado">
                <Textarea
                  placeholder="O que foi realizado..."
                  value={atividade.descricao_executado || ''}
                  onChange={e => onChange('descricao_executado', e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                />
              </Field>
              <Field label="Equipe envolvida">
                <Input
                  placeholder="Nomes ou equipes que participaram..."
                  value={atividade.equipe_envolvida || ''}
                  onChange={e => onChange('equipe_envolvida', e.target.value)}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Resultados e impactos">
                <Textarea
                  placeholder="Resultados observados, impacto no público..."
                  value={atividade.resultados_impactos || ''}
                  onChange={e => onChange('resultados_impactos', e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Problemas (opcional)">
                  <Textarea
                    placeholder="Problemas encontrados..."
                    value={atividade.problemas || ''}
                    onChange={e => onChange('problemas', e.target.value)}
                    disabled={!canEdit}
                    rows={2}
                  />
                </Field>
                <Field label="Soluções (opcional)">
                  <Textarea
                    placeholder="Como foram resolvidos..."
                    value={atividade.solucoes || ''}
                    onChange={e => onChange('solucoes', e.target.value)}
                    disabled={!canEdit}
                    rows={2}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AtividadesSection({ atividades = [], canEdit, onChange }) {
  const add = () => onChange([...atividades, { ...EMPTY_ATIVIDADE }]);
  const remove = (i) => onChange(atividades.filter((_, idx) => idx !== i));
  const update = (i, field, value) =>
    onChange(atividades.map((a, idx) => idx === i ? { ...a, [field]: value } : a));

  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <h2 className="text-base font-semibold text-black">Atividades Executadas</h2>
        {canEdit && (
          <Button className="bg-black hover:bg-gray-800 text-white gap-1.5" size="sm" onClick={add}>
            <Plus className="w-4 h-4" />
            Inserir Nova Atividade
          </Button>
        )}
      </div>

      {atividades.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-400 text-sm mb-3">Nenhuma atividade registrada</p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="w-4 h-4 mr-1" />
              Inserir Nova Atividade
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {atividades.map((ativ, i) => (
            <AtividadeCard
              key={i}
              atividade={ativ}
              index={i}
              canEdit={canEdit}
              onChange={(field, value) => update(i, field, value)}
              onRemove={() => remove(i)}
            />
          ))}
          {canEdit && (
            <Button variant="outline" className="w-full border-dashed gap-2" onClick={add}>
              <Plus className="w-4 h-4" />
              Inserir Nova Atividade
            </Button>
          )}
        </div>
      )}
    </section>
  );
}