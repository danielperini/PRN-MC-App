import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft, Package, Activity, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const CLASSIFICACOES = ['META', 'ROTINA', 'EXTRA'];
const TIPOS_PRODUTO = [
  'Catálogo', 'Folder', 'Vídeo', 'Cobertura de Vídeo', 'Cobertura Fotográfica',
  'Texto', 'Design', 'Identidade Visual', 'Logomarca', 'Release', 'Post', 'Relatório', 'Outro'
];

const CLASSIF_BADGE = {
  META: 'bg-blue-100 text-blue-800',
  ROTINA: 'bg-green-100 text-green-700',
  EXTRA: 'bg-orange-100 text-orange-700',
};

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
      {children}
    </div>
  );
}

// ——— Formulário de Produto ———
function ProdutoForm({ activityId, reportId, onCreated }) {
  const [form, setForm] = useState({ nome: '', tipo: '', descricao: '', quantidade: 1, link_arquivo: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome || !form.tipo) { toast.error('Nome e tipo são obrigatórios'); return; }
    setLoading(true);
    const res = await base44.functions.invoke('createProductLinkedToActivity', {
      activity_id: activityId,
      ...form,
    });
    setLoading(false);
    if (res.data?.produto) {
      toast.success('Produto criado e vinculado à atividade!');
      setForm({ nome: '', tipo: '', descricao: '', quantidade: 1, link_arquivo: '' });
      onCreated && onCreated(res.data.produto);
    } else {
      toast.error(res.data?.error || 'Erro ao criar produto');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border border-gray-100 rounded-xl bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" />Novo Produto
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Nome do produto" required>
          <Input placeholder="Ex: Post redes sociais" value={form.nome} onChange={e => set('nome', e.target.value)} />
        </Field>
        <Field label="Tipo" required>
          <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {TIPOS_PRODUTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Quantidade">
          <Input type="number" min={1} value={form.quantidade} onChange={e => set('quantidade', parseInt(e.target.value) || 1)} />
        </Field>
        <Field label="Link do arquivo (opcional)">
          <Input placeholder="https://..." value={form.link_arquivo} onChange={e => set('link_arquivo', e.target.value)} />
        </Field>
      </div>
      <Field label="Descrição (opcional)">
        <Textarea rows={2} placeholder="Descreva o produto..." value={form.descricao} onChange={e => set('descricao', e.target.value)} />
      </Field>
      <Button type="submit" size="sm" className="bg-black hover:bg-gray-800 text-white gap-1.5" disabled={loading}>
        <Plus className="w-4 h-4" />{loading ? 'Salvando...' : 'Adicionar Produto'}
      </Button>
    </form>
  );
}

// ——— Card de Atividade com produtos vinculados ———
function AtividadeCard({ atividade, onProdutoAdded }) {
  const [showProdutoForm, setShowProdutoForm] = useState(false);
  const [produtos, setProdutos] = useState([]);

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-atividade', atividade.id],
    queryFn: () => base44.entities.Product.filter({ activity_id: atividade.id }),
    initialData: [],
  });

  const allProdutos = [...produtosData, ...produtos];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-sm text-black">{atividade.titulo || '(sem título)'}</span>
          {atividade.classificacao && (
            <Badge className={`text-xs ${CLASSIF_BADGE[atividade.classificacao] || 'bg-gray-100'}`}>
              {atividade.classificacao}
            </Badge>
          )}
          {atividade.museu && <Badge variant="outline" className="text-xs">{atividade.museu}</Badge>}
          {atividade.equipe_responsavel && <Badge variant="outline" className="text-xs">{atividade.equipe_responsavel}</Badge>}
          {allProdutos.length > 0 && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
              <Package className="w-3 h-3 mr-1" />{allProdutos.length} produto(s)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {atividade.report_id && (
            <Link to={createPageUrl(`ReportEditor?id=${atividade.report_id}`)}>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                <LinkIcon className="w-3 h-3" />Ver relatório
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-7"
            onClick={() => setShowProdutoForm(v => !v)}
          >
            <Plus className="w-3 h-3" />Produto
          </Button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {atividade.descricao && <p className="text-sm text-gray-600">{atividade.descricao}</p>}
        {atividade.data_realizacao && (
          <p className="text-xs text-gray-400">
            Data: {atividade.data_realizacao}
          </p>
        )}

        {/* Produtos vinculados */}
        {allProdutos.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produtos vinculados</p>
            {allProdutos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 bg-purple-50 rounded-lg">
                <Package className="w-4 h-4 text-purple-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-black">{p.nome}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.tipo}</span>
                  {p.quantidade > 1 && <span className="text-xs text-gray-400 ml-2">× {p.quantidade}</span>}
                </div>
                {p.link_arquivo && (
                  <a href={p.link_arquivo} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 text-gray-400 hover:text-black" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formulário de novo produto */}
        {showProdutoForm && (
          <ProdutoForm
            activityId={atividade.id}
            reportId={atividade.report_id}
            onCreated={(p) => {
              setProdutos(prev => [...prev, p]);
              setShowProdutoForm(false);
              onProdutoAdded && onProdutoAdded();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ——— Formulário de nova atividade ———
function NovaAtividadeInner() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const mesAtual = MESES[new Date().getMonth()];
  const anoAtual = new Date().getFullYear();

  const [form, setForm] = useState({
    titulo: '', descricao: '', classificacao: '', data_realizacao: '',
    museu: '', equipe_responsavel: '', mes_referencia: mesAtual, ano: anoAtual,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Listar atividades do utilizador logado
  const { data: atividades = [], refetch } = useQuery({
    queryKey: ['minhas-atividades', currentUser?.email],
    queryFn: () => currentUser?.email
      ? base44.entities.Activity.filter({ created_by: currentUser.email }, '-created_date', 50)
      : Promise.resolve([]),
    enabled: !!currentUser?.email,
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.classificacao) { toast.error('Classificação é obrigatória'); return; }
    if (!form.titulo) { toast.error('Título é obrigatório'); return; }
    setLoading(true);
    const res = await base44.functions.invoke('createActivityWithAutoReport', {
      ...form,
      ano: parseInt(form.ano),
    });
    setLoading(false);
    if (res.data?.atividade) {
      toast.success(
        res.data.report_created
          ? 'Atividade criada! Relatório mensal gerado automaticamente.'
          : 'Atividade criada e vinculada ao relatório do mês.',
        { description: `Relatório: ${form.mes_referencia} ${form.ano}` }
      );
      setForm(p => ({ ...p, titulo: '', descricao: '', data_realizacao: '' }));
      refetch();
      queryClient.invalidateQueries(['minhas-atividades']);
    } else {
      toast.error(res.data?.error || 'Erro ao criar atividade');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-black">Atividades & Produtos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Crie atividades e elas serão automaticamente vinculadas ao seu relatório mensal</p>
        </div>
      </div>

      {/* Formulário de nova atividade */}
      <div className="border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-base font-semibold text-black mb-5 flex items-center gap-2">
          <Activity className="w-4 h-4" />Nova Atividade
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Mês de referência" required>
              <Select value={form.mes_referencia} onValueChange={v => set('mes_referencia', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ano" required>
              <Input type="number" value={form.ano} onChange={e => set('ano', e.target.value)} />
            </Field>
            <Field label="Título da atividade" required>
              <Input placeholder="Ex: Visita mediada — MHAB" value={form.titulo} onChange={e => set('titulo', e.target.value)} />
            </Field>
            <Field label="Classificação" required>
              <Select value={form.classificacao} onValueChange={v => set('classificacao', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICACOES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de realização">
              <Input type="date" value={form.data_realizacao} onChange={e => set('data_realizacao', e.target.value)} />
            </Field>
            <Field label="Museu / Local">
              <Select value={form.museu} onValueChange={v => set('museu', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Equipe responsável">
              <Select value={form.equipe_responsavel} onValueChange={v => set('equipe_responsavel', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Descrição">
            <Textarea rows={3} placeholder="Descreva a atividade..." value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" className="bg-black hover:bg-gray-800 text-white gap-2" disabled={loading}>
              <Plus className="w-4 h-4" />{loading ? 'Criando...' : 'Criar Atividade'}
            </Button>
          </div>
        </form>
      </div>

      {/* Lista de atividades do utilizador */}
      <div>
        <h2 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" />Minhas Atividades
          <Badge variant="outline" className="text-xs">{atividades.length}</Badge>
        </h2>
        {atividades.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-400 text-sm">Nenhuma atividade registrada ainda.</p>
            <p className="text-gray-300 text-xs mt-1">Use o formulário acima para criar a primeira.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {atividades.map(ativ => (
              <AtividadeCard key={ativ.id} atividade={ativ} onProdutoAdded={() => queryClient.invalidateQueries(['produtos-atividade', ativ.id])} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NovaAtividade() {
  return <RequireAuth><NovaAtividadeInner /></RequireAuth>;
}