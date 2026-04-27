// ⚠️ ARQUIVO COMPLETO - TEAM PAYMENT SUBMIT COM AUTO-PREENCHIMENTO VIA ATTACHMENT

import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  AlertCircle, CheckCircle2, Eye, FileText, Loader2, Plus, Upload, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

/* =========================
   🔥 UTILITÁRIOS (mantidos)
========================= */

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(v) {
  return Number(v || 0);
}

function currencyInputMask(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const cents = Number(digits || '0') / 100;
  return cents.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* =========================
   🚀 COMPONENTE PRINCIPAL
========================= */

export default function TeamPaymentSubmit({ userEmail }) {

  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);

  const [form, setForm] = useState({
    competencia: '',
    numero_nf: '',
    valor_nf: '',
    nota_fiscal_url: '',
    xml_url: '',
    nota_fiscal_file_name: '',
    xml_file_name: ''
  });

  const [memberLocalPatch, setMemberLocalPatch] = useState({});

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => base44.auth.me()
  });

  const { data: member } = useQuery({
    queryKey: ['team-member', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return rows?.[0] || null;
    },
    enabled: !!userEmail
  });

  const effectiveMember = useMemo(() => ({
    ...(member || {}),
    ...(memberLocalPatch || {})
  }), [member, memberLocalPatch]);

  /* ===================================================
     🔥 NOVO BLOCO — BUSCA AUTOMÁTICA DA ÚLTIMA NF
  =================================================== */

  const { data: lastNF } = useQuery({
    queryKey: ['last-nf-attachment', userEmail],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 50);

      return (list || []).find(a =>
        a.nf_categoria === 'nota_fiscal' &&
        a.nf_emitente_nome &&
        a.nf_valor_total
      ) || null;
    },
    enabled: !!userEmail
  });

  /* ===================================================
     🔥 AUTO-PREENCHIMENTO INTELIGENTE
  =================================================== */

  useEffect(() => {
    if (!lastNF || !effectiveMember) return;

    const nomeNF = normalizeString(lastNF.nf_emitente_nome);
    const nomeMember = normalizeString(effectiveMember.user_name);

    const matchNome =
      nomeNF.includes(nomeMember) ||
      nomeMember.includes(nomeNF);

    const matchDoc =
      lastNF.nf_emitente_cpf_cnpj &&
      (
        lastNF.nf_emitente_cpf_cnpj === effectiveMember.cnpj ||
        lastNF.nf_emitente_cpf_cnpj === effectiveMember.cpf
      );

    if (!matchNome && !matchDoc) return;

    setForm((prev) => ({
      ...prev,
      numero_nf: lastNF.nf_numero || '',
      valor_nf: currencyInputMask(
        String(Math.round((lastNF.nf_valor_total || 0) * 100))
      ),
      nota_fiscal_url: lastNF.file_url || '',
      nota_fiscal_file_name: lastNF.file_name || ''
    }));

    if (lastNF.rubrica_id) {
      setMemberLocalPatch((prev) => ({
        ...prev,
        rubrica_id: lastNF.rubrica_id,
        rubrica_nome: lastNF.rubrica_nome || ''
      }));
    }

  }, [lastNF, effectiveMember]);

  /* ===================================================
     🔥 SUBMIT COM VÍNCULO TOTAL
  =================================================== */

  async function handleSubmit(e) {
    e.preventDefault();

    if (!effectiveMember) {
      toast.error('Perfil não encontrado');
      return;
    }

    if (!form.numero_nf) {
      toast.error('Informe número da NF');
      return;
    }

    try {

      const payload = {
        team_member_id: effectiveMember.id,
        user_email: effectiveMember.user_email,
        numero_nf: form.numero_nf,
        valor_nf: toNumber(form.valor_nf),
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url,

        // 🔥 VÍNCULO COM DOCUMENTO ORIGINAL
        source_attachment_id: lastNF?.id || '',
        linked_nf_numero: lastNF?.nf_numero || '',
        linked_emitente: lastNF?.nf_emitente_nome || '',

        rubrica_id: effectiveMember.rubrica_id || '',
        rubrica_nome: effectiveMember.rubrica_nome || '',

        status: 'AGUARDANDO_APROVACAO'
      };

      await base44.functions.invoke('createTeamPaymentIdempotent', payload);

      toast.success('Pagamento criado automaticamente');

      setOpen(false);

      await queryClient.invalidateQueries();

    } catch (err) {
      toast.error(err.message || 'Erro ao criar pagamento');
    }
  }

  /* ===================================================
     🔥 UI
  =================================================== */

  return (
    <div>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Novo envio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Envio de pagamento automático</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <Label>Número da NF</Label>
              <Input
                value={form.numero_nf}
                onChange={(e) =>
                  setForm({ ...form, numero_nf: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Valor</Label>
              <Input
                value={form.valor_nf}
                onChange={(e) =>
                  setForm({ ...form, valor_nf: currencyInputMask(e.target.value) })
                }
              />
            </div>

            {lastNF && (
              <div className="text-xs text-green-700">
                ✔ Documento identificado automaticamente: {lastNF.file_name}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="submit">
                Criar pagamento automático
              </Button>
            </div>

          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
