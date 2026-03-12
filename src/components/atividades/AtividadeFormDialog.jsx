import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Sparkles, Plus, X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Educativo', 'Produção', 'Comunicação', 'Administração', 'Outra'];
const CLASSIFICACOES = ['META', 'ROTINA', 'EXTRA'];
const TIPOS_ACAO = ['Oficina', 'Palestra', 'Visita Guiada', 'Exposição', 'Evento', 'Formação', 'Outro'];
const PRODUTOS_REALIZADOS = [
  'Cobertura Fotográfica', 'Cobertura de Vídeo', 'Texto', 'Revisão',
  'Identidade Visual', 'Logomarca', 'Post', 'Tradução', 'Expografia',
  'Catálogo', 'Cartaz', 'Reunião', 'Visita', 'Relatório', 'Gestão',
  'Apresentação de Contas', 'Planejamento', 'Programação'
];

const makeEmptyForm = () => {
  const now = new Date();
  return {
    // Período
    mes_referencia: MESES[now.getMonth()],
    ano: now.getFullYear(),
    
    // Básico
    titulo: '',
    classificacao: '',
    data_inicio: '',
    data_fim: '',
    museu: '',
    tipo_acao: '',
    
    // Equipe
    equipe_responsavel: '',
    usuario_responsavel_id: '',
    
    // Público
    publico_estimado: 0,
    quantas_repeticoes: 1,
    publico_total: 0,
    
    // Mobilização
    eh_mobilizacao: false,
    tipo_mobilizacao: '',
    descricao_mobilizacao: '',
    
    // Contratações
    houve_contratacoes: false,
    numero_trabalhadores: 0,
    numero_empresas: 0,
    valor_aproximado: 0,
    
    // Produtos
    produtos_entregues: [],
    quantidade_produtos: 1,
    
    // Detalhes
    objetivo: '',
    descricao: '',
    resultados: '',
    problemas: '',
    solucoes: '',
    depoimento_participantes: '',
  };
};

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function AtividadeFormDialog({ open, onClose, atividade, onSaved }) {
  const isEdit = !!atividade;
  const [form, setForm] = useState(makeEmptyForm());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basico');
  const [searchUsers, setSearchUsers] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list('-full_name', 100),
  });

  useEffect(() => {
    if (open) {
      if (isEdit) {
        setForm({
          mes_referencia: atividade.mes_referencia || MESES[new Date().getMonth()],
          ano: atividade.ano || new Date().getFullYear(),
          titulo: atividade.titulo || '',
          classificacao: atividade.classificacao || '',
          data_inicio: atividade.data_inicio || '',
          data_fim: atividade.data_fim || '',
          museu: atividade.museu || '',
          tipo_acao: atividade.tipo_acao || '',
          equipe_responsavel: atividade.equipe_responsavel || '',
          usuario_responsavel_id: atividade.usuario_responsavel_id || '',
          publico_estimado: atividade.publico_estimado || 0,
          quantas_repeticoes: atividade.quantas_repeticoes || 1,
          publico_total: atividade.publico_total || 0,
          eh_mobilizacao: atividade.eh_mobilizacao || false,
          tipo_mobilizacao: atividade.tipo_mobilizacao || '',
          descricao_mobilizacao: atividade.descricao_mobilizacao || '',
          houve_contratacoes: atividade.houve_contratacoes || false,
          numero_trabalhadores: atividade.numero_trabalhadores || 0,
          numero_empresas: atividade.numero_empresas || 0,
          valor_aproximado: atividade.valor_aproximado || 0,
          produtos_entregues: atividade.produtos_entregues || [],
          quantidade_produtos: atividade.quantidade_produtos || 1,
          objetivo: atividade.objetivo || '',
          descricao: atividade.descricao || '',
          resultados: atividade.resultados || '',
          problemas: atividade.problemas || '',
          solucoes: atividade.solucoes || '',
          depoimento_participantes: atividade.depoimento_participantes || '',
        });
      } else {
        setForm(makeEmptyForm());
      }
      setSearchUsers('');
      setShowUserPicker(false);
    }
  }, [open, atividade, isEdit]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-calcular público total
  useEffect(() => {
    const total = (form.publico_estimado || 0) * (form.quantas_repeticoes || 1);
    set('publico_total', total);
  }, [form.publico_estimado, form.quantas_repeticoes]);

  const pendingCount = () => {
    let count = 0;
    if (!form.classificacao) count++;
    if (!form.titulo) count++;
    if (!form.equipe_responsavel) count++;
    return count;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo) { toast.error('Título é obrigatório'); return; }
    if (!form.classificacao) { toast.error('Classificação é obrigatória'); return; }
    if (!form.equipe_responsavel) { toast.error('Equipe responsável é obrigatória'); return; }
    
    setLoading(true);
    try {
      if (isEdit) {
        await base44.entities.Activity.update(atividade.id, form);
        toast.success('Atividade atualizada com sucesso!');
        onSaved?.();
        onClose();
      } else {
        const res = await base44.functions.invoke('createActivityWithAutoReport', {
          ...form,
          ano: parseInt(form.ano),
        });
        if (res.data?.atividade) {
          toast.success('Atividade criada com sucesso!');
          onSaved?.();
          onClose();
        } else {
          toast.error(res.data?.error || 'Erro ao criar atividade');
        }
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === form.usuario_responsavel_id);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between z-10">
          <div>
            <DialogTitle className="text-xl font-bold">
              {isEdit ? '✏️ Editar Atividade' : '➕ Inserir Nova Atividade'}
            </DialogTitle>
            {pendingCount() > 0 && !isEdit && (
              <p className="text-xs text-orange-600 mt-1">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                {pendingCount()} campo(s) pendente(s)
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="justify-start border-b rounded-none bg-transparent px-6 w-full">
            <TabsTrigger value="basico">Identificação</TabsTrigger>
            <TabsTrigger value="publico">Público</TabsTrigger>
            <TabsTrigger value="detalhes">Registro Detalhado</TabsTrigger>
            {form.eh_mobilizacao && <TabsTrigger value="mobilizacao">Mobilização</TabsTrigger>}
            {form.houve_contratacoes && <TabsTrigger value="contratacoes">Contratações</TabsTrigger>}
          </TabsList>

          {/* Tab: Identificação */}
          <TabsContent value="basico" className="p-6 space-y-6">
            {!isEdit && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <Field label="Mês de referência">
                  <Select value={form.mes_referencia} onValueChange={v => set('mes_referencia', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Ano">
                  <Input type="number" value={form.ano} onChange={e => set('ano', e.target.value)} />
                </Field>
              </div>
            )}

            {/* Status Banner */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                {pendingCount() > 0 ? `${pendingCount()} campo(s) obrigatório(s) faltando` : '✓ Todos os campos obrigatórios preenchidos'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Classificação da Atividade" required>
                <Select value={form.classificacao} onValueChange={v => set('classificacao', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a classificação" /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICACOES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome da atividade" required>
                <Input
                  placeholder="Nome"
                  value={form.titulo}
                  onChange={e => set('titulo', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Equipe responsável" required>
                <Select value={form.equipe_responsavel} onValueChange={v => set('equipe_responsavel', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {EQUIPES.map(eq => <SelectItem key={eq} value={eq}>{eq}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Co-responsável (outro profissional)">
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => setShowUserPicker(!showUserPicker)}
                  >
                    {selectedUser ? selectedUser.full_name : 'Selecione um profissional'}
                  </Button>
                  {showUserPicker && (
                    <div className="absolute top-10 left-0 right-0 border border-gray-200 bg-white rounded-lg shadow-lg z-10">
                      <Input
                        placeholder="Buscar usuário..."
                        className="m-2 text-sm"
                        value={searchUsers}
                        onChange={e => setSearchUsers(e.target.value)}
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            onClick={() => {
                              set('usuario_responsavel_id', u.id);
                              setShowUserPicker(false);
                            }}
                          >
                            <div className="font-medium">{u.full_name}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data de início">
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={e => set('data_inicio', e.target.value)}
                  placeholder="dd/mm/aaaa"
                />
              </Field>
              <Field label="Data de término (opcional)">
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={e => set('data_fim', e.target.value)}
                  placeholder="dd/mm/aaaa"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Museu / Local">
                <Select value={form.museu} onValueChange={v => set('museu', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tipo de ação">
                <Select value={form.tipo_acao} onValueChange={v => set('tipo_acao', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_ACAO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Mobilização */}
            <div className="border-t pt-4">
              <Field label="É uma atividade de mobilização/divulgação?">
                <Select value={form.eh_mobilizacao ? 'sim' : 'nao'} onValueChange={v => set('eh_mobilizacao', v === 'sim')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Contratações */}
            <div>
              <Field label="Houve contratações de profissionais da cadeia da cultura?">
                <Select value={form.houve_contratacoes ? 'sim' : 'nao'} onValueChange={v => set('houve_contratacoes', v === 'sim')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </TabsContent>

          {/* Tab: Público */}
          <TabsContent value="publico" className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Público estimado (por ocorrência)">
                <Input
                  type="number"
                  min="0"
                  value={form.publico_estimado}
                  onChange={e => set('publico_estimado', parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field label="Quantas vezes ocorreu?">
                <Input
                  type="number"
                  min="1"
                  value={form.quantas_repeticoes}
                  onChange={e => set('quantas_repeticoes', parseInt(e.target.value) || 1)}
                />
              </Field>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-sm font-medium text-blue-900">
                Público total: <strong className="text-lg">{form.publico_total}</strong>
              </p>
            </div>

            <Field label="Produto realizado">
              <Select value={form.produtos_entregues[0] || ''} onValueChange={v => set('produtos_entregues', v ? [v] : [])}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {PRODUTOS_REALIZADOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Quantidade de produtos gerados">
              <Input
                type="number"
                min="1"
                placeholder="Ex: 10 posts, 5 oficinas"
                value={form.quantidade_produtos}
                onChange={e => set('quantidade_produtos', parseInt(e.target.value) || 1)}
              />
            </Field>
          </TabsContent>

          {/* Tab: Registro Detalhado */}
          <TabsContent value="detalhes" className="p-6 space-y-6">
            <Field label="Objetivo">
              <Textarea
                placeholder="Objetivo da atividade..."
                value={form.objetivo}
                onChange={e => set('objetivo', e.target.value)}
                rows={3}
              />
            </Field>

            <Field label="Descrição do executado">
              <Textarea
                placeholder="O que foi feito..."
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
                rows={3}
              />
            </Field>

            <Field label="Resultados e impactos">
              <div className="space-y-2">
                <Textarea
                  placeholder="Resultados observados, impacto no público..."
                  value={form.resultados}
                  onChange={e => set('resultados', e.target.value)}
                  rows={3}
                />
                <Button variant="outline" size="sm" className="gap-2">
                  <Sparkles className="w-3 h-3" />
                  Sugerir com IA
                </Button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Problemas (opcional)">
                <Textarea
                  placeholder="Problemas encontrados..."
                  value={form.problemas}
                  onChange={e => set('problemas', e.target.value)}
                  rows={2}
                />
              </Field>
              <Field label="Soluções (opcional)">
                <Textarea
                  placeholder="Como foram resolvidos..."
                  value={form.solucoes}
                  onChange={e => set('solucoes', e.target.value)}
                  rows={2}
                />
              </Field>
            </div>

            <Field label="Depoimento de Participantes ou Fatos Marcantes">
              <Textarea
                placeholder="Relatos dos participantes, histórias marcantes, feedback importante..."
                value={form.depoimento_participantes}
                onChange={e => set('depoimento_participantes', e.target.value)}
                rows={3}
              />
            </Field>

            {/* Clipping */}
            <div className="border-t pt-4">
              <Button variant="outline" className="w-full gap-2 text-gray-600">
                📰 Buscar Notícias e Redes Sociais
              </Button>
            </div>
          </TabsContent>

          {/* Tab: Mobilização */}
          {form.eh_mobilizacao && (
            <TabsContent value="mobilizacao" className="p-6 space-y-6">
              <Field label="Tipo de mobilização">
                <Select value={form.tipo_mobilizacao} onValueChange={v => set('tipo_mobilizacao', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Visita a Escolas">Visita a Escolas</SelectItem>
                    <SelectItem value="Visita a Instituições">Visita a Instituições</SelectItem>
                    <SelectItem value="Panfletagem">Panfletagem</SelectItem>
                    <SelectItem value="Reunião Comunitária">Reunião Comunitária</SelectItem>
                    <SelectItem value="Ativação de Redes Sociais">Ativação de Redes Sociais</SelectItem>
                    <SelectItem value="Envio em Grupos de WhatsApp">Envio em Grupos de WhatsApp</SelectItem>
                    <SelectItem value="Contatos Telefônicos">Contatos Telefônicos</SelectItem>
                    <SelectItem value="Chat">Chat</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Descrição detalhada da ação">
                <Textarea
                  placeholder="Descreva a ação de mobilização/divulgação..."
                  value={form.descricao_mobilizacao}
                  onChange={e => set('descricao_mobilizacao', e.target.value)}
                  rows={4}
                />
              </Field>
            </TabsContent>
          )}

          {/* Tab: Contratações */}
          {form.houve_contratacoes && (
            <TabsContent value="contratacoes" className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Field label="Nº de trabalhadores">
                  <Input
                    type="number"
                    min="0"
                    value={form.numero_trabalhadores}
                    onChange={e => set('numero_trabalhadores', parseInt(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Nº de empresas">
                  <Input
                    type="number"
                    min="0"
                    value={form.numero_empresas}
                    onChange={e => set('numero_empresas', parseInt(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Valor aproximado (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_aproximado}
                    onChange={e => set('valor_aproximado', parseFloat(e.target.value) || 0)}
                  />
                </Field>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Footer */}
        <DialogFooter className="border-t p-6 bg-gray-50">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Inserir Nova Atividade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}