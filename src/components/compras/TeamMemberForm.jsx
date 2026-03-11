import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { CARGOS_PLANO_TRABALHO } from '@/components/planoTrabalho';

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  email_pessoal: '',
  telefone: '',
  tipo_pessoa: 'PF',
  cpf: '',
  cnpj: '',
  funcao: '',
  budgetline_id: '',
  contrato_url: '',
  descricao_contrato: '',
  objeto_contrato: '',
  data_inicio_contrato: '',
  data_fim_contrato: '',
  valor_total: 0,
  numero_parcelas: 1,
  valor_parcela: 0,
  cronograma_parcelas: [],
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  pix_key: '',
};

export default function TeamMemberForm({ isOpen, onClose, onSuccess, editingMember, budgetLines = [] }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState(editingMember || EMPTY_FORM);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => setCurrentUser(user)).catch(() => setCurrentUser(null));
  }, []);

  const isEditingOwnData = editingMember && currentUser && editingMember.user_email === currentUser.email;

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list(),
    enabled: isOpen && !editingMember,
  });

  const { data: existingMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: isOpen && !editingMember,
  });

  const { data: termos = [] } = useQuery({
    queryKey: ['termos-compromisso'],
    queryFn: () => base44.entities.TermoCompromisso.list(),
    enabled: isOpen,
  });

  const availableUsers = users.filter(u => !existingMembers.some(m => m.user_email === u.email));

  const preencherFormComTermo = (userEmail) => {
    const termoDoUsuario = termos.find(t => t.contratado_email === userEmail);
    if (termoDoUsuario) {
      setForm(prev => ({
        ...prev,
        objeto_contrato: termoDoUsuario.objeto || prev.objeto_contrato,
        descricao_contrato: termoDoUsuario.escopo || prev.descricao_contrato,
        data_inicio_contrato: termoDoUsuario.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato: termoDoUsuario.data_fim || prev.data_fim_contrato,
        valor_total: termoDoUsuario.valor_total || prev.valor_total,
        numero_parcelas: (termoDoUsuario.parcelas?.length || 1) || prev.numero_parcelas,
        valor_parcela: termoDoUsuario.valor_total ? (termoDoUsuario.valor_total / (termoDoUsuario.parcelas?.length || 1)) : prev.valor_parcela,
        banco: termoDoUsuario.contratado_banco || prev.banco,
        agencia: termoDoUsuario.contratado_agencia || prev.agencia,
        conta: termoDoUsuario.contratado_conta || prev.conta,
        tipo_conta: termoDoUsuario.tipo_conta || prev.tipo_conta,
        pix_key: termoDoUsuario.pix_key || prev.pix_key,
      }));
    }
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleContratoUpload = async (file) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    const allowedExts = ['.pdf', '.doc', '.docx', '.txt'];
    
    if (!allowedTypes.includes(file.type) && !allowedExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast.error('Aceitos: PDF, DOC, DOCX ou TXT');
      return;
    }
    setAiLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const extracted = await base44.integrations.Core.InvokeLLM({
        model: 'gpt_5',
        prompt: `Analise este contrato e extraia TODOS os dados solicitados. Seja MUITO preciso e minucioso.

IMPORTANTE: Retorne OBRIGATORIAMENTE um JSON válido com TODOS os campos abaixo, mesmo que vazio (""):

{
  "valor_total": (número - valor total do contrato),
  "numero_parcelas": (número de parcelas),
  "valor_parcela": (valor de cada parcela),
  "nome": (nome completo do beneficiário/contratado),
  "funcao": (função, cargo ou objeto do serviço),
  "cpf": (CPF se pessoa física),
  "cnpj": (CNPJ se PJ/MEI/ME),
  "tipo_pessoa": ("PF", "MEI" ou "ME"),
  "data_inicio": (data YYYY-MM-DD de início de vigência),
  "data_fim": (data YYYY-MM-DD de término de vigência),
  "objeto_contrato": (descrição completa do objeto/escopo, 2-4 parágrafos),
  "descricao_contrato": (resumo geral incluindo partes, objeto, valores, prazos e condições, 3-5 parágrafos),
  "banco": (nome do banco),
  "agencia": (número da agência),
  "conta": (número da conta),
  "tipo_conta": ("Corrente" ou "Poupança"),
  "pix_key": (chave PIX se houver, senão ""),
  "cronograma_parcelas": [
    {"numero": 1, "vencimento": "YYYY-MM-DD", "valor": número, "descricao": "string"},
    ...
  ]
}`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            valor_total: { type: 'number' },
            numero_parcelas: { type: 'number' },
            valor_parcela: { type: 'number' },
            nome: { type: 'string' },
            funcao: { type: 'string' },
            cpf: { type: 'string' },
            cnpj: { type: 'string' },
            tipo_pessoa: { type: 'string' },
            data_inicio: { type: 'string' },
            data_fim: { type: 'string' },
            objeto_contrato: { type: 'string' },
            descricao_contrato: { type: 'string' },
            banco: { type: 'string' },
            agencia: { type: 'string' },
            conta: { type: 'string' },
            tipo_conta: { type: 'string' },
            pix_key: { type: 'string' },
            cronograma_parcelas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  numero: { type: 'number' },
                  vencimento: { type: 'string' },
                  valor: { type: 'number' },
                  descricao: { type: 'string' }
                }
              }
            }
          }
        }
      });

      console.log('Dados extraídos do contrato:', extracted);

      setForm(prev => ({
        ...prev,
        contrato_url: file_url,
        valor_total: Number(extracted?.valor_total) || 0,
        numero_parcelas: Number(extracted?.numero_parcelas) || 1,
        valor_parcela: Number(extracted?.valor_parcela) || (Number(extracted?.valor_total) / (Number(extracted?.numero_parcelas) || 1)) || 0,
        user_name: extracted?.nome || prev.user_name,
        funcao: extracted?.funcao || prev.funcao,
        cpf: extracted?.cpf || prev.cpf,
        cnpj: extracted?.cnpj || prev.cnpj,
        tipo_pessoa: extracted?.tipo_pessoa || prev.tipo_pessoa,
        data_inicio_contrato: extracted?.data_inicio || '',
        data_fim_contrato: extracted?.data_fim || '',
        objeto_contrato: extracted?.objeto_contrato || '',
        descricao_contrato: extracted?.descricao_contrato || '',
        banco: extracted?.banco || prev.banco,
        agencia: extracted?.agencia || prev.agencia,
        conta: extracted?.conta || prev.conta,
        tipo_conta: extracted?.tipo_conta || prev.tipo_conta,
        pix_key: extracted?.pix_key || prev.pix_key,
        cronograma_parcelas: Array.isArray(extracted?.cronograma_parcelas) ? extracted.cronograma_parcelas : [],
      }));

      toast.success('Contrato analisado com sucesso pela IA');
    } catch (error) {
      console.error('Erro na extração do contrato:', error);
      toast.error('Erro ao processar contrato: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...form,
        valor_parcela: form.valor_total / form.numero_parcelas,
        data_criacao: new Date().toISOString().split('T')[0],
        status: form.status || 'ATIVO',
      };
      
      let memberId;
      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, data);
        memberId = editingMember.id;
        toast.success('Membro atualizado');
      } else {
        const created = await base44.entities.TeamMember.create(data);
        memberId = created.id;
        toast.success('Membro adicionado à equipe');
      }

      // Se há contrato, criar Attachment vinculado
      if (form.contrato_url && memberId) {
        const fileName = `contrato_${form.user_name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        await base44.entities.Attachment.create({
          activity_id: memberId,
          file_name: fileName,
          file_type: 'application/pdf',
          file_url: form.contrato_url,
          description: `Contrato de ${form.user_name} - ${form.objeto_contrato?.substring(0, 50)}`,
        });
        toast.success('Contrato anexado ao membro');
      }

      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMember ? 'Editar Membro' : 'Adicionar Membro à Equipe'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Seleção / Identificação ── */}
          <Section title="Identificação">
            {!editingMember || isEditingOwnData ? (
              <div>
                <Label>Usuário da Plataforma *</Label>
                {editingMember && isEditingOwnData ? (
                  <Input value={form.user_email} disabled className="bg-gray-50" />
                ) : (
                  <Select
                    value={form.user_email}
                    onValueChange={v => {
                      const user = users.find(u => u.email === v);
                      setForm(prev => ({
                        ...prev,
                        user_email: v,
                        user_name: user?.full_name || '',
                        email_pessoal: user?.email_pessoal || '',
                        telefone: user?.telefone || '',
                        cpf: user?.cpf || '',
                        cnpj: user?.cnpj || '',
                        tipo_pessoa: user?.tipo_pessoa || 'PF',
                        banco: user?.banco || '',
                        agencia: user?.agencia || '',
                        conta: user?.conta || '',
                        tipo_conta: user?.tipo_conta || 'Corrente',
                        pix_key: user?.pix_key || '',
                      }));
                      preencherFormComTermo(v);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                    <SelectContent>
                      {availableUsers.map(u => (
                        <SelectItem key={u.id} value={u.email}>
                          {u.full_name} — {u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.user_name && <p className="text-xs text-gray-500 mt-1">{form.user_name}</p>}
              </div>
            ) : (
              <div>
                <Label>Email</Label>
                <Input value={form.user_email} disabled className="bg-gray-50" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email Pessoal</Label>
                <Input value={form.email_pessoal} onChange={e => set('email_pessoal', e.target.value)} placeholder="email@pessoal.com" />
              </div>
              <div>
                <Label>Telefone de Contato</Label>
                <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(31) 99999-9999" />
              </div>
            </div>

            <div>
              <Label>Função / Cargo (conforme Plano de Trabalho 3º Aditivo)</Label>
              <Select value={form.funcao} onValueChange={v => set('funcao', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                <SelectContent>
                  {CARGOS_PLANO_TRABALHO.map(cargo => (
                    <SelectItem key={cargo} value={cargo}>{cargo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de Pessoa *</Label>
              <Select value={form.tipo_pessoa} onValueChange={v => set('tipo_pessoa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="ME">ME (Microempresa)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {form.tipo_pessoa === 'PF' ? (
                <div className="col-span-2">
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>CPF (sócio/titular)</Label>
                    <Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>CNPJ</Label>
                    <Input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* ── Contrato ── */}
          <Section title="Contrato">
            <div>
              <Label>Contrato (PDF, DOC, DOCX ou TXT) *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {aiLoading ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <p className="text-sm text-indigo-600 font-medium">Analisando contrato com IA...</p>
                    <p className="text-xs text-gray-400">Extraindo valores, prazos, parcelas e dados do contratado</p>
                  </div>
                ) : form.contrato_url ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <Sparkles className="w-4 h-4" /> Contrato analisado pela IA
                    </span>
                    <button type="button" onClick={() => set('contrato_url', '')} className="text-red-500 hover:text-red-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Clique para enviar contrato</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX ou TXT — A IA preencherá os campos automaticamente</p>
                    <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => handleContratoUpload(e.target.files[0])} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            {form.objeto_contrato && (
              <div>
                <Label className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> Objeto do Contrato (gerado por IA)</Label>
                <Textarea value={form.objeto_contrato} onChange={e => set('objeto_contrato', e.target.value)} rows={3} className="text-sm" />
              </div>
            )}

            {form.descricao_contrato && (
              <div>
                <Label className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> Descrição Completa do Contrato (gerada por IA)</Label>
                <Textarea value={form.descricao_contrato} onChange={e => set('descricao_contrato', e.target.value)} rows={5} className="text-sm" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início</Label>
                <Input type="date" value={form.data_inicio_contrato} onChange={e => set('data_inicio_contrato', e.target.value)} />
              </div>
              <div>
                <Label>Data de Término</Label>
                <Input type="date" value={form.data_fim_contrato} onChange={e => set('data_fim_contrato', e.target.value)} />
              </div>
            </div>
          </Section>

          {/* ── Valores e Parcelas ── */}
          <Section title="Valores e Parcelas">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Valor Total (R$) *</Label>
                <Input
                  type="number"
                  value={form.valor_total}
                  onChange={e => setForm(prev => ({
                    ...prev,
                    valor_total: parseFloat(e.target.value) || 0,
                    valor_parcela: (parseFloat(e.target.value) || 0) / prev.numero_parcelas,
                  }))}
                  step="0.01" min="0"
                />
              </div>
              <div>
                <Label>Nº de Parcelas *</Label>
                <Input
                  type="number"
                  value={form.numero_parcelas}
                  onChange={e => setForm(prev => ({
                    ...prev,
                    numero_parcelas: parseInt(e.target.value) || 1,
                    valor_parcela: prev.valor_total / (parseInt(e.target.value) || 1),
                  }))}
                  min="1"
                />
              </div>
              <div>
                <Label>Valor por Parcela (R$)</Label>
                <Input value={form.valor_parcela ? form.valor_parcela.toFixed(2) : ''} disabled className="bg-gray-50" />
              </div>
            </div>

            {/* Cronograma extraído pela IA */}
            {form.cronograma_parcelas?.length > 0 && (
              <div>
                <Label className="flex items-center gap-1 mb-2"><Sparkles className="w-3 h-3 text-indigo-500" /> Cronograma de Parcelas (extraído pela IA)</Label>
                <div className="border rounded-lg overflow-hidden text-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">#</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vencimento</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Valor</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.cronograma_parcelas.map((p, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-600">{p.numero || i + 1}</td>
                          <td className="px-3 py-2">{p.vencimento || '—'}</td>
                          <td className="px-3 py-2 font-medium">R$ {p.valor?.toFixed(2) || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{p.descricao || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {/* ── Rubrica ── */}
          {budgetLines.length > 0 && (
            <Section title="Rubrica Orçamentária">
              <Select value={form.budgetline_id || ''} onValueChange={v => set('budgetline_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a rubrica" /></SelectTrigger>
                <SelectContent>
                  {budgetLines.map(bl => (
                    <SelectItem key={bl.id} value={bl.id}>
                      {bl.codigo} — {bl.descricao?.substring(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Section>
          )}

          {/* ── Dados Bancários ── */}
          <Section title="Dados Bancários">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banco</Label>
                <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex: Caixa Econômica" />
              </div>
              <div>
                <Label>Agência</Label>
                <Input value={form.agencia} onChange={e => set('agencia', e.target.value)} placeholder="Ex: 0001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Conta</Label>
                <Input value={form.conta} onChange={e => set('conta', e.target.value)} placeholder="Número da conta" />
              </div>
              <div>
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo_conta} onValueChange={v => set('tipo_conta', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corrente">Corrente</SelectItem>
                    <SelectItem value="Poupança">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Chave PIX (opcional)</Label>
              <Input value={form.pix_key} onChange={e => set('pix_key', e.target.value)} placeholder="CPF, Email, Telefone ou Aleatória" />
            </div>
          </Section>

          {/* ── Ações ── */}
          <div className="flex gap-2 justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            {!form.contrato_url && (
              <label className="cursor-pointer">
                <Button type="button" variant="outline" className="cursor-pointer" disabled={aiLoading}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {aiLoading ? 'Processando...' : 'Preencher Automaticamente'}
                </Button>
                <input 
                  type="file" 
                  accept=".pdf,.doc,.docx,.txt" 
                  onChange={e => handleContratoUpload(e.target.files[0])} 
                  className="hidden" 
                  disabled={aiLoading}
                />
              </label>
            )}
            <Button type="submit" className="bg-black hover:bg-gray-800" disabled={loading || aiLoading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-black border-b pb-1.5">{title}</h3>
      {children}
    </div>
  );
}