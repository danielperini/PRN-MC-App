import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const MUSEUS_ATIV = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

// Metas do 3º Termo Aditivo
const METAS_3_ADITIVO = [
  { value: 'META_01', label: 'META_01 — Contratação da equipe principal (Comissão de Programação)' },
  { value: 'META_02', label: 'META_02 — Plano de comunicação (ASCOM/SUCOM)' },
  { value: 'META_03', label: 'META_03 — Manutenção de rotina das exposições (MUMO/MIS/MHAB)' },
  { value: 'META_04', label: 'META_04 — Alteração de dois núcleos (MUMO e MIS)' },
  { value: 'META_05', label: 'META_05 — Formação e qualificação da equipe técnica' },
  { value: 'META_06', label: 'META_06 — Ações de mediação e educação nos museus' },
  { value: 'META_07', label: 'META_07 — Contratar educadores (MIS/MUMO/MHAB)' },
  { value: 'META_08', label: 'META_08 — Exposição + abertura no Casarão do MHAB' },
  { value: 'META_09', label: 'META_09 — Programação cultural integrada dos três museus' },
  { value: 'META_10', label: 'META_10 — Ações de comunicação e marketing cultural' },
  { value: 'META_11', label: 'META_11 — Gestão administrativa e financeira do projeto' },
  { value: 'META_12', label: 'META_12 — Monitoramento e avaliação de resultados' },
  { value: 'META_13', label: 'META_13 — Relatórios periódicos de acompanhamento' },
  { value: 'META_14', label: 'META_14 — Inscrição em Leis de Incentivo e outros editais' },
  { value: 'META_15', label: 'META_15 — Dispositivos acessíveis (maquete tátil + 5 vídeos em Libras)' },
  { value: 'META_16', label: 'META_16 — 101 diárias de educador' },
  { value: 'META_17', label: 'META_17 — Publicações (produção editorial de catálogos)' },
  { value: 'META_18', label: 'META_18 — Custeios para atividades educativas contínuas' },
  { value: 'META_19', label: "META_19 — Atividade 'Presente de Iemanjá'" },
  { value: 'META_20', label: 'META_20 — Realizar 30 ações educativas e/ou culturais (10 meses)' },
  { value: 'META_21', label: 'META_21 — Exposição + abertura no Museu da Moda (MUMO)' },
  { value: 'META_22', label: 'META_22 — Encerramento e prestação de contas final' },
];

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
  classificacao: '',
  meta_codigo: '',
  indicador_previsto: '',
  meta_quantitativa: '',
  resultado_alcancado: '',
  status_meta: '',
  justificativa_tecnica: '',
};

export function validateAtividade(ativ) {
  // Apenas a classificação é obrigatória; todos os demais campos são opcionais
  const errors = [];
  if (!ativ.classificacao) errors.push('Classificação é obrigatória');
  return errors;
}

