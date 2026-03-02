import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ArrowLeft, 
  Save, 
  Send, 
  Plus, 
  Trash2,
  CheckCircle,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import AttachmentsSection from '../components/reports/AttachmentsSection';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Coordenador', 'Outro'];

export default function ReportEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');

  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    author_name: '',
    author_role: 'PROFISSIONAL',
    funcao: '',
    museu: '',
    museu_secundario: '',
    equipe: '',
    mes_referencia: '',
    ano: 2026,
    resumo_executivo: '',
    atividades: [],
    oportunidades: [],
    avaliacao_pontos_positivos: '',
    avaliacao_desafios: '',
    avaliacao_sugestoes: '',
    status: 'DRAFT',
    return_comment: ''
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
      if (!reportId) {
        setFormData(prev => ({
          ...prev,
          author_name: user.full_name || '',
          author_role: user.role || 'PROFISSIONAL',
          museu: user.museu || ''
        }));
      }
    };
    loadUser();
  }, [reportId]);

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => base44.entities.Report.filter({ id: reportId }),
    enabled: !!reportId,
    select: (data) => data[0]
  });

  useEffect(() => {
    if (report) {
      setFormData(report);
    }
  }, [report]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (reportId) {
        return base44.entities.Report.update(reportId, data);
      } else {
        return base44.entities.Report.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Relatório salvo com sucesso');
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const data = { ...formData, status: 'SUBMITTED' };
      if (reportId) {
        return base44.entities.Report.update(reportId, data);
      } else {
        return base44.entities.Report.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Relatório enviado para revisão');
      navigate(createPageUrl('Dashboard'));
    }
  });

  const workflowMutation = useMutation({
    mutationFn: async ({ action, comment }) => {
      let newStatus = formData.status;
      let data = { ...formData };
      
      switch(action) {
        case 'start_review':
          newStatus = 'IN_REVIEW';
          break;
        case 'return':
          newStatus = 'RETURNED';
          data.return_comment = comment;
          break;
        case 'approve':
          newStatus = 'APPROVED';
          break;
        case 'archive':
          newStatus = 'ARCHIVED';
          break;
        case 'reopen':
          newStatus = 'DRAFT';
          break;
      }
      
      return base44.entities.Report.update(reportId, { ...data, status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Status atualizado');
    }
  });

  const addAtividade = () => {
    setFormData(prev => ({
      ...prev,
      atividades: [...prev.atividades, {
        titulo: '',
        descricao: '',
        data_realizacao: '',
        publico_estimado: 0,
        observacoes: ''
      }]
    }));
  };

  const updateAtividade = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      atividades: prev.atividades.map((a, i) => 
        i === index ? { ...a, [field]: value } : a
      )
    }));
  };

  const removeAtividade = (index) => {
    setFormData(prev => ({
      ...prev,
      atividades: prev.atividades.filter((_, i) => i !== index)
    }));
  };

  const addOportunidade = () => {
    setFormData(prev => ({
      ...prev,
      oportunidades: [...prev.oportunidades, {
        titulo: '',
        descricao: '',
        tipo: 'MELHORIA',
        prioridade: 'MEDIA'
      }]
    }));
  };

  const updateOportunidade = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      oportunidades: prev.oportunidades.map((o, i) => 
        i === index ? { ...o, [field]: value } : o
      )
    }));
  };

  const removeOportunidade = (index) => {
    setFormData(prev => ({
      ...prev,
      oportunidades: prev.oportunidades.filter((_, i) => i !== index)
    }));
  };

  const canEdit = formData.status === 'DRAFT' || formData.status === 'RETURNED';
  const isCoordenador = currentUser?.role === 'COORDENADOR' || currentUser?.role === 'ADMIN';

  if (isLoading && reportId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Dashboard')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-black">
                {reportId ? 'Editar Relatório' : 'Novo Relatório'}
              </h1>
              {formData.status !== 'DRAFT' && (
                <p className="text-sm text-gray-500">
                  Status: {formData.status}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            {canEdit && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => saveMutation.mutate(formData)}
                  disabled={saveMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Rascunho
                </Button>
                <Button 
                  className="bg-black hover:bg-gray-800"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar para Revisão
                </Button>
              </>
            )}
            
            {isCoordenador && formData.status === 'SUBMITTED' && (
              <Button 
                variant="outline"
                onClick={() => workflowMutation.mutate({ action: 'start_review' })}
              >
                Iniciar Revisão
              </Button>
            )}
            
            {isCoordenador && formData.status === 'IN_REVIEW' && (
              <>
                <Button 
                  variant="outline"
                  className="text-red-600"
                  onClick={() => {
                    const comment = prompt('Motivo da devolução:');
                    if (comment) workflowMutation.mutate({ action: 'return', comment });
                  }}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Devolver
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => workflowMutation.mutate({ action: 'approve' })}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprovar
                </Button>
              </>
            )}
            
            {isCoordenador && formData.status === 'APPROVED' && (
              <Button 
                variant="outline"
                onClick={() => workflowMutation.mutate({ action: 'archive' })}
              >
                Arquivar
              </Button>
            )}
            
            {isCoordenador && (formData.status === 'ARCHIVED' || formData.status === 'APPROVED') && (
              <Button 
                variant="outline"
                onClick={() => workflowMutation.mutate({ action: 'reopen' })}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reabrir
              </Button>
            )}
          </div>
        </div>

        {formData.return_comment && formData.status === 'RETURNED' && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm font-medium text-red-800">Motivo da devolução:</p>
            <p className="text-red-700">{formData.return_comment}</p>
          </div>
        )}

        {/* Form */}
        <div className="space-y-10">
          {/* Identificação */}
          <section>
            <h2 className="text-lg font-medium text-black mb-4">Identificação</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Nome do Profissional</Label>
                <Input
                  value={formData.author_name || ''}
                  onChange={e => setFormData({...formData, author_name: e.target.value})}
                  disabled={!canEdit && !isCoordenador}
                />
              </div>
              <div>
                <Label>Função</Label>
                <Select value={formData.funcao || ''} onValueChange={v => setFormData({...formData, funcao: v})} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                  <SelectContent>
                    {FUNCOES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Museu Principal</Label>
                <Select value={formData.museu || ''} onValueChange={v => setFormData({...formData, museu: v})} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Equipe</Label>
                <Select value={formData.equipe || ''} onValueChange={v => setFormData({...formData, equipe: v})} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
                  <SelectContent>
                    {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Atuou em outro museu?</Label>
                <Select value={formData.museu_secundario ? 'sim' : 'nao'} onValueChange={v => setFormData({...formData, museu_secundario: v === 'nao' ? '' : formData.museu_secundario})} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.museu_secundario !== '' && (
                <div>
                  <Label>Qual museu?</Label>
                  <Select value={formData.museu_secundario || ''} onValueChange={v => setFormData({...formData, museu_secundario: v})} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {MUSEUS.filter(m => m !== formData.museu).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Mês de Referência</Label>
                <Select value={formData.mes_referencia || ''} onValueChange={v => setFormData({...formData, mes_referencia: v})} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Input type="number" value={formData.ano || 2026} onChange={e => setFormData({...formData, ano: parseInt(e.target.value)})} disabled={!canEdit} />
              </div>
            </div>
          </section>

          {/* Resumo Executivo */}
          <section>
            <h2 className="text-lg font-medium text-black mb-4">Resumo Executivo</h2>
            <Textarea 
              placeholder="Descreva brevemente os principais acontecimentos do mês..."
              value={formData.resumo_executivo || ''}
              onChange={(e) => setFormData({...formData, resumo_executivo: e.target.value})}
              className="min-h-32"
              disabled={!canEdit}
            />
          </section>

          {/* Atividades */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-black">Atividades Realizadas</h2>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={addAtividade}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>
            
            {formData.atividades?.length === 0 ? (
              <p className="text-gray-400 text-center py-8 border border-dashed rounded-xl">
                Nenhuma atividade adicionada
              </p>
            ) : (
              <div className="space-y-4">
                {formData.atividades?.map((atividade, index) => (
                  <div key={index} className="p-5 border border-gray-100 rounded-xl">
                    <div className="flex justify-between mb-3">
                      <span className="text-sm font-medium text-gray-500">Atividade {index + 1}</span>
                      {canEdit && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 h-auto p-1"
                          onClick={() => removeAtividade(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <Input 
                        placeholder="Título da atividade"
                        value={atividade.titulo || ''}
                        onChange={(e) => updateAtividade(index, 'titulo', e.target.value)}
                        disabled={!canEdit}
                      />
                      <Textarea 
                        placeholder="Descrição"
                        value={atividade.descricao || ''}
                        onChange={(e) => updateAtividade(index, 'descricao', e.target.value)}
                        disabled={!canEdit}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Input 
                          type="date"
                          value={atividade.data_realizacao || ''}
                          onChange={(e) => updateAtividade(index, 'data_realizacao', e.target.value)}
                          disabled={!canEdit}
                        />
                        <Input 
                          type="number"
                          placeholder="Público estimado"
                          value={atividade.publico_estimado || ''}
                          onChange={(e) => updateAtividade(index, 'publico_estimado', parseInt(e.target.value) || 0)}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Oportunidades */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-black">Oportunidades Identificadas</h2>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={addOportunidade}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>
            
            {formData.oportunidades?.length === 0 ? (
              <p className="text-gray-400 text-center py-8 border border-dashed rounded-xl">
                Nenhuma oportunidade adicionada
              </p>
            ) : (
              <div className="space-y-4">
                {formData.oportunidades?.map((oportunidade, index) => (
                  <div key={index} className="p-5 border border-gray-100 rounded-xl">
                    <div className="flex justify-between mb-3">
                      <span className="text-sm font-medium text-gray-500">Oportunidade {index + 1}</span>
                      {canEdit && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 h-auto p-1"
                          onClick={() => removeOportunidade(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <Input 
                        placeholder="Título"
                        value={oportunidade.titulo || ''}
                        onChange={(e) => updateOportunidade(index, 'titulo', e.target.value)}
                        disabled={!canEdit}
                      />
                      <Textarea 
                        placeholder="Descrição"
                        value={oportunidade.descricao || ''}
                        onChange={(e) => updateOportunidade(index, 'descricao', e.target.value)}
                        disabled={!canEdit}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Select 
                          value={oportunidade.tipo} 
                          onValueChange={(v) => updateOportunidade(index, 'tipo', v)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MELHORIA">Melhoria</SelectItem>
                            <SelectItem value="PARCERIA">Parceria</SelectItem>
                            <SelectItem value="EVENTO">Evento</SelectItem>
                            <SelectItem value="OUTRO">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select 
                          value={oportunidade.prioridade} 
                          onValueChange={(v) => updateOportunidade(index, 'prioridade', v)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BAIXA">Baixa</SelectItem>
                            <SelectItem value="MEDIA">Média</SelectItem>
                            <SelectItem value="ALTA">Alta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Anexos — só exibe se relatório já foi salvo */}
          {reportId && (
            <AttachmentsSection reportId={reportId} canEdit={canEdit} />
          )}

          {/* Avaliação */}
          <section>
            <h2 className="text-lg font-medium text-black mb-4">Avaliação do Mês</h2>
            <div className="space-y-4">
              <div>
                <Label>Pontos Positivos</Label>
                <Textarea 
                  placeholder="O que funcionou bem este mês..."
                  value={formData.avaliacao_pontos_positivos || ''}
                  onChange={(e) => setFormData({...formData, avaliacao_pontos_positivos: e.target.value})}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Desafios Enfrentados</Label>
                <Textarea 
                  placeholder="Principais dificuldades..."
                  value={formData.avaliacao_desafios || ''}
                  onChange={(e) => setFormData({...formData, avaliacao_desafios: e.target.value})}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Próximos Passos</Label>
                <Textarea 
                  placeholder="Planos para o próximo mês..."
                  value={formData.avaliacao_proximos_passos || ''}
                  onChange={(e) => setFormData({...formData, avaliacao_proximos_passos: e.target.value})}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}