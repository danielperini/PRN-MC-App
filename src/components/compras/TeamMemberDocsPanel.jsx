import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v){ return Number(v)||0 }
function formatBRL(v){
  return `R$ ${toNumber(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
}

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

  /* ================= IA AUTOMÁTICA NF ================= */

  const processNFIA = async (paymentId, file_url)=>{
    try{
      const res = await base44.integrations.Core.InvokeLLM({
        prompt:`Leia esta nota fiscal do projeto Museus Centro e valide:

Regras obrigatórias:
- CNPJ 23.843.648/0001-25
- Deve conter "Museus Centro"
- Deve conter descrição de serviço
- Deve conter mês de referência
- Deve conter dados bancários
- CPF ou CNPJ (não ambos)

Retorne JSON:
{
 "valida": true/false,
 "valor": number,
 "mes": "texto",
 "erros": []
}`,
        file_urls:[file_url]
      });

      await base44.entities.TeamPayment.update(paymentId,{
        nf_validada:true,
        nf_valida:res.data.valida,
        nf_erros:res.data.erros,
        valor_nf:res.data.valor,
        mes_referencia:res.data.mes
      });

      toast.success('NF analisada pela IA');

    }catch(e){
      toast.error('Erro IA NF');
    }
  };

  /* ================= UPLOAD NF ================= */

  const uploadNF = async (payment, file, tipo)=>{

    if(!file) return;

    setLoadingAction(payment.id);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      if(tipo==='pdf'){
        await base44.entities.TeamPayment.update(payment.id,{
          nota_fiscal_url:file_url
        });

        await processNFIA(payment.id, file_url);
      }

      if(tipo==='xml'){
        await base44.entities.TeamPayment.update(payment.id,{
          xml_url:file_url
        });
      }

      queryClient.invalidateQueries(['team-payments-member',member.id]);

    }catch(e){
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

  /* ================= APROVAÇÃO ================= */

  const autorizarPagamento = async (payment)=>{

    if(!payment._ready){
      toast.error('Checklist incompleto');
      return;
    }

    setLoadingAction(payment.id);

    try{
      await base44.entities.TeamPayment.update(payment.id,{
        status:'APROVADO_COORD',
        aprovado_em:new Date().toISOString()
      });

      // envio automático email
      await base44.functions.invoke('sendApprovedTeamInvoiceEmail',{
        to:'notasfiscais@viadutodasartes.org.br',
        member_name:member.user_name,
        valor:payment.valor_nf,
        file_url:payment.nota_fiscal_url
      });

      toast.success('Aprovado e enviado');

      queryClient.invalidateQueries(['team-payments-member',member.id]);

    }catch(e){
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

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

                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">{p.mes_referencia}/{p.ano}</p>
                    <p className="text-xs">{formatBRL(p.valor_nf)}</p>
                  </div>

                  <Badge className={statusColor}>
                    {p._ready ? 'PRONTO' : 'PENDENTE'}
                  </Badge>
                </div>

                {/* UPLOAD */}
                <div className="flex gap-2">

                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline">
                      <Upload className="w-4 h-4 mr-1"/> NF PDF
                    </Button>
                    <input type="file" className="hidden"
                      onChange={(e)=>uploadNF(p,e.target.files[0],'pdf')}
                    />
                  </label>

                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline">
                      <Upload className="w-4 h-4 mr-1"/> XML
                    </Button>
                    <input type="file" className="hidden"
                      onChange={(e)=>uploadNF(p,e.target.files[0],'xml')}
                    />
                  </label>

                </div>

                {/* IA STATUS */}
                {p.nf_validada && (
                  <div className="text-xs">
                    {p.nf_valida
                      ? <span className="text-green-600">✅ NF válida</span>
                      : <span className="text-red-600">❌ NF inválida</span>}
                  </div>
                )}

                {isCoordenador && (
                  <Button
                    size="sm"
                    className="bg-black text-white"
                    onClick={()=>autorizarPagamento(p)}
                    disabled={!p._ready || loadingAction===p.id}
                  >
                    {loadingAction===p.id
                      ? <Loader2 className="w-4 h-4 animate-spin"/>
                      : 'Autorizar pagamento'}
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