const CLASSIF_BADGE = {
  META:   'bg-blue-100 text-blue-800',
  ROTINA: 'bg-green-100 text-green-700',
  EXTRA:  'bg-orange-100 text-orange-700',
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
  const errors = canEdit ? validateAtividade(atividade) : [];
  const isMeta = atividade.classificacao === 'META';
  const isRotinaOrExtra = atividade.classificacao === 'ROTINA' || atividade.classificacao === 'EXTRA';

  return (
    <div className={`border rounded-xl overflow-hidden ${errors.length > 0 ? 'border-red-200' : 'border-gray-200'}`}>
      {/* Card header */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Atividade {index + 1}
          </span>
          {atividade.nome && (
            <span className="text-sm font-medium text-black">{atividade.nome}</span>
          )}
          {atividade.classificacao && (
            <Badge className={`text-xs font-medium ${CLASSIF_BADGE[atividade.classificacao] || ''}`}>
              {atividade.classificacao}
            </Badge>
          )}
          {isMeta && atividade.meta_codigo && (
            <Badge variant="outline" className="text-xs">{atividade.meta_codigo}</Badge>
          )}
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="w-3 h-3" />{errors.length} campo(s) pendente(s)
            </span>
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
          {/* Classificação — primeiro campo, sempre visível */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <Field label="Classificação da Atividade" required>
              <Select value={atividade.classificacao || ''} onValueChange={v => onChange('classificacao', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione a classificação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="META">META — Vinculada ao Quadro de Metas do 3º Aditivo</SelectItem>
                  <SelectItem value="ROTINA">ROTINA — Atividade de rotina do projeto/museu</SelectItem>
                  <SelectItem value="EXTRA">EXTRA — Atividade extra não prevista</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Campos condicionais: META */}
          {isMeta && (
            <div className="p-4 border border-blue-100 bg-blue-50/30 rounded-xl space-y-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Dados da Meta — 3º Termo Aditivo</p>
              <Field label="Código da Meta">
                <Select value={atividade.meta_codigo || ''} onValueChange={v => onChange('meta_codigo', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione a meta" /></SelectTrigger>
                  <SelectContent>
                    {METAS_3_ADITIVO.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Indicador Previsto">
                <Input
                  placeholder="Ex: Nº de ações educativas realizadas"
                  value={atividade.indicador_previsto || ''}
                  onChange={e => onChange('indicador_previsto', e.target.value)}
                  disabled={!canEdit}
                />
              </Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Meta Quantitativa (opcional)">
                  <Input
                    placeholder="Ex: 30 ações, 300 exemplares"
                    value={atividade.meta_quantitativa || ''}
                    onChange={e => onChange('meta_quantitativa', e.target.value)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Resultado Alcançado (opcional)">
                  <Input
                    placeholder="Ex: 12 ações executadas"
                    value={atividade.resultado_alcancado || ''}
                    onChange={e => onChange('resultado_alcancado', e.target.value)}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <Field label="Status da Meta">
                <Select value={atividade.status_meta || ''} onValueChange={v => onChange('status_meta', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Em andamento">Em andamento</SelectItem>
                    <SelectItem value="Parcial">Parcial</SelectItem>
                    <SelectItem value="Cumprida">Cumprida</SelectItem>
                    <SelectItem value="Superada">Superada</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {/* Campos condicionais: ROTINA / EXTRA */}
          {isRotinaOrExtra && (
            <div className="p-4 border border-green-100 bg-green-50/20 rounded-xl">
              <Field label="Justificativa Técnica">
                <Textarea
                  placeholder="Explique por que esta atividade é de rotina/extra e como se relaciona ao projeto/museu."
                  value={atividade.justificativa_tecnica || ''}
                  onChange={e => onChange('justificativa_tecnica', e.target.value)}
                  disabled={!canEdit}
                  rows={4}
                  className={!atividade.justificativa_tecnica && canEdit ? 'border-red-300' : ''}
                />
              </Field>
            </div>
          )}

          {/* Dados básicos */}
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome da atividade">
              <Input
                placeholder="Nome"
                value={atividade.nome || ''}
                onChange={e => onChange('nome', e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Equipe responsável">
              <Select value={atividade.equipe_responsavel || ''} onValueChange={v => onChange('equipe_responsavel', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de início">
              <Input type="date" value={atividade.data_inicio || ''} onChange={e => onChange('data_inicio', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="Data de término (opcional)">
              <Input type="date" value={atividade.data_fim || ''} onChange={e => onChange('data_fim', e.target.value)} disabled={!canEdit} />
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
            <Field label="Público estimado">
              <Input type="number" placeholder="0" value={atividade.publico_estimado || ''} onChange={e => onChange('publico_estimado', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="Produto realizado">
              <Input placeholder="Ex: Vídeo, Folder, Oficina..." value={atividade.produto_realizado || ''} onChange={e => onChange('produto_realizado', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="Quantidade do produto">
              <Input type="number" placeholder="0" value={atividade.quantidade_produto || ''} onChange={e => onChange('quantidade_produto', e.target.value)} disabled={!canEdit} />
            </Field>
          </div>

          {/* Registro detalhado */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registro Detalhado</p>
            <div className="space-y-3">
              <Field label="Objetivo">
                <Textarea placeholder="Objetivo da atividade..." value={atividade.objetivo || ''} onChange={e => onChange('objetivo', e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Descrição do executado">
                <Textarea placeholder="O que foi realizado..." value={atividade.descricao_executado || ''} onChange={e => onChange('descricao_executado', e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              <Field label="Equipe envolvida">
                <Input placeholder="Nomes ou equipes que participaram..." value={atividade.equipe_envolvida || ''} onChange={e => onChange('equipe_envolvida', e.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Resultados e impactos">
                <Textarea placeholder="Resultados observados, impacto no público..." value={atividade.resultados_impactos || ''} onChange={e => onChange('resultados_impactos', e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Problemas (opcional)">
                  <Textarea placeholder="Problemas encontrados..." value={atividade.problemas || ''} onChange={e => onChange('problemas', e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
                <Field label="Soluções (opcional)">
                  <Textarea placeholder="Como foram resolvidos..." value={atividade.solucoes || ''} onChange={e => onChange('solucoes', e.target.value)} disabled={!canEdit} rows={2} />
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

  const totalErrors = atividades.reduce((sum, a) => sum + validateAtividade(a).length, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-black">Atividades Executadas</h2>
          {totalErrors > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              <AlertCircle className="w-3 h-3" />{totalErrors} pendência(s)
            </span>
          )}
        </div>
        {canEdit && (
          <Button className="bg-black hover:bg-gray-800 text-white gap-1.5" size="sm" onClick={add}>
            <Plus className="w-4 h-4" />Inserir Nova Atividade
          </Button>
        )}
      </div>

      {atividades.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-400 text-sm mb-3">Nenhuma atividade registrada</p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="w-4 h-4 mr-1" />Inserir Nova Atividade
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
              <Plus className="w-4 h-4" />Inserir Nova Atividade
            </Button>
          )}
        </div>
      )}
    </section>
  );
}