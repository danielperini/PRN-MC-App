import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Sparkles, X, Loader2 } from 'lucide-react';
import ActivityAttachments from './ActivityAttachments';
import { base44 } from '@/api/base44Client';

const MUSEUS_ATIV = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
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

function AtividadeCard({ atividade, index, canEdit, onChange, onRemove, reportId, hasDupWarning }) {
  const [expanded, setExpanded] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMetaLoading, setAiMetaLoading] = useState(false);
  const errors = canEdit ? validateAtividade(atividade) : [];
  const isMeta = atividade.classificacao === 'META';
  const isRotinaOrExtra = atividade.classificacao === 'ROTINA' || atividade.classificacao === 'EXTRA';

  const handleAiMeta = async () => {
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
    }
    setAiMetaLoading(false);
  };

  const handleAiResultados = async () => {
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
    setAiLoading(false);
  };

  return (
    <div className={`border rounded-xl overflow-hidden ${hasDupWarning ? 'border-amber-400' : errors.length > 0 ? 'border-red-200' : 'border-gray-200'}`}>
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
            <div className="p-4 border border-green-100 bg-green-50/20 rounded-xl">
              <Field label="Justificativa Técnica">
                <Textarea
                  placeholder="Explique por que esta atividade é de rotina/extra e como se relaciona ao projeto/museu."
                  value={atividade.justificativa_tecnica || ''}
                  onChange={e => onChange('justificativa_tecnica', e.target.value)}
                  disabled={!canEdit}
                  rows={4}

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
              <Select value={atividade.produto_realizado || ''} onValueChange={v => onChange('produto_realizado', v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {PRODUTOS_OPCOES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
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
                <UserPicker
                  value={atividade.equipe_envolvida_lista || []}
                  onChange={v => onChange('equipe_envolvida_lista', v)}
                  disabled={!canEdit}
                />
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
            </div>
          </div>

          {/* Anexos vinculados a esta atividade */}
          {reportId && (
            <ActivityAttachments
              reportId={reportId}
              activityIndex={index}
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

  const totalErrors = atividades.reduce((sum, a) => sum + validateAtividade(a).length, 0);

  return (
    <section>
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
        </div>
        {canEdit && (
          <Button className="bg-black hover:bg-gray-800 text-white gap-1.5" size="sm" onClick={add}>
            <Plus className="w-4 h-4" />Inserir Nova Atividade
          </Button>
        )}
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