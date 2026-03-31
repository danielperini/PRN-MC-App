import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Paperclip, FileCheck } from 'lucide-react';
import { toast } from 'sonner';

const CARGOS_FUNCOES = [
  'Educador',
  'Educador(a)',
  'Produtor(a)',
  'Assistente de Produção',
  'Coordenador(a)',
  'Coordenador(a) de Produção',
  'Coordenador(a) Administrativo(a)',
  'Coordenador(a) de Comunicação',
  'Consultoria de Programação',
  'Comunicador(a)',
  'Designer',
  'Fotógrafo(a)',
  'Videomaker',
  'Arte-educador(a)',
  'Mediador(a)',
  'Oficineiro(a)',
  'Curador(a)',
  'Pesquisador(a)',
  'Assistente',
  'Auxiliar',
  'Prestador(a) de Serviço',
  'Outro',
];

function normalizeBudgetLineId(value) {
  return String(value || '').trim();
}

function getBudgetLineLabel(budgetLine) {
  if (!budgetLine) return 'Rubrica';

  const codigo = String(budgetLine.codigo || '').trim();
  const descricao = String(
    budgetLine.descricao || budgetLine.nome || budgetLine.name || ''
  ).trim();

  if (codigo && descricao) return `${codigo} — ${descricao}`;
  return codigo || descricao || 'Rubrica';
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember = null,
  budgetLines = [],
}) {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState('select');
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [contractUrl, setContractUrl] = useState('');

  const [form, setForm] = useState({
    user_email: '',
    user_name: '',
    funcao: '',
    role: '',
    budgetline_id: '',
    parcelas: '',
    numero_parcelas: '',
    valor_parcela: '',
    valor_total: '',
    data_inicio_contrato: '',
    data_fim_contrato: '',
    telefone: '',
    status: 'ATIVO',
  });

  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSelectedUser('');
      setSaving(false);
      setContractUrl('');
      setForm({
        user_email: '',
        user_name: '',
        funcao: '',
        role: '',
        budgetline_id: '',
        parcelas: '',
        numero_parcelas: '',
        valor_parcela: '',
        valor_total: '',
        data_inicio_contrato: '',
        data_fim_contrato: '',
        telefone: '',
        status: 'ATIVO',
      });
      return;
    }

    if (editingMember) {
      setMode('form');
      setContractUrl(editingMember?.contrato_url || '');
      setForm({
        user_email: editingMember?.user_email || '',
        user_name: editingMember?.user_name || editingMember?.nome || '',
        funcao: editingMember?.funcao || editingMember?.role || '',
        role: editingMember?.role || editingMember?.funcao || '',
        budgetline_id: editingMember?.budgetline_id || editingMember?.budget_line_id || '',
        parcelas: editingMember?.parcelas || editingMember?.numero_parcelas || '',
        numero_parcelas: editingMember?.numero_parcelas || editingMember?.parcelas || '',
        valor_parcela: editingMember?.valor_parcela || '',
        valor_total: editingMember?.valor_total || '',
        data_inicio_contrato: editingMember?.data_inicio_contrato || '',
        data_fim_contrato: editingMember?.data_fim_contrato || '',
        telefone: editingMember?.telefone || '',
        status: editingMember?.status || 'ATIVO',
      });
    }
  }, [isOpen, editingMember]);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: async () => {
      const res = await base44.entities.User.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const { data: teamMembers = [], isLoading: loadingTeamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const { data: budgetLinesFromDB = [], isLoading: loadingBudgetLines } = useQuery({
    queryKey: ['team-member-form-budget-lines'],
    queryFn: async () => {
      const res = await base44.entities.BudgetLine.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen && (!Array.isArray(budgetLines) || budgetLines.length === 0),
  });

  const availableUsers = useMemo(() => {
    const existingEmails = new Set(
      teamMembers
        .map((m) => String(m?.user_email || '').trim().toLowerCase())
        .filter(Boolean)
    );

    return users.filter((u) => {
      const email = String(u?.email || '').trim().toLowerCase();
      return email && !existingEmails.has(email);
    });
  }, [users, teamMembers]);

  const finalBudgetLines = useMemo(() => {
    const source =
      Array.isArray(budgetLines) && budgetLines.length > 0
        ? budgetLines
        : Array.isArray(budgetLinesFromDB)
          ? budgetLinesFromDB
          : [];

    const filtradas3Aditivo = source.filter((b) =>
      String(b?.codigo || '').startsWith('MC3A')
    );

    return filtradas3Aditivo.length > 0 ? filtradas3Aditivo : source;
  }, [budgetLines, budgetLinesFromDB]);

  const loadingSelectData = loadingUsers || loadingTeamMembers;

  const handleSelectUser = () => {
    const user = availableUsers.find(
      (u) =>
        String(u?.email || '').trim().toLowerCase() ===
        String(selectedUser || '').trim().toLowerCase()
    );

    if (!user) {
      toast.error('Selecione um usuário válido.');
      return;
    }

    setForm({
      user_email: user.email || '',
      user_name: user.name || user.full_name || user.email || '',
      funcao: '',
      role: '',
      budgetline_id: '',
      parcelas: '',
      numero_parcelas: '',
      valor_parcela: '',
      valor_total: '',
      telefone: user.phone || user.telefone || '',
      status: 'ATIVO',
    });

    setMode('form');
  };

  const handleContractUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContract(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setContractUrl(file_url);

      // Build rubrica context for AI
      const rubricasContext = finalBudgetLines.map(b => `ID: ${b.id} | ${getBudgetLineLabel(b)}`).join('\n');
      const cargo = form.funcao || form.role || 'profissional';

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Leia o contrato PDF anexado e extraia as seguintes informações:\n- numero_parcelas (inteiro)\n- valor_parcela (número)\n- valor_total (número)\n- data_inicio (formato YYYY-MM-DD)\n- data_fim (formato YYYY-MM-DD)\n- rubrica_id_sugerida: escolha o ID mais adequado dentre as rubricas abaixo para o cargo "${cargo}":\n${rubricasContext}\n\nSe não encontrar algum campo, retorne null.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            numero_parcelas: { type: 'number' },
            valor_parcela: { type: 'number' },
            valor_total: { type: 'number' },
            data_inicio: { type: 'string' },
            data_fim: { type: 'string' },
            rubrica_id_sugerida: { type: 'string' },
            observacao: { type: 'string' },
          },
        },
      });

      setForm(prev => ({
        ...prev,
        numero_parcelas: result?.numero_parcelas ? String(result.numero_parcelas) : prev.numero_parcelas,
        parcelas: result?.numero_parcelas ? String(result.numero_parcelas) : prev.parcelas,
        valor_parcela: result?.valor_parcela ? String(result.valor_parcela) : prev.valor_parcela,
        valor_total: result?.valor_total ? String(result.valor_total) : prev.valor_total,
        data_inicio_contrato: result?.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato: result?.data_fim || prev.data_fim_contrato,
        budgetline_id: result?.rubrica_id_sugerida || prev.budgetline_id,
      }));

      toast.success(result?.observacao || 'Contrato lido — dados preenchidos automaticamente pela IA.');
    } catch (err) {
      toast.error('Erro ao processar contrato: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setUploadingContract(false);
      e.target.value = '';
    }
  };

  const handleSuggestFromAI = async () => {
    setLoadingAI(true);
    try {
      const docs = await base44.entities.KnowledgeDocument.filter({ categoria: 'Plano de Trabalho', ativo: true });
      if (!docs || docs.length === 0) {
        toast.error('Nenhum Plano de Trabalho encontrado na base de conhecimento.');
        return;
      }
      const conteudo = docs.map(d => d.conteudo_extraido || d.descricao || d.titulo).filter(Boolean).join('\n\n---\n\n');
      const cargo = form.funcao || form.role || 'profissional';
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Com base no Plano de Trabalho abaixo, extraia o número de parcelas e o valor de cada parcela para o cargo "${cargo}".

PLANO DE TRABALHO:
${conteudo}

Responda SOMENTE com os dados extraídos.`,
        response_json_schema: {
          type: 'object',
          properties: {
            numero_parcelas: { type: 'number' },
            valor_parcela: { type: 'number' },
            valor_total: { type: 'number' },
            observacao: { type: 'string' },
          },
        },
      });
      if (result?.numero_parcelas || result?.valor_parcela) {
        setForm(prev => ({
          ...prev,
          numero_parcelas: String(result.numero_parcelas ?? prev.numero_parcelas),
          parcelas: String(result.numero_parcelas ?? prev.parcelas),
          valor_parcela: String(result.valor_parcela ?? prev.valor_parcela),
          valor_total: String(result.valor_total ?? prev.valor_total),
        }));
        toast.success(result.observacao || 'Valores sugeridos pela IA com base no Plano de Trabalho.');
      } else {
        toast.error('A IA não encontrou valores para esse cargo no Plano de Trabalho.');
      }
    } catch (e) {
      toast.error('Erro ao consultar IA: ' + (e?.message || 'Tente novamente.'));
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;

    if (!String(form.user_email || '').trim()) {
      toast.error('Usuário inválido.');
      return;
    }

    if (!String(form.user_name || '').trim()) {
      toast.error('Preencha o nome.');
      return;
    }

    if (!String(form.funcao || form.role || '').trim()) {
      toast.error('Selecione o cargo / função.');
      return;
    }

    if (!normalizeBudgetLineId(form.budgetline_id)) {
      toast.error('Selecione a rubrica.');
      return;
    }

    setSaving(true);

    try {
      const numeroParcelas = toNumberOrZero(
        form.numero_parcelas || form.parcelas
      );
      const valorParcela = toNumberOrZero(form.valor_parcela);
      const valorTotal = toNumberOrZero(form.valor_total);

      const payload = {
        user_email: String(form.user_email || '').trim(),
        user_name: String(form.user_name || '').trim(),
        funcao: String(form.funcao || form.role || '').trim(),
        role: String(form.funcao || form.role || '').trim(),
        budgetline_id: normalizeBudgetLineId(form.budgetline_id),
        budget_line_id: normalizeBudgetLineId(form.budgetline_id),
        telefone: String(form.telefone || '').trim(),
        numero_parcelas: numeroParcelas,
        parcelas: numeroParcelas,
        valor_parcela: valorParcela,
        valor_total: valorTotal,
        data_inicio_contrato: form.data_inicio_contrato || undefined,
        data_fim_contrato: form.data_fim_contrato || undefined,
        status: String(form.status || 'ATIVO').trim() || 'ATIVO',
        ...(contractUrl ? { contrato_url: contractUrl } : {}),
      };

      let result;
      if (editingMember?.id) {
        result = await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        result = await base44.entities.TeamMember.create(payload);
      }

      if (!result || !result.id) {
        throw new Error('Erro ao salvar membro.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members-all'] }),
        queryClient.invalidateQueries({ queryKey: ['users-all'] }),
      ]);

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['team-members'] }),
        queryClient.refetchQueries({ queryKey: ['users-all'] }),
      ]);

      if (editingMember?.id) {
        toast.success(`✅ Equipe atualizada com sucesso — ${String(form.user_name || '').trim()}`);
      } else {
        toast.success(`✅ Novo membro adicionado — ${String(form.user_name || '').trim()}`);
      }

      if (typeof onSuccess === 'function') {
        await onSuccess(result);
      }

      onClose?.();
    } catch (error) {
      console.error('Erro ao salvar TeamMember:', error);
      toast.error(`❌ Erro ao salvar: ${error?.message || 'Tente novamente.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingMember ? 'Editar equipe' : 'Adicionar membro'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'select' && !editingMember && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar usuário</Label>
              <Select
                value={selectedUser}
                onValueChange={setSelectedUser}
                disabled={loadingSelectData || saving}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSelectData
                        ? 'Carregando usuários...'
                        : availableUsers.length === 0
                          ? 'Nenhum usuário disponível'
                          : 'Selecione um usuário'
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {availableUsers.length > 0 ? (
                    availableUsers.map((user) => (
                      <SelectItem
                        key={user.id || user.email}
                        value={user.email}
                      >
                        {(user.name || user.full_name || user.email)} — Transformar em membro
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty__" disabled>
                      Nenhum usuário disponível para inclusão
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onClose?.()}
                disabled={saving}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleSelectUser}
                disabled={!selectedUser || selectedUser === '__empty__' || saving}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {mode === 'form' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.user_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, user_name: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Cargo / Função</Label>
              <Select
                value={String(form.funcao || form.role || '')}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    funcao: value,
                    role: value,
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo / função" />
                </SelectTrigger>

                <SelectContent>
                  {CARGOS_FUNCOES.map((cargo) => (
                    <SelectItem key={cargo} value={cargo}>
                      {cargo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rubrica</Label>
              <Select
                value={normalizeBudgetLineId(form.budgetline_id)}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    budgetline_id: value,
                  }))
                }
                disabled={saving || loadingBudgetLines}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingBudgetLines
                        ? 'Carregando rubricas...'
                        : 'Selecione a rubrica'
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {finalBudgetLines.length > 0 ? (
                    finalBudgetLines.map((budgetLine) => (
                      <SelectItem
                        key={budgetLine.id}
                        value={String(budgetLine.id)}
                      >
                        {getBudgetLineLabel(budgetLine)}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__sem_rubrica__" disabled>
                      Nenhuma rubrica disponível
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Contrato</Label>
              <div className="flex items-center gap-2">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors ${
                  uploadingContract ? 'opacity-50 pointer-events-none' : 'hover:bg-slate-50'
                }`}>
                  {uploadingContract ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Lendo contrato...</>
                  ) : contractUrl ? (
                    <><FileCheck className="w-4 h-4 text-green-600" /> Contrato anexado</>
                  ) : (
                    <><Paperclip className="w-4 h-4" /> Anexar contrato (PDF)</>  
                  )}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleContractUpload}
                    disabled={saving || uploadingContract}
                  />
                </label>
                {contractUrl && (
                  <a href={contractUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver</a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data início do contrato</Label>
                <Input
                  type="date"
                  value={form.data_inicio_contrato || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, data_inicio_contrato: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Data fim do contrato</Label>
                <Input
                  type="date"
                  value={form.data_fim_contrato || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, data_fim_contrato: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, telefone: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Número de parcelas e valor</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestFromAI}
                  disabled={saving || loadingAI}
                  className="h-7 text-xs gap-1"
                >
                  {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Sugerir via IA
                </Button>
              </div>
              <Input
                type="number"
                placeholder="Número de parcelas"
                value={form.numero_parcelas || form.parcelas || ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    numero_parcelas: e.target.value,
                    parcelas: e.target.value,
                  }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor da parcela</Label>
              <Input
                type="number"
                value={form.valor_parcela || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valor_parcela: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor total</Label>
              <Input
                type="number"
                value={form.valor_total || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valor_total: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!editingMember) {
                    setMode('select');
                  } else {
                    onClose?.();
                  }
                }}
                disabled={saving}
              >
                {editingMember ? 'Cancelar' : 'Voltar'}
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}