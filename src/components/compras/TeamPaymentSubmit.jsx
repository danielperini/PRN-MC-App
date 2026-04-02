import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle, CheckCircle2, Eye, FileText, Loader2, Plus, Upload, Brain,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const VIADUTO_EMISSAO = {
  razao_social: 'Viaduto das Artes',
  endereco: 'Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010',
  cnpj: '23.843.648/0001-25',
  inscricao_municipal: '0.745.690/001-X',
  telefone: '(31) 98802-5140',
  email: 'viadutodasartes@viadutodasartes.org.br',
  termo: '01-031.069/24-80',
};

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildMonthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mes = MONTHS[d.getMonth()];
    const ano = d.getFullYear();
    out.push({ value: `${mes}|${ano}`, label: `${mes}/${ano}`, mes, ano });
  }
  return out;
}

function getPreviousMonthRef(mes, ano) {
  const idx = MONTHS.indexOf(mes);
  if (idx === -1) return null;
  return idx === 0 ? { mes: 'Dezembro', ano: Number(ano) - 1 } : { mes: MONTHS[idx - 1], ano: Number(ano) };
}

function sanitize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getValorParcela(member) {
  const vp = toNumber(member?.valor_parcela);
  if (vp > 0) return vp;
  const total = toNumber(member?.valor_total);
  const parcelas = toNumber(member?.numero_parcelas) || toNumber(member?.parcelas);
  return total && parcelas ? total / parcelas : 0;
}

function buildFileName({ numeroNF, member, valor, extension }) {
  const nf = sanitize(numeroNF || 'NF');
  const cargo = sanitize(member?.funcao || 'FUNCAO');
  const nome = sanitize(member?.user_name || member?.nome || 'SEM NOME');
  const valorStr = sanitize(formatBRL(valor));
  return `${nf} ${cargo} - ${nome} - MUSEUS CENTRO - ${valorStr}.${extension}`;
}

async function renameFile(file, fileName) {
  const buffer = await file.arrayBuffer();
  return new File([buffer], fileName, {
    type: file.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
}

export default function TeamPaymentSubmit({ userEmail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);

  const [form, setForm] = useState({
    competencia: '',
    numero_nf: '',
    valor_nf: '',
    nota_fiscal_url: '',
    xml_url: '',
    nota_fiscal_file_name: '',
    xml_file_name: '',
  });

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const selectedComp = useMemo(() => monthOptions.find(o => o.value === form.competencia) || null, [form.competencia]);

  const { data: currentUser } = useQuery({ queryKey: ['auth-me'], queryFn: () => base44.auth.me() });

  const { data: member } = useQuery({
    queryKey: ['team-submit-own-member', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return rows?.[0] || null;
    },
    enabled: !!userEmail,
  });

  const valorParcela = useMemo(() => getValorParcela(member), [member]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // upload PDF
      if (pdfFile && !form.nota_fiscal_url) {
        const renamed = await renameFile(pdfFile, buildFileName({
          numeroNF: form.numero_nf,
          member,
          valor: valorParcela,
          extension: 'pdf'
        }));

        const { file_url } = await base44.integrations.Core.UploadFile({ file: renamed });

        form.nota_fiscal_url = file_url;
        form.nota_fiscal_file_name = renamed.name;
      }

      // upload XML
      if (xmlFile && !form.xml_url) {
        const renamed = await renameFile(xmlFile, buildFileName({
          numeroNF: form.numero_nf,
          member,
          valor: valorParcela,
          extension: 'xml'
        }));

        const { file_url } = await base44.integrations.Core.UploadFile({ file: renamed });

        form.xml_url = file_url;
        form.xml_file_name = renamed.name;
      }

      // salvar
      const created = await base44.entities.TeamPayment.create({
        team_member_id: member.id,
        user_email: member.user_email,
        mes_referencia: selectedComp.mes,
        ano: selectedComp.ano,
        numero_nf: form.numero_nf,
        valor_nf: valorParcela,
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url,
        nota_fiscal_file_name: form.nota_fiscal_file_name,
        xml_file_name: form.xml_file_name,
        status: 'AGUARDANDO_APROVACAO',
      });

      // 🔥 BACKUP DRIVE (NOVO)
      try {
        await base44.functions.invoke('backupNotasFiscaisToDrive', {
          file_url: form.nota_fiscal_url,
          file_name: form.nota_fiscal_file_name,
          xml_url: form.xml_url,
          xml_file_name: form.xml_file_name,
          team_payment_id: created?.id,
        });
      } catch (e) {
        console.warn('Erro backup drive', e);
      }

      // notificação
      await base44.functions.invoke('notifyTeamPaymentSubmitted', {
        payment_id: created.id,
        team_member_name: member.user_name,
        mes: selectedComp.mes,
        ano: selectedComp.ano,
        valor: valorParcela,
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url,
      });

      toast.success('Enviado com sucesso');
      setOpen(false);
      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error('Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Novo envio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envio NF</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            <Input
              placeholder="Número da NF"
              value={form.numero_nf}
              onChange={e => setForm(prev => ({ ...prev, numero_nf: e.target.value }))}
            />

            <input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files[0])} />
            <input type="file" accept=".xml" onChange={e => setXmlFile(e.target.files[0])} />

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Enviar'}
            </Button>

          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
