import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Sparkles, X, Loader2, Paperclip, Copy, CheckSquare2 } from 'lucide-react';
import { toast } from 'sonner';
import ActivityAttachments from './ActivityAttachments';
import ActivitySummarizer from './ActivitySummarizer';
import ActivityClassificationAI from './ActivityClassificationAI';
import ClippingAutomatico from './ClippingAutomatico';
import BulkActivityEditor from './BulkActivityEditor';
import { base44 } from '@/api/base44Client';

const MUSEUS_ATIV = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
];

const TIPOS_MOBILIZACAO = [
  'Visita a Escolas',
  'Visita a Instituições',
  'Panfletagem',
  'Reunião Comunitária',
  'Ativação de Redes Sociais',
  'Envio em Grupos de WhatsApp',
  'Contatos Telefônicos',
  'Chat',
  'Outro'
];

const PRODUTOS_OPCOES = [
  'Catálogo', 'Folder', 'Vídeo', 'Cobertura de Vídeo', 'Cobertura Fotográfica',
  'Texto', 'Design', 'Design de Catálogo', 'Identidade Visual', 'Logomarca',
  'Release', 'Post', 'Outro'
];

// Metas do 3º Termo Aditivo — Plano de Trabalho Real
const METAS_3_ADITIVO = [
  { value: 'META_01', label: 'META 01 — Contratação da equipe principal, incluindo coordenadores da Comissão de Programação' },
  { value: 'META_02', label: 'META 02 — Elaborar e executar plano de comunicação nacional (ASCOM/SUCOM)' },
  { value: 'META_03', label: 'META 03 — Manutenção de rotina nas 4 exposições dos três museus (MUMO, MIS e MHAB)' },
  { value: 'META_04', label: 'META 04 — Alteração de dois núcleos (salas) das exposições do MUMO e MIS' },
  { value: 'META_05', label: 'META 05 — Realizar no mínimo 60 ações educativas' },
  { value: 'META_06', label: 'META 06 — Realizar no mínimo 36 ações culturais' },
  { value: 'META_07', label: 'META 07 — Contratar educador para MIS-BH, MUMO e MHAB' },
  { value: 'META_08', label: 'META 08 — Exposição e evento de abertura no Casarão do MHAB' },
  { value: 'META_09', label: 'META 09 — Exposição e evento de abertura no Museu da Imagem e do Som (MIS)' },
  { value: 'META_10', label: 'META 10 — Realizar 18 mostras de baixa e/ou média complexidade nos museus' },
  { value: 'META_11', label: 'META 11 — Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus' },
  { value: 'META_12', label: 'META 12 — Pesquisa, identidade visual, projeto curatorial e expográfico — MHAB (galeria sede)' },
  { value: 'META_13', label: 'META 13 — Pesquisa, identidade visual, projeto curatorial e expográfico — MUMO' },
  { value: 'META_14', label: 'META 14 — Inscrição em Leis de Incentivo e outros editais' },
  { value: 'META_15', label: 'META 15 — Entregar dispositivos acessíveis (mínimo 1 maquete tátil + 5 vídeos em Libras)' },
  { value: 'META_16', label: 'META 16 — Contratação de 101 diárias de educador para mediação ao público espontâneo' },
  { value: 'META_17', label: 'META 17 — Produção de 4 publicações/catálogos (2 MHAB, 1 MIS, 1 MUMO)' },
  { value: 'META_18', label: 'META 18 — Custeios para atividades educativas contínuas (insumos, lanches, materiais, consultorias)' },
  { value: 'META_19', label: "META 19 — Realizar atividade 'Presente de Iemanjá' (produção + 4 ações + infraestrutura + divulgação)" },
  { value: 'META_20', label: 'META 20 — Realizar 30 ações educativas e/ou culturais adicionais (meses 19 ao 28)' },
  { value: 'META_21', label: 'META 21 — Exposição e evento de abertura no Museu da Moda (MUMO)' },
  { value: 'META_22', label: 'META 22 — Contratar consultorias (2 temáticas + 1 formação em ambiente seguro e acessibilidade)' },
];

