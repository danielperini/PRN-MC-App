import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ExternalLink,
  Receipt,
  FileText,
  BookOpen,
  Upload,
  CheckCircle2,
  Loader2,
  XCircle,
  FileCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

/* ================= HELPERS ================= */

function toNumber(v){ return Number(v)||0 }

function formatBRL(v){
  return `R$ ${toNumber(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
}

/* ================= COMPONENT ================= */

export default function TeamMemberDocsPanel({
  member,
  onClose,
  isCoordenador,
  budgetLines = [],
}) {

  const queryClient = useQueryClient();

  const [loadingAction,setLoadingAction] = useState(null);

  const { data: payments = [] } = useQuery({
    queryKey:['team-payments-member',member.id],
    queryFn:()=> base44.entities.TeamPayment.filter(
      { team_member_id: member.id },
      '-created_date',
      50
    )
  });

  const budgetLine = budgetLines.find(b=>b.id===member.budgetline_id);

  /* ================= CHECKLIST ================= */

  const enrichedPayments = useMemo(()=>{
    return payments.map(p=>{

      const contrato = p.contract_url || member.contract_url;
      const nf = p.nota_fiscal_url;
      const xml = p.xml_url;

      const completo = contrato && nf && xml;

      const saldoOk = budgetLine
        ? (budgetLine.saldo || 0) >= (p.valor_nf || 0)
        : true;

      return {
        ...p,
        checklist:{
          contrato:!!contrato,
          nf:!!nf,
          xml:!!xml,
          completo,
          saldoOk
        },
        _ready: completo && saldoOk
      }
    })
  },[payments,budgetLine,member])

  /* ================= IA NF ================= */

  const validarNF = async (payment)=>{
    const url = payment.nota_fiscal_url;
    if(!url) return toast.error('NF não anexada');

    setLoadingAction(payment.id);

    try{
      const res = await base44.integrations.Core.InvokeLLM({
        prompt:`Valide esta NF do projeto Museus Centro.

Regras:
- CNPJ 23.843.648/0001-25
- Deve conter "Museus Centro"
- Deve conter mês referência
- Deve ter dados bancários

Responda JSON:
{ "valida": true/false, "erros": [] }`,
        file_urls:[url]
      });

      await base44.entities.TeamPayment.update(payment.id,{
        nf_validada:true,
        nf_valida:res.data.valida,
        nf_erros:res.data.erros
      });

      toast.success('NF validada');

      queryClient.invalidateQueries(['team-payments-member',member.id]);

    }catch(e){
      toast.error('Erro IA: '+e.message);
    }

    setLoadingAction(null);
  };

  /* ================= AUTORIZAR PAGAMENTO ================= */

  const autorizarPagamento = async (payment)=>{

    if(!payment._ready){
      toast.error('Checklist incompleto ou saldo insuficiente');
      return;
    }

    const mes = window.prompt('Qual mês está sendo pago? (ex: Fevereiro)');
    if(!mes) return;

    setLoadingAction(payment.id);

    try{
      await base44.entities.TeamPayment.update(payment.id,{
        status:'APROVADO_COORD',
        mes_pago_referencia:mes,
        aprovado_por:'coordenador',
        aprovado_em:new Date().toISOString()
      });

      toast.success('Pagamento autorizado');

      queryClient.invalidateQueries(['team-payments-member',member.id]);

    }catch(e){
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

  /* ================= UI ================= */

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">

        <DialogHeader>
          <DialogTitle>{member.user_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {enrichedPayments.map(p=>{

            const statusColor = p._ready
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700';

            return (
              <div key={p.id} className="border rounded-lg p-4 space-y-3">

                {/* HEADER */}
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">{p.mes_referencia}/{p.ano}</p>
                    <p className="text-xs">{formatBRL(p.valor_nf)}</p>
                  </div>

                  <Badge className={statusColor}>
                    {p._ready ? 'PRONTO' : 'PENDENTE'}
                  </Badge>
                </div>

                {/* CHECKLIST */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span>{p.checklist.contrato?'✅':'❌'} Contrato</span>
                  <span>{p.checklist.nf?'✅':'❌'} NF</span>
                  <span>{p.checklist.xml?'✅':'❌'} XML</span>
                </div>

                {/* IA NF */}
                {p.nota_fiscal_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={()=>validarNF(p)}
                    disabled={loadingAction===p.id}
                  >
                    {loadingAction===p.id
                      ? <Loader2 className="w-4 h-4 animate-spin"/>
                      : <Sparkles className="w-4 h-4"/>}
                    Validar NF
                  </Button>
                )}

                {/* AUTORIZAR */}
                {isCoordenador && (
                  <Button
                    size="sm"
                    className="bg-black text-white"
                    onClick={()=>autorizarPagamento(p)}
                    disabled={!p._ready || loadingAction===p.id}
                  >
                    Autorizar pagamento
                  </Button>
                )}

              </div>
            )
          })}

        </div>
      </DialogContent>
    </Dialog>
  );
}
