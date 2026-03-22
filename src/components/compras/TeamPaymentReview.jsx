import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, ExternalLink, Loader2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function toNumber(v){ return Number(v || 0); }
function brl(v){ return `R$ ${toNumber(v).toFixed(2)}`; }

/* 🔥 NOVO: pegar validação NF */
function getNFValidation(payment){
  try{
    const raw = payment?.resultado_validacao;
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

export default function TeamPaymentReview({ members=[], budgetLines=[] }) {

  const queryClient = useQueryClient();
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [competenciaMes, setCompetenciaMes] = useState('');
  const [competenciaAno, setCompetenciaAno] = useState(String(new Date().getFullYear()));

  const { data: payments=[], isLoading } = useQuery({
    queryKey: ['team-payments-pending-review'],
    queryFn: () => base44.entities.TeamPayment.filter(
      { status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100
    ),
  });

  const getMember = (p)=>members.find(m=>m.id===p.team_member_id);

  /* 🔥 NOVO BLOCO DE VALIDAÇÃO */
  const getValidation = (payment)=>{

    const member = getMember(payment);
    const nfValidation = getNFValidation(payment);

    const valorNF = toNumber(nfValidation?.valor);
    const valorEsperado = toNumber(payment?.valor_nf || member?.valor_parcela);

    const divergente = nfValidation?.status === 'divergente';

    return {
      member,
      nfValidation,
      valorNF,
      valorEsperado,
      divergente,
      canApprove: !divergente
    };
  };

  const openReviewDialog = (p,a)=>{
    setReviewingPayment(p);
    setAction(a);
    setComment('');
    setCompetenciaMes(p.mes_referencia);
    setCompetenciaAno(String(p.ano));
  };

  const closeDialog = ()=>{
    setReviewingPayment(null);
    setAction(null);
    setComment('');
  };

  const handleConfirmAction = async ()=>{

    const v = getValidation(reviewingPayment);

    if(action==='approve' && v.divergente){
      toast.error('NF com divergência. Corrija antes.');
      return;
    }

    setSaving(true);

    try{

      const user = await base44.auth.me();

      await base44.entities.TeamPayment.update(reviewingPayment.id,{
        status: action==='approve' ? 'APROVADO_COORD':'DEVOLVIDO_REVISAO',
        observacoes: comment,
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString()
      });

      toast.success('Atualizado');

      queryClient.invalidateQueries(['team-payments-pending-review']);

      closeDialog();

    }catch(e){
      toast.error(e.message);
    }

    setSaving(false);
  };

  if(isLoading){
    return <Loader2 className="animate-spin mx-auto"/>;
  }

  return (
    <div className="space-y-4">

      {payments.map(p=>{

        const v = getValidation(p);

        return (
          <div key={p.id} className="border rounded-xl p-4 space-y-3">

            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{v.member?.user_name}</p>
                <p className="text-xs">{p.mes_referencia}/{p.ano}</p>
              </div>

              <Badge>
                {v.divergente ? '⚠️ Divergente' : 'OK'}
              </Badge>
            </div>

            {/* 🔥 NOVO BLOCO VISUAL IA */}
            {v.nfValidation && (
              <div className={`p-3 rounded-xl text-xs border ${
                v.divergente
                  ? 'bg-red-50 border-red-200'
                  : 'bg-green-50 border-green-200'
              }`}>

                <p className="font-semibold mb-1">
                  Validação automática da NF
                </p>

                <p>Fornecedor: {v.nfValidation.fornecedor}</p>
                <p>Valor NF: {brl(v.valorNF)}</p>
                <p>Valor esperado: {brl(v.valorEsperado)}</p>
                <p>Confiança: {v.nfValidation.confianca}%</p>

                {v.divergente && (
                  <p className="text-red-600 mt-1">
                    ⚠️ Divergência detectada
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!v.canApprove}
                onClick={()=>openReviewDialog(p,'approve')}
              >
                Aprovar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={()=>openReviewDialog(p,'return')}
              >
                Devolver
              </Button>
            </div>

          </div>
        );
      })}

      {reviewingPayment && (
        <Dialog open onOpenChange={closeDialog}>
          <DialogContent>

            <DialogHeader>
              <DialogTitle>
                {action==='approve' ? 'Aprovar':'Devolver'}
              </DialogTitle>
            </DialogHeader>

            <Textarea
              value={comment}
              onChange={e=>setComment(e.target.value)}
              placeholder="Observação"
            />

            <DialogFooter>
              <Button onClick={closeDialog}>Cancelar</Button>
              <Button onClick={handleConfirmAction} disabled={saving}>
                {saving ? <Loader2 className="animate-spin w-4 h-4"/>:'Confirmar'}
              </Button>
            </DialogFooter>

          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