function gerarAtividadeId() {
  return `ATI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const EMPTY_ATIVIDADE = {
  activity_id: gerarAtividadeId(), // ID único para a atividade
  data_inicio: '',
  data_fim: '',
  museu: '',
  tipo_acao: '',
  nome: '',
  publico_estimado: '',
  quantas_repeticoes: 1,
  publico_total: '',
  produto_realizado: '',
  quantidade_produto: '',
  objetivo: '',
  descricao_executado: '',
  equipe_envolvida: '',
  equipe_envolvida_lista: [], // Usuários envolvidos
  co_responsavel_email: '', // Outro profissional responsável
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
  depoimento_participantes: '',
  eh_mobilizacao: false,
  tipo_mobilizacao: '',
  descricao_mobilizacao: '',
  clipping_automatico: null,
  is_template: false,
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

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

function UserPicker({ value = [], onChange, disabled }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    base44.entities.User.list().then(setUsers).catch(() => {});
  }, []);

  const selected = Array.isArray(value) ? value : (value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);

  const toggle = (email) => {
    if (selected.includes(email)) {
      onChange(selected.filter(e => e !== email));
    } else {
      onChange([...selected, email]);
    }
  };

  const filtered = users.filter(u =>
    (u.full_name || u.email).toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsers = users.filter(u => selected.includes(u.email));

  return (
    <div className="space-y-2">
      {/* Selected badges */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map(u => (
            <Badge key={u.email} className="gap-1 bg-gray-100 text-gray-800 hover:bg-gray-200 pr-1">
              {u.full_name || u.email}
              {!disabled && (
                <button onClick={() => toggle(u.email)} className="ml-1 text-gray-500 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <input
            type="text"
            placeholder="Buscar usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border-b border-gray-100 outline-none"
          />
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2">Nenhum usuário encontrado</p>
            ) : filtered.map(u => (
              <div
                key={u.email}
                onClick={() => toggle(u.email)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 ${selected.includes(u.email) ? 'bg-gray-50 font-medium' : ''}`}
              >
                <div className={`w-3 h-3 rounded-sm border flex items-center justify-center ${selected.includes(u.email) ? 'bg-black border-black' : 'border-gray-300'}`}>
                  {selected.includes(u.email) && <span className="text-white text-[8px] leading-none">✓</span>}
                </div>
                <span>{u.full_name || u.email}</span>
                <span className="text-gray-400 text-xs ml-auto">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AtividadeCard({ atividade, index, canEdit, onChange, onRemove, reportId, hasDupWarning, isSelected, onSelect, hasAttachments }) {
  const [expanded, setExpanded] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMetaLoading, setAiMetaLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [coRespSearch, setCoRespSearch] = useState('');

  // Carregar usuários disponíveis
  useEffect(() => {
    base44.entities.User.list().then(setUsers).catch(() => {});
  }, []);

  const errors = canEdit ? validateAtividade(atividade) : [];
  const isMeta = atividade.classificacao === 'META';
  const isRotinaOrExtra = atividade.classificacao === 'ROTINA' || atividade.classificacao === 'EXTRA';
  const coRespUser = users.find(u => u.email === atividade.co_responsavel_email);
  const filteredUsers = users.filter(u => 
    (u.full_name || u.email).toLowerCase().includes(coRespSearch.toLowerCase())
  );

  const handleAiMeta = async () => {
    // Validar dados essenciais
    if (!atividade.nome && !atividade.descricao_executado && !atividade.objetivo) {
      toast.warning('Preencha pelo menos o nome ou descrição da atividade antes de usar a IA', {
        description: 'A IA precisa de informações suficientes para sugerir uma meta adequada.'
      });
      return;
    }

    setAiMetaLoading(true);
    const metasLista = METAS_3_ADITIVO.map(m => `${m.value}: ${m.label}`).join('\n');
    const prompt = `Você é especialista em gestão de projetos culturais da Fundação Municipal de Cultura de Belo Horizonte.
Com base na atividade abaixo, identifique qual META do Plano de Trabalho do 3º Termo Aditivo melhor se encaixa.

ATIVIDADE:
Nome: ${atividade.nome || '(não informado)'}
Descrição: ${atividade.descricao_executado || atividade.objetivo || '(não informado)'}
Tipo de ação: ${atividade.tipo_acao || ''}
Museu: ${atividade.museu || ''}
Produto: ${atividade.produto_realizado || ''}

METAS DISPONÍVEIS:
${metasLista}

Responda APENAS com JSON: {"meta_codigo": "META_XX", "justificativa": "Uma frase explicando por quê"}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          meta_codigo: { type: 'string' },
          justificativa: { type: 'string' },
        }
      }
    });
    if (result?.meta_codigo) {
      onChange('meta_codigo', result.meta_codigo);
      if (result.justificativa && !atividade.indicador_previsto) {
        onChange('indicador_previsto', result.justificativa);
      }
      toast.success('Sugestão de meta gerada! ✨', {
        description: 'Revise e ajuste conforme necessário.',
        action: { label: 'OK', onClick: () => {} }
      });
    }
    setAiMetaLoading(false);
  };

  const handleAiResultados = async () => {
    // Validar dados essenciais
    if (!atividade.descricao_executado && !atividade.objetivo) {
      toast.warning('Preencha a "Descrição do executado" ou "Objetivo" antes de usar a IA', {
        description: 'Esses dados são essenciais para gerar uma sugestão de resultados adequada.'
      });
      return;
    }

    setAiLoading(true);
    const prompt = `Com base na seguinte atividade de museu, escreva um parágrafo conciso sobre Resultados e Impactos (máximo 4 linhas):
Nome: ${atividade.nome || ''}
Descrição do executado: ${atividade.descricao_executado || ''}
Objetivo: ${atividade.objetivo || ''}
Público estimado: ${atividade.publico_estimado || ''}
Tipo de ação: ${atividade.tipo_acao || ''}
Produto: ${atividade.produto_realizado || ''}
Escreva em português do Brasil, de forma objetiva e profissional.`;
    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    onChange('resultados_impactos', result);
    toast.success('Sugestão gerada! ✨', {
      description: 'Leia e revise o texto proposto pela IA antes de confirmar.',
      action: { label: 'OK', onClick: () => {} }
    });
    setAiLoading(false);
  };

  const handleAiJustificativa = async () => {
    // Validar dados essenciais
    if (!atividade.tipo_acao && !atividade.descricao_executado && !atividade.objetivo) {
      toast.warning('Preencha o "Tipo de ação" e descrição antes de usar a IA', {
        description: 'A IA precisa dessas informações para gerar uma justificativa adequada.'
      });
      return;
    }

    setAiLoading(true);
    const prompt = `Com base na seguinte atividade de museu, escreva uma justificativa técnica clara explicando por que esta atividade é considerada "${atividade.classificacao}" (máximo 3 linhas):
Nome: ${atividade.nome || ''}
Tipo de ação: ${atividade.tipo_acao || ''}
Descrição: ${atividade.descricao_executado || atividade.objetivo || ''}
Museu: ${atividade.museu || ''}
Classificação: ${atividade.classificacao || ''}
Escreva em português do Brasil, de forma técnica e concisa.`;
    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    onChange('justificativa_tecnica', result);
    toast.success('Sugestão gerada! ✨', {
      description: 'Revise a justificativa proposta e ajuste se necessário.',
      action: { label: 'OK', onClick: () => {} }
    });
    setAiLoading(false);
  };

  return (
    <div className={`border rounded-xl overflow-hidden ${hasDupWarning ? 'border-amber-400' : errors.length > 0 ? 'border-red-200' : 'border-gray-200'}`}>
      {/* Card header */}
       <div
        className="flex items-center justify-between px-5 py-3 bg-gray-50"
      >
        <div 
          className="flex items-center gap-3 flex-wrap flex-1 cursor-pointer"
          onClick={() => setExpanded(e => !e)}
        >
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Atividade {index + 1}
          </span>
          {atividade.activity_id && (
            <span className="text-xs font-mono bg-black text-white px-2 py-0.5 rounded text-gray-300">
              {atividade.activity_id.substring(0, 10)}...
            </span>
          )}
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
          {atividade.co_responsavel_email && coRespUser && (
            <Badge variant="outline" className="text-xs bg-blue-50">
              Co: {coRespUser.full_name || coRespUser.email}
            </Badge>
          )}
          {hasAttachments && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 flex items-center gap-1">
              <Paperclip className="w-3 h-3" />Anexos
            </Badge>
          )}
          {atividade.is_template && (
            <Badge className="text-xs bg-purple-100 text-purple-700">
              <Copy className="w-3 h-3 mr-1" />Modelo
            </Badge>
          )}
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="w-3 h-3" />{errors.length} campo(s) pendente(s)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && onSelect && (
            <Button
              variant="ghost" size="icon"
              className={`h-7 w-7 ${isSelected ? 'text-black' : 'text-gray-300'}`}
              onClick={e => { e.stopPropagation(); onSelect(!isSelected); }}
            >
              <CheckSquare2 className="w-4 h-4" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost" size="icon"
              className="text-red-400 h-7 w-7"
              onClick={e => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-0">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-700">Código da Meta</Label>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={handleAiMeta}
                      disabled={aiMetaLoading}
                    >
                      {aiMetaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {aiMetaLoading ? 'Sugerindo...' : 'Sugerir com IA'}
                    </Button>
                  )}
                </div>
                <Select value={atividade.meta_codigo || ''} onValueChange={v => onChange('meta_codigo', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione a meta" /></SelectTrigger>
                  <SelectContent>
                    {METAS_3_ADITIVO.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <div className="p-4 border border-green-100 bg-green-50/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-gray-700">Justificativa Técnica</Label>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-7"
                    onClick={handleAiJustificativa}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {aiLoading ? 'Gerando...' : 'Sugerir com IA'}
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Explique por que esta atividade é de rotina/extra e como se relaciona ao projeto/museu."
                value={atividade.justificativa_tecnica || ''}
                onChange={e => onChange('justificativa_tecnica', e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
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
            <Field label="Co-responsável (outro profissional)">
              <div className="space-y-2">
                {coRespUser && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 gap-1">
                      {coRespUser.full_name || coRespUser.email}
                    </Badge>
                    {canEdit && (
                      <button onClick={() => onChange('co_responsavel_email', '')} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                {!coRespUser && canEdit && (
                  <Select value={atividade.co_responsavel_email || ''} onValueChange={v => onChange('co_responsavel_email', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredUsers.length === 0 ? (
                        <div className="text-xs text-gray-400 px-3 py-2">Nenhum usuário disponível</div>
                      ) : (
                        filteredUsers.map(u => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.full_name || u.email}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
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
            <Field label="É uma atividade de mobilização/divulgação?">
              <Select value={atividade.eh_mobilizacao ? 'sim' : 'nao'} onValueChange={v => onChange('eh_mobilizacao', v === 'sim')} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Público estimado (por ocorrência)">
               <Input type="number" placeholder="0" value={atividade.publico_estimado ?? ''} onChange={e => onChange('publico_estimado', parseInt(e.target.value) || 0)} disabled={!canEdit} />
            </Field>
            <Field label="Quantas vezes ocorreu?">
               <Input 
                 type="number" 
                 placeholder="1" 
                 value={atividade.quantas_repeticoes || 1} 
                 onChange={e => {
                   const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                   if (!isNaN(val) && val >= 1 && val <= 99) {
                     onChange('quantas_repeticoes', val);
                   }
                 }} 
                 disabled={!canEdit}
                 min="1"
                 max="99"
               />
            </Field>

            <Field label="Produto realizado">
              <Select value={atividade.produto_realizado || ''} onValueChange={v => onChange('produto_realizado', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {PRODUTOS_OPCOES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantidade de produtos gerados">
              <Input type="number" placeholder="Ex: 10 posts, 5 oficinas" value={atividade.quantidade_produto ?? ''} onChange={e => onChange('quantidade_produto', parseInt(e.target.value) || 0)} disabled={!canEdit} />
            </Field>
            </div>

            {/* Seção de Mobilização (condicional) */}
            {atividade.eh_mobilizacao && (
            <div className="p-4 border border-purple-100 bg-purple-50/20 rounded-xl space-y-4">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Dados de Mobilização/Divulgação</p>
              <Field label="Tipo de mobilização">
                <Select value={atividade.tipo_mobilizacao || ''} onValueChange={v => onChange('tipo_mobilizacao', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_MOBILIZACAO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Descrição da ação de mobilização/divulgação">
                <Textarea 
                  placeholder="Descreva em detalhes a ação de mobilização (ex: quantidade de pessoas contatadas, conteúdo compartilhado, resultado da ação)..."
                  value={atividade.descricao_mobilizacao || ''} 
                  onChange={e => onChange('descricao_mobilizacao', e.target.value)} 
                  disabled={!canEdit}
                  rows={3}
                />
              </Field>
            </div>
            )}

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
              <Field label="Equipe envolvida (esta atividade será adicionada ao relatório de cada membro)">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <UserPicker
                    value={atividade.equipe_envolvida_lista || []}
                    onChange={v => onChange('equipe_envolvida_lista', v)}
                    disabled={!canEdit}
                  />
                </div>
              </Field>
              <Field label="Resultados e impactos">
                <div className="space-y-1.5">
                  <Textarea placeholder="Resultados observados, impacto no público..." value={atividade.resultados_impactos || ''} onChange={e => onChange('resultados_impactos', e.target.value)} disabled={!canEdit} rows={2} />
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleAiResultados}
                      disabled={aiLoading}
                    >
                      {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {aiLoading ? 'Gerando...' : 'Sugerir com IA'}
                    </Button>
                  )}
                </div>
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Problemas (opcional)">
                  <Textarea placeholder="Problemas encontrados..." value={atividade.problemas || ''} onChange={e => onChange('problemas', e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
                <Field label="Soluções (opcional)">
                  <Textarea placeholder="Como foram resolvidos..." value={atividade.solucoes || ''} onChange={e => onChange('solucoes', e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
              </div>
              <Field label="Depoimento de Participantes ou Fatos Marcantes">
                <Textarea placeholder="Relatos dos participantes, histórias marcantes, feedback importante..." value={atividade.depoimento_participantes || ''} onChange={e => onChange('depoimento_participantes', e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              </div>
              </div>



          {/* Clipping Automático */}
          {canEdit && (
            <ClippingAutomatico
              atividade={atividade}
              onUpdate={(field, value) => onChange(field, value)}
            />
          )}

          {/* Anexos vinculados a esta atividade */}
          {reportId && (
            <ActivityAttachments
              reportId={reportId}
              activityIndex={index}
              activityId={atividade.activity_id}
              activityName={atividade.nome || `Atividade ${index + 1}`}
              canEdit={canEdit}
            />
          )}
          </div>
          )}
          </div>
          );
          }

async function verificarDuplicata(novaAtiv, atividades) {
  if (!novaAtiv.nome && !novaAtiv.descricao_executado) return null;
  if (atividades.length === 0) return null;

  const lista = atividades.map((a, i) => `${i + 1}. Nome: "${a.nome || ''}" | Tipo: ${a.tipo_acao || ''} | Data: ${a.data_inicio || ''} | Museu: ${a.museu || ''}`).join('\n');
  const nova = `Nome: "${novaAtiv.nome || ''}" | Tipo: ${novaAtiv.tipo_acao || ''} | Data: ${novaAtiv.data_inicio || ''} | Museu: ${novaAtiv.museu || ''}`;

  const prompt = `Você é um assistente de controle de qualidade de relatórios de museus.
Analise se a nova atividade abaixo é duplicata ou muito similar a alguma das atividades já registradas.

ATIVIDADES JÁ REGISTRADAS:
${lista}

NOVA ATIVIDADE:
${nova}

Responda APENAS com um JSON: {"duplicata": true/false, "motivo": "breve explicação se for duplicata, senão vazio"}`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        duplicata: { type: 'boolean' },
        motivo: { type: 'string' },
      }
    }
  });
  return result;
}

export default function AtividadesSection({ atividades = [], canEdit, onChange, reportId }) {
  const [checkingDup, setCheckingDup] = React.useState(false);
  const [dupWarning, setDupWarning] = React.useState(null); // { index, motivo }
  const [selectedIndices, setSelectedIndices] = React.useState(new Set());
  const [bulkEditorOpen, setBulkEditorOpen] = React.useState(false);
  const [attachmentCounts, setAttachmentCounts] = React.useState({});

  React.useEffect(() => {
    // Fetch attachment counts for each activity
    if (reportId) {
      atividades.forEach(async (ativ, idx) => {
        if (ativ.activity_id) {
          const attachments = await base44.entities.Attachment.filter({ 
            report_id: reportId, 
            activity_id: ativ.activity_id 
          }).catch(() => []);
          if (attachments.length > 0) {
            setAttachmentCounts(prev => ({ ...prev, [idx]: attachments.length }));
          }
        }
      });
    }
  }, [atividades, reportId]);

  const add = async () => {
    const nova = { ...EMPTY_ATIVIDADE };
    onChange([...atividades, nova]);
  };

  const remove = (i) => {
    onChange(atividades.filter((_, idx) => idx !== i));
    if (dupWarning?.index === i) setDupWarning(null);
  };

  const update = async (i, field, value) => {
    const updated = atividades.map((a, idx) => idx === i ? { ...a, [field]: value } : a);
    onChange(updated);

    // Verificar duplicata quando nome ou data muda
    if ((field === 'nome' || field === 'data_inicio') && value && canEdit) {
      const novaAtiv = updated[i];
      const outras = updated.filter((_, idx) => idx !== i);
      if (novaAtiv.nome && outras.length > 0) {
        setCheckingDup(true);
        const res = await verificarDuplicata(novaAtiv, outras).catch(() => null);
        setCheckingDup(false);
        if (res?.duplicata) {
          setDupWarning({ index: i, motivo: res.motivo });
        } else {
          setDupWarning(prev => prev?.index === i ? null : prev);
        }
      }
    }
  };

  const handleApplySuggestion = (suggestion) => {
    if (suggestion.type === 'update_description') {
      update(suggestion.index, 'descricao_executado', suggestion.value);
    }
  };

  const totalErrors = atividades.reduce((sum, a) => sum + validateAtividade(a).length, 0);
  const selectedCount = selectedIndices.size;
  const selectedActivities = atividades.filter((_, idx) => selectedIndices.has(idx));

  const toggleSelection = (index) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const handleBulkApply = (updates) => {
    const updated = atividades.map((a, idx) => 
      selectedIndices.has(idx) ? { ...a, ...updates } : a
    );
    onChange(updated);
    setSelectedIndices(new Set());
    setBulkEditorOpen(false);
  };

  return (
    <section>
      {/* Activity Summarizer — Análise de IA */}
      {canEdit && atividades.length > 0 && (
        <div className="mb-6 pb-6 border-b border-gray-100">
          <ActivitySummarizer 
            atividades={atividades}
            canEdit={canEdit}
            onApplySuggestions={handleApplySuggestion}
          />
        </div>
      )}

      {/* Bulk Editor */}
      <BulkActivityEditor 
        open={bulkEditorOpen} 
        selectedActivities={selectedActivities}
        onApply={handleBulkApply}
        onClose={() => setBulkEditorOpen(false)}
      />

      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-black">Atividades Executadas / Produtos</h2>
          {totalErrors > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              <AlertCircle className="w-3 h-3" />{totalErrors} pendência(s)
            </span>
          )}
          {checkingDup && (
            <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />Verificando duplicata...
            </span>
          )}
          {selectedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              <CheckSquare2 className="w-3 h-3" />{selectedCount} selecionada(s)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {selectedCount > 0 && canEdit && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => setBulkEditorOpen(true)}
            >
              Editar {selectedCount}
            </Button>
          )}
          {canEdit && (
            <Button className="bg-black hover:bg-gray-800 text-white gap-1.5" size="sm" onClick={add}>
              <Plus className="w-4 h-4" />Inserir Nova Atividade
            </Button>
          )}
        </div>
      </div>

      {/* Info: Atividades do mês de referência */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">ℹ️ Sobre as Atividades</p>
        <p className="text-sm text-blue-700 leading-relaxed">
          As atividades registradas abaixo são <strong>aquelas realizadas no mês de referência</strong> indicado no início do relatório. Cada atividade integra o <strong>relatório mensal da equipe</strong> e contribui para os indicadores de desempenho.
        </p>
      </div>

      {dupWarning && (
         <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
           <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
           <div className="flex-1">
             <p className="text-sm font-medium text-amber-800">Possível duplicata detectada (Atividade {dupWarning.index + 1})</p>
             <p className="text-xs text-amber-600 mt-0.5">{dupWarning.motivo}</p>
           </div>
           <button onClick={() => setDupWarning(null)} className="text-amber-400 hover:text-amber-600">
             <X className="w-4 h-4" />
           </button>
         </div>
       )}

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
               reportId={reportId}
               hasDupWarning={dupWarning?.index === i}
               isSelected={selectedIndices.has(i)}
               onSelect={canEdit ? () => toggleSelection(i) : null}
               hasAttachments={attachmentCounts[i] > 0}
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