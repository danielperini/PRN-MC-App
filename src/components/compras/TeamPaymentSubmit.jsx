import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Upload,
  FileCheck,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const STATUS_COLORS = {
  RASCUNHO: 'bg-gray-100 text-gray-700',
  AGUARDANDO_APROVACAO: 'bg-blue-100 text-blue-700',
  EM_ANALISE_COORD: 'bg-yellow-100 text-yellow-700',
  DEVOLVIDO_REVISAO: 'bg-orange-100 text-orange-700',
  REVISAO: 'bg-orange-100 text-orange-700',
  APROVADO_COORD: 'bg-green-100 text-green-700',
  APROVADO: 'bg-green-100 text-green-700',
  ENCAMINHADO_COORD_ADMIN: 'bg-purple-100 text-purple-700',
  PAGO: 'bg-emerald-100 text-emerald-700',
  RECUSADO: 'bg-red-100 text-red-700',
  FINALIZADO: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  EM_ANALISE_COORD: 'Em Análise',
  DEVOLVIDO_REVISAO: 'Devolvido para Revisão',
  REVISAO: 'Em Revisão',
  APROVADO_COORD: 'Aprovado pelo Coord.',
  APROVADO: 'Aprovado',
  ENCAMINHADO_COORD_ADMIN: 'Encaminhado Adm.',
  PAGO: 'Pago',
  RECUSADO: 'Recusado',
  FINALIZADO: 'Finalizado',
};

function ChecklistItem({ ok, label }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
        ok
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1">
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {ok ? 'OK' : 'Pendente'}
      </span>
    </div>
  );
}

function isCoordinatorRole(role) {
  return [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO',
  ].includes(role);
}

