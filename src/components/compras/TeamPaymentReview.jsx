import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  ClipboardCheck,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function toNumber(v){ return Number(v)||0 }
function formatBRL(v){
  return `R$ ${toNumber(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
}

export default function TeamPaymentReview({ members=[], budgetLines=[] }) {

  const queryClient = useQueryClient();
  const [reviewing,setReviewing] = useState(null);
  const [action,setAction] = useState(null);
  const [comment,setComment] = useState('');
  const [saving,setSaving] = useState(false);
  const [competenciaMes,setCompetenciaMes] = useState('');
  const [competenciaAno,setCompetenciaAno] = useState(String(new Date().getFullYear()));

  const { data: payments=[] } = useQuery({
    queryKey:['team-payments-review'],
    queryFn:()=> base44.entities.TeamPayment.list('-created_date',200)
  });

  const getMember = (p)=> members.find(m=> m.id===p.team_member_id);

  const getBudgetLine = (member)=>{
    return budgetLines.find(b=>b.id===member?.budgetline_id);
  };

  const handleConfirm = async ()=>{
    if(!reviewing) return;

    const member = getMember(reviewing);
    const budgetLine = getBudgetLine(member);

    setSaving(true);

    try{

      const user = await base44.auth.me();

      if(action==='approve'){

        // 🔥 APROVAR
        await base44.entities.TeamPayment.update(reviewing.id,{
          status:'APROVADO_COORD',
          aprov_coord_nome:user?.full_name,
          aprov_coord_email:user?.email,
          aprov_coord_data:new Date().toISOString(),
          observacoes:comment
        });

        // 🔥 ATUALIZA PARCELA
        await base44.entities.TeamMember.update(member.id,{
          parcelas_pagas: toNumber(member.parcelas_pagas)+1
        });

        // 🔥 DEBITA RUBRICA
        if(budgetLine){
          await base44.entities.BudgetLine.update(budgetLine.id,{
            saldo_comprometido:
              toNumber(budgetLine.saldo_comprometido)+
              toNumber(reviewing.valor_nf)
          });
        }

        toast.success('Aprovado');

      } else {

        await base44.entities.TeamPayment.update(reviewing.id,{
          status:'DEVOLVIDO_REVISAO',
          observacoes:comment
        });

        toast.success('Devolvido');
      }

      await queryClient.invalidateQueries();

      setReviewing(null);
      setAction(null);

    }catch(e){
      toast.error(e.message);
    }

    setSaving(false);
  };

  const marcarComoPago = async (payment)=>{
    try{
      await base44.entities.TeamPayment.update(payment.id,{
        status:'PAGO',
        data_pagamento:new Date().toISOString()
      });

      toast.success('Pagamento confirmado');

      await queryClient.invalidateQueries();

    }catch(e){
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">

      {payments.map(p=>{
        const member = getMember(p);

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-3">

            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{member?.user_name}</p>
                <p className="text-xs text-gray-500">
                  {p.mes_referencia}/{p.ano}
                </p>
              </div>

              <Badge>{p.status}</Badge>
            </div>

            <div className="text-sm">
              Valor: {formatBRL(p.valor_nf)}
            </div>

            <div className="flex gap-2">

              {p.status === 'AGUARDANDO_APROVACAO' && (
                <>
                  <Button onClick={()=>{setReviewing(p);setAction('approve')}}>
                    Aprovar
                  </Button>

                  <Button variant="outline" onClick={()=>{setReviewing(p);setAction('return')}}>
                    Devolver
                  </Button>
                </>
              )}

              {p.status === 'APROVADO_COORD' && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={()=>marcarComoPago(p)}
                >
                  Confirmar pagamento
                </Button>
              )}

            </div>

          </div>
        );
      })}

      {reviewing && (
        <Dialog open onOpenChange={()=>setReviewing(null)}>
          <DialogContent>

            <DialogHeader>
              <DialogTitle>
                {action==='approve' ? 'Aprovar' : 'Devolver'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">

              {action==='approve' && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={competenciaMes} onValueChange={setCompetenciaMes}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m=>(
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={competenciaAno}
                    onChange={(e)=>setCompetenciaAno(e.target.value)}
                  />
                </div>
              )}

              <Textarea
                value={comment}
                onChange={(e)=>setComment(e.target.value)}
                placeholder="Observação"
              />

            </div>

            <DialogFooter>
              <Button variant="outline" onClick={()=>setReviewing(null)}>
                Cancelar
              </Button>

              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? <Loader2 className="animate-spin w-4"/> : 'Confirmar'}
              </Button>
            </DialogFooter>

          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
