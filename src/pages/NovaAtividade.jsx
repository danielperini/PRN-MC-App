import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, History, Edit2, Trash2, Link as LinkIcon, Filter, Activity, X, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const CLASSIFICACOES = ['META', 'ROTINA', 'EXTRA'];

const CLASSIF_BADGE = {
  META: 'bg-blue-100 text-blue-800',
  ROTINA: 'bg-green-100 text-green-700',
  EXTRA: 'bg-orange-100 text-orange-700',
};

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

const makeEmptyForm = () => {
  const now = new Date();
  return {
    titulo: '', descricao: '', classificacao: '', data_realizacao: '',
    museu: '', equipe_responsavel: '',
    mes_referencia: MESES[now.getMonth()],
    ano: now.getFullYear(),
  };
};

// ——— Dialog de criação / edição ———
function AtividadeDialog({ open, onClose, atividade, onSaved }) {
  const isEdit = !!atividade;
  const [form, setForm] = useState(makeEmptyForm());
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(isEdit ? {
        titulo: atividade.titulo || '',
        descricao: atividade.descricao || '',
        classificacao: atividade.classificacao || '',
        data_realizacao: atividade.data_realizacao || '',
        museu: atividade.museu || '',
        equipe_responsavel: atividade.equipe_responsavel || '',
        mes_referencia: atividade.mes_referencia || MESES[new Date().getMonth()],
        ano: atividade.ano || new Date().getFullYear(),
      } : makeEmptyForm());
    }
  }, [open, atividade]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo) { toast.error('Título é obrigatório'); return; }
    if (!form.classificacao) { toast.error('Classificação é obrigatória'); return; }
    setLoading(true);

    try {
      if (isEdit) {
        // Editar campos da atividade (mantém report_id original)
        await base44.entities.Activity.update(atividade.id, {
          titulo: form.titulo,
          descricao: form.descricao,
          classificacao: form.classificacao,
          data_realizacao: form.data_realizacao,
          museu: form.museu,
          equipe_responsavel: form.equipe_responsavel,
        });
        toast.success('Atividade atualizada com sucesso!');
        onSaved?.();
        onClose();
      } else {
        // Criar: backend function garante o relatório mensal
        const res = await base44.functions.invoke('createActivityWithAutoReport', {
          ...form,
          ano: parseInt(form.ano),
        });
        if (res.data?.atividade) {
          toast.success(
            res.data.report_created
              ? 'Atividade criada! Relatório mensal gerado automaticamente.'
              : 'Atividade criada e vinculada ao relatório do mês.',
          );
          onSaved?.();
          onClose();
        } else {
          toast.error(res.data?.error || 'Erro ao criar atividade');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {isEdit ? 'Editar Atividade' : 'Nova Atividade'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-lg">
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
              <p className="col-span-2 text-xs text-blue-600">
                O relatório mensal será criado automaticamente se ainda não existir.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Título da atividade" required>
              <Input
                placeholder="Ex: Visita mediada — MHAB"
                value={form.titulo}
                onChange={e => set('titulo', e.target.value)}
              />
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
                  {EQUIPES.map(eq => <SelectItem key={eq} value={eq}>{eq}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Descrição">
            <Textarea
              rows={3}
              placeholder="Descreva a atividade..."
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="bg-black hover:bg-gray-800 text-white" disabled={loading}>
              {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar Atividade'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ——— Card de atividade ———
function AtividadeCard({ atividade, canEdit, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.Activity.delete(atividade.id);
    toast.success('Atividade removida.');
    onDelete?.();
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-medium text-sm text-black">{atividade.titulo || '(sem título)'}</span>
          {atividade.classificacao && (
            <Badge className={`text-xs ${CLASSIF_BADGE[atividade.classificacao] || 'bg-gray-100'}`}>
              {atividade.classificacao}
            </Badge>
          )}
          {atividade.museu && <Badge variant="outline" className="text-xs">{atividade.museu}</Badge>}
          {atividade.equipe_responsavel && (
            <Badge variant="outline" className="text-xs">{atividade.equipe_responsavel}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {atividade.report_id && (
            <Link to={createPageUrl(`ReportEditor?id=${atividade.report_id}`)}>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 text-gray-500 hover:text-black">
                <LinkIcon className="w-3 h-3" />Relatório
              </Button>
            </Link>
          )}
          {canEdit && (
            <>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-black"
                onClick={() => onEdit(atividade)}
                title="Editar"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                  onClick={() => setConfirmDelete(true)}
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-1 border border-red-200 rounded-lg px-2 py-1 bg-red-50">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-xs text-red-600">Remover?</span>
                  <Button
                    size="sm" variant="destructive"
                    className="h-5 text-xs px-2 ml-1"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? '...' : 'Sim'}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={() => setConfirmDelete(false)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Corpo do card */}
      <div className="px-5 py-3">
        {atividade.descricao && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{atividade.descricao}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {atividade.data_realizacao && <span>📅 {atividade.data_realizacao}</span>}
          {atividade.created_by && <span>👤 {atividade.created_by}</span>}
          {!atividade.report_id && (
            <span className="text-orange-500">⚠ Sem relatório vinculado</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— Página principal ———
function HistoricoInner() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const [showDialog, setShowDialog] = useState(false);
  const [editingAtiv, setEditingAtiv] = useState(null);
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterEquipe, setFilterEquipe] = useState('');

  // Coordenadores veem TODAS as atividades; utilizadores apenas as suas
  const { data: atividades = [], isLoading } = useQuery({
    queryKey: ['historico-atividades', isCoordenador, currentUser?.email],
    queryFn: () => {
      if (!currentUser?.email) return Promise.resolve([]);
      if (isCoordenador) {
        return base44.entities.Activity.list('-created_date', 300);
      }
      return base44.entities.Activity.filter({ created_by: currentUser.email }, '-created_date', 100);
    },
    enabled: !!currentUser?.email,
  });

  const atividadesFiltradas = useMemo(() => {
    let result = atividades;
    if (filterClasse) result = result.filter(a => a.classificacao === filterClasse);
    if (filterMuseu) result = result.filter(a => a.museu === filterMuseu);
    if (filterEquipe) result = result.filter(a => a.equipe_responsavel === filterEquipe);
    return result;
  }, [atividades, filterClasse, filterMuseu, filterEquipe]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['historico-atividades'] });
    setShowDialog(false);
    setEditingAtiv(null);
  };

  const handleEdit = (ativ) => {
    setEditingAtiv(ativ);
    setShowDialog(true);
  };

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['historico-atividades'] });
  };

  const openCreate = () => {
    setEditingAtiv(null);
    setShowDialog(true);
  };

  // Coordenadores podem editar qualquer atividade; utilizadores só as suas
  const canEditActivity = (ativ) => {
    if (isCoordenador) return true;
    return ativ.created_by === currentUser?.email;
  };

  const hasActiveFilters = filterClasse || filterMuseu || filterEquipe;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Histórico</h1>
            <p className="text-sm text-gray-500">
              {isCoordenador
                ? 'Todas as atividades registadas na plataforma'
                : 'As suas atividades registadas'}
            </p>
          </div>
        </div>
        <Button
          className="bg-black hover:bg-gray-800 text-white gap-2"
          onClick={openCreate}
        >
          <Plus className="w-4 h-4" />Criar Nova Atividade
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap mb-6 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <Select value={filterClasse || 'all'} onValueChange={v => setFilterClasse(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white"><SelectValue placeholder="Classificação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as classes</SelectItem>
            {CLASSIFICACOES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMuseu || 'all'} onValueChange={v => setFilterMuseu(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white"><SelectValue placeholder="Museu" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os museus</SelectItem>
            {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEquipe || 'all'} onValueChange={v => setFilterEquipe(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white"><SelectValue placeholder="Equipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as equipes</SelectItem>
            {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost" size="sm" className="h-8 text-xs text-gray-500"
            onClick={() => { setFilterClasse(''); setFilterMuseu(''); setFilterEquipe(''); }}
          >
            <X className="w-3 h-3 mr-1" />Limpar
          </Button>
        )}
        <Badge variant="outline" className="text-xs ml-auto">
          {atividadesFiltradas.length} atividade(s)
        </Badge>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-3" />
          Carregando atividades...
        </div>
      ) : atividadesFiltradas.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {hasActiveFilters ? 'Nenhuma atividade com estes filtros.' : 'Nenhuma atividade registada ainda.'}
          </p>
          {!hasActiveFilters && (
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />Criar primeira atividade
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {atividadesFiltradas.map(ativ => (
            <AtividadeCard
              key={ativ.id}
              atividade={ativ}
              canEdit={canEditActivity(ativ)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Dialog de criação / edição */}
      <AtividadeDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingAtiv(null); }}
        atividade={editingAtiv}
        onSaved={handleSaved}
      />
    </div>
  );
}

export default function NovaAtividade() {
  return <RequireAuth><HistoricoInner /></RequireAuth>;
}