export default function TeamPaymentSubmit({ userEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractingNF, setExtractingNF] = useState(false);
  const [extractingXLSX, setExtractingXLSX] = useState(false);
  const [uploadingXML, setUploadingXML] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [form, setForm] = useState({
    mes_referencia: '',
    ano: new Date().getFullYear(),
    numero_nf: '',
    valor_nf: 0,
    nota_fiscal_url: '',
    xml_url: '',
    xlsx_url: '',
  });
  const [extractedNF, setExtractedNF] = useState(null);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me-team-payment-submit'],
    queryFn: () => base44.auth.me(),
  });

  const isCoordinator = isCoordinatorRole(currentUser?.role);

  const { data: ownTeamMember } = useQuery({
    queryKey: ['team-member-own', userEmail],
    queryFn: async () => {
      const data = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return data?.[0] || null;
    },
    enabled: !!userEmail,
  });

  const { data: allTeamMembers = [] } = useQuery({
    queryKey: ['team-members-all-for-coordinator'],
    queryFn: () => base44.entities.TeamMember.list('-created_date', 500),
    enabled: isCoordinator,
  });

  const accessibleMembers = useMemo(() => {
    if (isCoordinator) {
      return Array.isArray(allTeamMembers) ? allTeamMembers : [];
    }
    return ownTeamMember ? [ownTeamMember] : [];
  }, [isCoordinator, allTeamMembers, ownTeamMember]);

  useEffect(() => {
    if (!accessibleMembers.length) {
      setSelectedMemberId('');
      return;
    }

    const exists = accessibleMembers.some((m) => m?.id === selectedMemberId);
    if (!exists) {
      const own =
        accessibleMembers.find((m) => (m?.user_email || '').toLowerCase() === String(userEmail || '').toLowerCase()) ||
        accessibleMembers[0];
      setSelectedMemberId(own?.id || '');
    }
  }, [accessibleMembers, selectedMemberId, userEmail]);

  const selectedTeamMember = useMemo(() => {
    return accessibleMembers.find((m) => m?.id === selectedMemberId) || null;
  }, [accessibleMembers, selectedMemberId]);

  const effectiveUserEmail = selectedTeamMember?.user_email || userEmail || '';

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments', effectiveUserEmail],
    queryFn: () => base44.entities.TeamPayment.filter({ user_email: effectiveUserEmail }, '-created_date', 50),
    enabled: !!effectiveUserEmail,
  });

  const { data: monthReport, isLoading: loadingReport } = useQuery({
    queryKey: ['report-month-check', effectiveUserEmail, form.mes_referencia, form.ano],
    queryFn: async () => {
      if (!form.mes_referencia || !effectiveUserEmail) return null;
      const reports = await base44.entities.Report.filter({
        created_by: effectiveUserEmail,
        mes_referencia: form.mes_referencia,
        ano: form.ano,
      });
      return reports?.[0] || null;
    },
    enabled: !!form.mes_referencia && showForm && !!effectiveUserEmail,
  });

  const reportApproved = monthReport?.status === 'APPROVED';
  const contractUrl = selectedTeamMember?.contract_url || selectedTeamMember?.contrato_url || '';

  const checklistAtual = useMemo(() => {
    return {
      contrato: !!contractUrl,
      nfPdf: !!form.nota_fiscal_url,
      nfXml: !!form.xml_url,
    };
  }, [contractUrl, form.nota_fiscal_url, form.xml_url]);

  const resetForm = () => {
    setForm({
      mes_referencia: '',
      ano: new Date().getFullYear(),
      numero_nf: '',
      valor_nf: 0,
      nota_fiscal_url: '',
      xml_url: '',
      xlsx_url: '',
    });
    setExtractedNF(null);
  };

  const handleUploadNF = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, nota_fiscal_url: file_url }));
      toast.success('Nota fiscal anexada — extraindo dados com IA...');

      setExtractingNF(true);
      try {
        const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: 'object',
            properties: {
              numero: { type: 'string', description: 'Número da nota fiscal' },
              serie: { type: 'string', description: 'Série da nota fiscal' },
              valor_total: { type: 'number', description: 'Valor total da nota fiscal' },
              cnpj_emitente: { type: 'string', description: 'CNPJ do emitente' },
              razao_social: { type: 'string', description: 'Razão social do emitente' },
              data_emissao: { type: 'string', description: 'Data de emissão no formato DD/MM/YYYY' },
              competencia: { type: 'string', description: 'Mês/ano de competência identificado' },
            },
          },
        });

        if (extracted?.status === 'success' && extracted.output) {
          const data = extracted.output;
          setExtractedNF(data);
          setForm((prev) => ({
            ...prev,
            numero_nf: data.numero || prev.numero_nf,
            valor_nf: data.valor_total || prev.valor_nf,
          }));
          toast.success('Dados extraídos automaticamente da nota fiscal!');
        }
      } catch {
      } finally {
        setExtractingNF(false);
      }
    } catch (error) {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadXML = async (file) => {
    if (!file) return;
    setUploadingXML(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, xml_url: file_url }));
      toast.success('XML da nota fiscal anexado com sucesso');
    } catch (error) {
      toast.error('Erro ao enviar XML: ' + error.message);
    } finally {
      setUploadingXML(false);
    }
  };

  const handleUploadXLSX = async (file) => {
    if (!file) return;
    setExtractingXLSX(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, xlsx_url: file_url }));
      toast.success('Planilha XLSX anexada com sucesso');
    } catch (error) {
      toast.error('Erro ao enviar planilha: ' + error.message);
    } finally {
      setExtractingXLSX(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedTeamMember) {
      toast.error('Nenhum membro de equipe selecionado.');
      return;
    }

    if (!effectiveUserEmail) {
      toast.error('O membro selecionado não possui e-mail vinculado.');
      return;
    }

    if (!reportApproved) {
      toast.error('O relatório do mês precisa estar aprovado pelo coordenador antes do envio financeiro.');
      return;
    }

    if (!checklistAtual.contrato || !checklistAtual.nfPdf || !checklistAtual.nfXml) {
      toast.error('Checklist incompleto. É obrigatório ter contrato, NF em PDF e XML.');
      return;
    }

    setLoading(true);
    try {
      const existing = payments.find(
        (p) =>
          p.mes_referencia === form.mes_referencia &&
          p.ano === form.ano &&
          !['RECUSADO', 'DEVOLVIDO_REVISAO'].includes(p.status)
      );

      if (existing) {
        toast.error('Já existe um envio em andamento para este mês.');
        setLoading(false);
        return;
      }

      await base44.entities.TeamPayment.create({
        team_member_id: selectedTeamMember.id,
        user_email: effectiveUserEmail,
        report_id: monthReport?.id || null,
        mes_referencia: form.mes_referencia,
        ano: form.ano,
        numero_nf: form.numero_nf,
        valor_nf: form.valor_nf,
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url || null,
        xlsx_url: form.xlsx_url || null,
        contract_url: contractUrl || null,
        numero_parcela: (selectedTeamMember.parcelas_pagas || 0) + 1,
        status: 'AGUARDANDO_APROVACAO',
        nf_numero_extraido: extractedNF?.numero || null,
        nf_valor_extraido: extractedNF?.valor_total || null,
        nf_cnpj_emitente: extractedNF?.cnpj_emitente || null,
        nf_razao_social: extractedNF?.razao_social || null,
        nf_data_emissao: extractedNF?.data_emissao || null,
        nf_competencia: extractedNF?.competencia || null,
      });

      try {
        await base44.functions.invoke('notifyTeamPaymentSubmitted', {
          team_member_name: selectedTeamMember.user_name || selectedTeamMember.nome || effectiveUserEmail,
          mes: form.mes_referencia,
          ano: form.ano,
          valor: form.valor_nf,
          user_email: effectiveUserEmail,
        });
      } catch {}

      toast.success('Documentos enviados para aprovação do coordenador!');
      resetForm();
      setShowForm(false);
      queryClient.invalidateQueries(['team-payments']);
    } catch (error) {
      toast.error('Erro ao enviar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isCoordinator && !ownTeamMember) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        Você não está cadastrado como membro da equipe financeira. Contate o coordenador.
      </div>
    );
  }

  if (!selectedTeamMember) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        Nenhum perfil de equipe disponível para exibição.
      </div>
    );
  }

  const currentParcel = (selectedTeamMember.parcelas_pagas || 0) + 1;
  const totalParcels = selectedTeamMember.numero_parcelas || 0;
  const memberName = selectedTeamMember.user_name || selectedTeamMember.nome || effectiveUserEmail;

  return (
    <div className="space-y-6">
      {isCoordinator && accessibleMembers.length > 0 && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <Label className="mb-2 block">Perfil da equipe</Label>
          <Select
            value={selectedMemberId}
            onValueChange={(value) => {
              setSelectedMemberId(value);
              resetForm();
              setShowForm(false);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um perfil" />
            </SelectTrigger>
            <SelectContent>
              {accessibleMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.user_name || member.nome || member.user_email}
                  {member.funcao ? ` • ${member.funcao}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-black">
            {isCoordinator ? `Documentos Financeiros — ${memberName}` : 'Meus Documentos Financeiros'}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Parcela {currentParcel} de {totalParcels}
            {selectedTeamMember.funcao && ` • ${selectedTeamMember.funcao}`}
          </p>
        </div>
        <Button className="bg-black hover:bg-gray-800" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Envio Mensal
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-black">Histórico de Envios</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
            Nenhum envio registrado ainda
          </p>
        ) : (
          payments.map((payment) => {
            const paymentChecklist = {
              contrato: !!(payment.contract_url || contractUrl),
              nfPdf: !!payment.nota_fiscal_url,
              nfXml: !!payment.xml_url,
            };

            return (
              <div key={payment.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm text-black">
                      {payment.mes_referencia} / {payment.ano}
                    </p>
                    {payment.numero_nf && <p className="text-xs text-gray-500">NF: {payment.numero_nf}</p>}
                    {payment.valor_nf > 0 && (
                      <p className="text-sm font-bold text-black mt-1">
                        R$ {payment.valor_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <Badge className={STATUS_COLORS[payment.status] || STATUS_COLORS.RASCUNHO}>
                    {STATUS_LABELS[payment.status] || payment.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                  <ChecklistItem ok={paymentChecklist.contrato} label="Contrato" />
                  <ChecklistItem ok={paymentChecklist.nfPdf} label="NF PDF" />
                  <ChecklistItem ok={paymentChecklist.nfXml} label="NF XML" />
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  {(payment.contract_url || contractUrl) && (
                    <a href={payment.contract_url || contractUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700">
                        <FileCheck className="w-3 h-3 mr-1" />
                        Contrato
                      </Button>
                    </a>
                  )}
                  {payment.nota_fiscal_url && (
                    <a href={payment.nota_fiscal_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        PDF NF
                      </Button>
                    </a>
                  )}
                  {payment.xml_url && (
                    <a href={payment.xml_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        XML NF
                      </Button>
                    </a>
                  )}
                  {payment.xlsx_url && (
                    <a href={payment.xlsx_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Planilha
                      </Button>
                    </a>
                  )}
                </div>

                {(payment.observacoes || payment.aprov_coord_comentario) && (
                  <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 p-2 rounded-lg mt-2 italic">
                    💬 Observação do coordenador: {payment.observacoes || payment.aprov_coord_comentario}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Envio Mensal — {memberName} — Parcela {currentParcel}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isCoordinator && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                Você está operando este envio como coordenador para o perfil de <strong>{memberName}</strong>.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês de Referência *</Label>
                <Select value={form.mes_referencia} onValueChange={(v) => setForm({ ...form, mes_referencia: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano *</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm({ ...form, ano: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                  min={2026}
                />
              </div>
            </div>

            {form.mes_referencia && (
              <div
                className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
                  loadingReport
                    ? 'bg-gray-50 border-gray-200 text-gray-500'
                    : reportApproved
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {loadingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />
                ) : reportApproved ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>
                  {loadingReport
                    ? 'Verificando relatório do mês...'
                    : reportApproved
                      ? `Relatório de ${form.mes_referencia}/${form.ano} aprovado ✓ Pode prosseguir com o envio.`
                      : `O relatório de ${form.mes_referencia}/${form.ano} ${!monthReport ? 'não foi encontrado' : 'ainda não está aprovado'}. O envio financeiro só é permitido após aprovação do relatório mensal pelo coordenador.`}
                </span>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700">
                Checklist obrigatório para envio
              </div>
              <div className="grid grid-cols-1 gap-2">
                <ChecklistItem ok={checklistAtual.contrato} label="Contrato" />
                <ChecklistItem ok={checklistAtual.nfPdf} label="NF PDF" />
                <ChecklistItem ok={checklistAtual.nfXml} label="NF XML" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número da NF</Label>
                <Input
                  value={form.numero_nf}
                  onChange={(e) => setForm({ ...form, numero_nf: e.target.value })}
                  placeholder="Ex: 001234"
                />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  value={form.valor_nf}
                  onChange={(e) => setForm({ ...form, valor_nf: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Nota Fiscal em PDF *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
                {form.nota_fiscal_url ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <FileCheck className="w-5 h-5" />
                      <span className="text-sm font-medium">PDF enviado com sucesso</span>
                    </div>
                    {extractingNF && (
                      <div className="flex items-center justify-center gap-2 text-blue-600 text-xs">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        Extraindo dados com IA...
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {loading ? (
                      <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">{loading ? 'Enviando...' : 'Clique para enviar PDF da NF'}</p>
                    <p className="text-xs text-gray-400 mt-1">Dados serão extraídos automaticamente com IA</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleUploadNF(e.target.files[0])}
                      className="hidden"
                      disabled={loading}
                    />
                  </label>
                )}
              </div>
            </div>

            <div>
              <Label>XML da Nota Fiscal *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
                {form.xml_url ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileCheck className="w-5 h-5" />
                    <span className="text-sm font-medium">XML enviado com sucesso</span>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {uploadingXML ? (
                      <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">{uploadingXML ? 'Enviando...' : 'Clique para enviar XML da NF'}</p>
                    <p className="text-xs text-gray-400 mt-1">Arquivo .xml da mesma nota fiscal enviada em PDF</p>
                    <input
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      onChange={(e) => handleUploadXML(e.target.files[0])}
                      className="hidden"
                      disabled={uploadingXML}
                    />
                  </label>
                )}
              </div>
            </div>

            {extractedNF && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-xs mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Dados extraídos automaticamente via IA
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  {extractedNF.razao_social && (
                    <span>
                      <span className="text-blue-500">Emitente:</span> {extractedNF.razao_social}
                    </span>
                  )}
                  {extractedNF.valor_total && (
                    <span>
                      <span className="text-blue-500">Valor:</span> R$ {extractedNF.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {extractedNF.data_emissao && (
                    <span>
                      <span className="text-blue-500">Emissão:</span> {extractedNF.data_emissao}
                    </span>
                  )}
                  {extractedNF.competencia && (
                    <span>
                      <span className="text-blue-500">Competência:</span> {extractedNF.competencia}
                    </span>
                  )}
                  {extractedNF.cnpj_emitente && (
                    <span>
                      <span className="text-blue-500">CNPJ:</span> {extractedNF.cnpj_emitente}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label>
                Planilha XLSX <span className="text-gray-400 font-normal">(opcional)</span>
              </Label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 text-center">
                {form.xlsx_url ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileCheck className="w-4 h-4" />
                    <span className="text-sm">Planilha enviada</span>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {extractingXLSX ? (
                      <Loader2 className="w-6 h-6 text-gray-400 mx-auto mb-1 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    )}
                    <p className="text-xs text-gray-500">{extractingXLSX ? 'Enviando...' : 'Clique para enviar planilha XLSX'}</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleUploadXLSX(e.target.files[0])}
                      className="hidden"
                      disabled={extractingXLSX}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-black hover:bg-gray-800"
                disabled={
                  loading ||
                  !form.nota_fiscal_url ||
                  !form.xml_url ||
                  !reportApproved ||
                  loadingReport ||
                  !checklistAtual.contrato
                }
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar para Aprovação
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}      <span className="flex items-center gap-1">
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {ok ? 'OK' : 'Pendente'}
      </span>
    </div>
  );
}

export default function TeamPaymentSubmit({ userEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractingNF, setExtractingNF] = useState(false);
  const [extractingXLSX, setExtractingXLSX] = useState(false);
  const [uploadingXML, setUploadingXML] = useState(false);
  const [form, setForm] = useState({
    mes_referencia: '',
    ano: new Date().getFullYear(),
    numero_nf: '',
    valor_nf: 0,
    nota_fiscal_url: '',
    xml_url: '',
    xlsx_url: '',
  });
  const [extractedNF, setExtractedNF] = useState(null);
  const queryClient = useQueryClient();

  const { data: teamMember } = useQuery({
    queryKey: ['team-member', userEmail],
    queryFn: () => base44.entities.TeamMember.filter({ user_email: userEmail }),
    select: data => data?.[0],
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments', userEmail],
    queryFn: () => base44.entities.TeamPayment.filter({ user_email: userEmail }, '-created_date', 50),
  });

  const { data: monthReport, isLoading: loadingReport } = useQuery({
    queryKey: ['report-month-check', userEmail, form.mes_referencia, form.ano],
    queryFn: async () => {
      if (!form.mes_referencia) return null;
      const reports = await base44.entities.Report.filter({
        created_by: userEmail,
        mes_referencia: form.mes_referencia,
        ano: form.ano,
      });
      return reports?.[0] || null;
    },
    enabled: !!form.mes_referencia && showForm,
  });

  const reportApproved = monthReport?.status === 'APPROVED';

  const contractUrl = teamMember?.contract_url || teamMember?.contrato_url || '';

  const checklistAtual = useMemo(() => {
    return {
      contrato: !!contractUrl,
      nfPdf: !!form.nota_fiscal_url,
      nfXml: !!form.xml_url,
    };
  }, [contractUrl, form.nota_fiscal_url, form.xml_url]);

  const handleUploadNF = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, nota_fiscal_url: file_url }));
      toast.success('Nota fiscal anexada — extraindo dados com IA...');

      setExtractingNF(true);
      try {
        const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: 'object',
            properties: {
              numero: { type: 'string', description: 'Número da nota fiscal' },
              serie: { type: 'string', description: 'Série da nota fiscal' },
              valor_total: { type: 'number', description: 'Valor total da nota fiscal' },
              cnpj_emitente: { type: 'string', description: 'CNPJ do emitente' },
              razao_social: { type: 'string', description: 'Razão social do emitente' },
              data_emissao: { type: 'string', description: 'Data de emissão no formato DD/MM/YYYY' },
              competencia: { type: 'string', description: 'Mês/ano de competência identificado' },
            },
          },
        });

        if (extracted?.status === 'success' && extracted.output) {
          const data = extracted.output;
          setExtractedNF(data);
          setForm(prev => ({
            ...prev,
            numero_nf: data.numero || prev.numero_nf,
            valor_nf: data.valor_total || prev.valor_nf,
          }));
          toast.success('Dados extraídos automaticamente da nota fiscal!');
        }
      } catch {
      } finally {
        setExtractingNF(false);
      }
    } catch (error) {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadXML = async (file) => {
    if (!file) return;
    setUploadingXML(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, xml_url: file_url }));
      toast.success('XML da nota fiscal anexado com sucesso');
    } catch (error) {
      toast.error('Erro ao enviar XML: ' + error.message);
    } finally {
      setUploadingXML(false);
    }
  };

  const handleUploadXLSX = async (file) => {
    if (!file) return;
    setExtractingXLSX(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, xlsx_url: file_url }));
      toast.success('Planilha XLSX anexada com sucesso');
    } catch (error) {
      toast.error('Erro ao enviar planilha: ' + error.message);
    } finally {
      setExtractingXLSX(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!teamMember) {
      toast.error('Você não está cadastrado como membro da equipe');
      return;
    }

    if (!reportApproved) {
      toast.error('O relatório do mês precisa estar aprovado pelo coordenador antes do envio financeiro.');
      return;
    }

    if (!checklistAtual.contrato || !checklistAtual.nfPdf || !checklistAtual.nfXml) {
      toast.error('Checklist incompleto. É obrigatório ter contrato, NF em PDF e XML.');
      return;
    }

    setLoading(true);
    try {
      const existing = payments.find(p =>
        p.mes_referencia === form.mes_referencia &&
        p.ano === form.ano &&
        !['RECUSADO', 'DEVOLVIDO_REVISAO'].includes(p.status)
      );

      if (existing) {
        toast.error('Você já possui um envio em andamento para este mês');
        setLoading(false);
        return;
      }

      await base44.entities.TeamPayment.create({
        team_member_id: teamMember.id,
        user_email: userEmail,
        report_id: monthReport?.id || null,
        mes_referencia: form.mes_referencia,
        ano: form.ano,
        numero_nf: form.numero_nf,
        valor_nf: form.valor_nf,
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url || null,
        xlsx_url: form.xlsx_url || null,
        contract_url: contractUrl || null,
        numero_parcela: (teamMember.parcelas_pagas || 0) + 1,
        status: 'AGUARDANDO_APROVACAO',
        nf_numero_extraido: extractedNF?.numero || null,
        nf_valor_extraido: extractedNF?.valor_total || null,
        nf_cnpj_emitente: extractedNF?.cnpj_emitente || null,
        nf_razao_social: extractedNF?.razao_social || null,
        nf_data_emissao: extractedNF?.data_emissao || null,
        nf_competencia: extractedNF?.competencia || null,
      });

      try {
        await base44.functions.invoke('notifyTeamPaymentSubmitted', {
          team_member_name: teamMember.user_name,
          mes: form.mes_referencia,
          ano: form.ano,
          valor: form.valor_nf,
        });
      } catch {}

      toast.success('Documentos enviados para aprovação do coordenador!');
      setForm({
        mes_referencia: '',
        ano: new Date().getFullYear(),
        numero_nf: '',
        valor_nf: 0,
        nota_fiscal_url: '',
        xml_url: '',
        xlsx_url: ''
      });
      setExtractedNF(null);
      setShowForm(false);
      queryClient.invalidateQueries(['team-payments']);
    } catch (error) {
      toast.error('Erro ao enviar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!teamMember) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        Você não está cadastrado como membro da equipe financeira. Contate o coordenador.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-black">Meus Documentos Financeiros</h2>
          <p className="text-xs text-gray-500 mt-1">
            Parcela {(teamMember.parcelas_pagas || 0) + 1} de {teamMember.numero_parcelas}
            {teamMember.funcao && ` • ${teamMember.funcao}`}
          </p>
        </div>
        <Button className="bg-black hover:bg-gray-800" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />Novo Envio Mensal
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-black">Histórico de Envios</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
            Nenhum envio registrado ainda
          </p>
        ) : (
          payments.map(payment => {
            const paymentChecklist = {
              contrato: !!(payment.contract_url || contractUrl),
              nfPdf: !!payment.nota_fiscal_url,
              nfXml: !!payment.xml_url,
            };

            return (
              <div key={payment.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm text-black">{payment.mes_referencia} / {payment.ano}</p>
                    {payment.numero_nf && <p className="text-xs text-gray-500">NF: {payment.numero_nf}</p>}
                    {payment.valor_nf > 0 && (
                      <p className="text-sm font-bold text-black mt-1">
                        R$ {payment.valor_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <Badge className={STATUS_COLORS[payment.status] || STATUS_COLORS.RASCUNHO}>
                    {STATUS_LABELS[payment.status] || payment.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                  <ChecklistItem ok={paymentChecklist.contrato} label="Contrato" />
                  <ChecklistItem ok={paymentChecklist.nfPdf} label="NF PDF" />
                  <ChecklistItem ok={paymentChecklist.nfXml} label="NF XML" />
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  {(payment.contract_url || contractUrl) && (
                    <a href={payment.contract_url || contractUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700">
                        <FileCheck className="w-3 h-3 mr-1" />Contrato
                      </Button>
                    </a>
                  )}
                  {payment.nota_fiscal_url && (
                    <a href={payment.nota_fiscal_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />PDF NF
                      </Button>
                    </a>
                  )}
                  {payment.xml_url && (
                    <a href={payment.xml_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />XML NF
                      </Button>
                    </a>
                  )}
                  {payment.xlsx_url && (
                    <a href={payment.xlsx_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />Planilha
                      </Button>
                    </a>
                  )}
                </div>

                {payment.observacoes && (
                  <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 p-2 rounded-lg mt-2 italic">
                    💬 Observação do coordenador: {payment.observacoes}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envio Mensal — Parcela {(teamMember.parcelas_pagas || 0) + 1}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês de Referência *</Label>
                <Select value={form.mes_referencia} onValueChange={v => setForm({ ...form, mes_referencia: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano *</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={e => setForm({ ...form, ano: parseInt(e.target.value) })}
                  min={2026}
                />
              </div>
            </div>

            {form.mes_referencia && (
              <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
                loadingReport
                  ? 'bg-gray-50 border-gray-200 text-gray-500'
                  : reportApproved
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {loadingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />
                ) : reportApproved ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>
                  {loadingReport
                    ? 'Verificando relatório do mês...'
                    : reportApproved
                    ? `Relatório de ${form.mes_referencia}/${form.ano} aprovado ✓ Pode prosseguir com o envio.`
                    : `O relatório de ${form.mes_referencia}/${form.ano} ${!monthReport ? 'não foi encontrado' : 'ainda não está aprovado'}. O envio financeiro só é permitido após aprovação do relatório mensal pelo coordenador.`}
                </span>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700">
                Checklist obrigatório para envio
              </div>
              <div className="grid grid-cols-1 gap-2">
                <ChecklistItem ok={checklistAtual.contrato} label="Contrato" />
                <ChecklistItem ok={checklistAtual.nfPdf} label="NF PDF" />
                <ChecklistItem ok={checklistAtual.nfXml} label="NF XML" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número da NF</Label>
                <Input
                  value={form.numero_nf}
                  onChange={e => setForm({ ...form, numero_nf: e.target.value })}
                  placeholder="Ex: 001234"
                />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  value={form.valor_nf}
                  onChange={e => setForm({ ...form, valor_nf: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Nota Fiscal em PDF *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
                {form.nota_fiscal_url ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <FileCheck className="w-5 h-5" />
                      <span className="text-sm font-medium">PDF enviado com sucesso</span>
                    </div>
                    {extractingNF && (
                      <div className="flex items-center justify-center gap-2 text-blue-600 text-xs">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        Extraindo dados com IA...
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {loading ? (
                      <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">{loading ? 'Enviando...' : 'Clique para enviar PDF da NF'}</p>
                    <p className="text-xs text-gray-400 mt-1">Dados serão extraídos automaticamente com IA</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={e => handleUploadNF(e.target.files[0])}
                      className="hidden"
                      disabled={loading}
                    />
                  </label>
                )}
              </div>
            </div>

            <div>
              <Label>XML da Nota Fiscal *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
                {form.xml_url ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileCheck className="w-5 h-5" />
                    <span className="text-sm font-medium">XML enviado com sucesso</span>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {uploadingXML ? (
                      <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">{uploadingXML ? 'Enviando...' : 'Clique para enviar XML da NF'}</p>
                    <p className="text-xs text-gray-400 mt-1">Arquivo .xml da mesma nota fiscal enviada em PDF</p>
                    <input
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      onChange={e => handleUploadXML(e.target.files[0])}
                      className="hidden"
                      disabled={uploadingXML}
                    />
                  </label>
                )}
              </div>
            </div>

            {extractedNF && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-xs mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Dados extraídos automaticamente via IA
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  {extractedNF.razao_social && <span><span className="text-blue-500">Emitente:</span> {extractedNF.razao_social}</span>}
                  {extractedNF.valor_total && <span><span className="text-blue-500">Valor:</span> R$ {extractedNF.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                  {extractedNF.data_emissao && <span><span className="text-blue-500">Emissão:</span> {extractedNF.data_emissao}</span>}
                  {extractedNF.competencia && <span><span className="text-blue-500">Competência:</span> {extractedNF.competencia}</span>}
                  {extractedNF.cnpj_emitente && <span><span className="text-blue-500">CNPJ:</span> {extractedNF.cnpj_emitente}</span>}
                </div>
              </div>
            )}

            <div>
              <Label>Planilha XLSX <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 text-center">
                {form.xlsx_url ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileCheck className="w-4 h-4" />
                    <span className="text-sm">Planilha enviada</span>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    {extractingXLSX ? (
                      <Loader2 className="w-6 h-6 text-gray-400 mx-auto mb-1 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    )}
                    <p className="text-xs text-gray-500">{extractingXLSX ? 'Enviando...' : 'Clique para enviar planilha XLSX'}</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={e => handleUploadXLSX(e.target.files[0])}
                      className="hidden"
                      disabled={extractingXLSX}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setExtractedNF(null); }}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-black hover:bg-gray-800"
                disabled={
                  loading ||
                  !form.nota_fiscal_url ||
                  !form.xml_url ||
                  !reportApproved ||
                  loadingReport ||
                  !checklistAtual.contrato
                }
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar para Aprovação
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
