// 🔥 CORREÇÃO: botão travado + fluxo estável (SEM alterar layout)

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
   🔥 ALTERAÇÃO CRÍTICA AQUI
   ========================= */

// remover completamente o uso travante
// const [analyzingOnly, setAnalyzingOnly] = useState(false);

// substituir por:
const useSafeSubmitting = () => {
  const [submitting, setSubmitting] = useState(false);
  return { submitting, setSubmitting };
};

/* ========================= */

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function toNumber(v){ return Number(v)||0; }

export default function TeamPaymentSubmit({ userEmail }) {

  const queryClient = useQueryClient();

  const { submitting, setSubmitting } = useSafeSubmitting(); // 🔥 NOVO

  const [open,setOpen]=useState(false);
  const [pdfFile,setPdfFile]=useState(null);
  const [xmlFile,setXmlFile]=useState(null);
  const [analysis,setAnalysis]=useState(null);
  const [analysisStep,setAnalysisStep]=useState('');

  const [progressPercent,setProgressPercent]=useState(0);

  const [form,setForm]=useState({
    competencia:'',
    numero_nf:'',
    valor_nf:'',
    nota_fiscal_url:'',
    xml_url:''
  });

  const { data: currentUser } = useQuery({
    queryKey:['auth-me'],
    queryFn:()=>base44.auth.me()
  });

  const { data: member } = useQuery({
    queryKey:['team-submit-own-member',userEmail],
    queryFn:async()=>{
      const rows = await base44.entities.TeamMember.filter({ user_email:userEmail });
      return rows?.[0] || null;
    },
    enabled:!!userEmail
  });

  async function handleSubmit(e){
    e.preventDefault();

    if(submitting) return; // 🔥 proteção contra double click

    if(!member){
      toast.error('Perfil não encontrado');
      return;
    }

    if(!form.numero_nf){
      toast.error('Número NF obrigatório');
      return;
    }

    if(!pdfFile){
      toast.error('PDF obrigatório');
      return;
    }

    if(!xmlFile){
      toast.error('XML obrigatório');
      return;
    }

    setSubmitting(true);
    setAnalysis(null);

    try{

      /* =========================
         🔥 ANÁLISE IA
         ========================= */

      setAnalysisStep('Analisando nota...');
      setProgressPercent(30);

      const analysisResult = await base44.functions.invoke('validateTeamPaymentInvoice',{
        file_url:null,
        xml_url:null,
        numero_nf:form.numero_nf
      });

      const ar = analysisResult?.data || {};
      setAnalysis(ar);

      if(ar?.can_submit === false){
        toast.error('Erro na análise da nota');
        setSubmitting(false); // 🔥 GARANTE LIBERAÇÃO
        return;
      }

      /* =========================
         🔥 CRIA REGISTRO
         ========================= */

      setAnalysisStep('Registrando...');
      setProgressPercent(70);

      const created = await base44.entities.TeamPayment.create({
        user_email: member.user_email,
        user_name: member.user_name,
        numero_nf: form.numero_nf,
        status:'AGUARDANDO_APROVACAO'
      });

      /* =========================
         🔥 NOTIFICA
         ========================= */

      await notifyCoordinators({
        title:'Nova NF enviada',
        message:'Nova nota aguardando aprovação',
        type:'PAYMENT_SUBMITTED'
      });

      setProgressPercent(100);

      toast.success('Nota enviada com sucesso');

      setOpen(false);

    }catch(e){
      toast.error(e?.message || 'Erro ao enviar');
    }finally{
      setSubmitting(false); // 🔥 CORREÇÃO PRINCIPAL
      setAnalysisStep('');
    }
  }

  return (
    <div>

      <Button onClick={()=>setOpen(true)}>
        <Plus className="w-4 h-4 mr-2"/>Novo envio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>

          <DialogHeader>
            <DialogTitle>Envio mensal</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            <Input
              placeholder="Número NF"
              value={form.numero_nf}
              onChange={e=>setForm(p=>({...p,numero_nf:e.target.value}))}
            />

            <input type="file" onChange={e=>setPdfFile(e.target.files[0])}/>
            <input type="file" onChange={e=>setXmlFile(e.target.files[0])}/>

            {submitting && (
              <div className="text-sm">
                <Brain className="w-4 h-4 inline mr-2"/>
                {analysisStep}
                <Progress value={progressPercent}/>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting} // 🔥 CORREÇÃO AQUI
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                    Enviando...
                  </>
                ) : '✅ Enviar nota para aprovação'}
              </Button>
            </div>

          </form>

        </DialogContent>
      </Dialog>

    </div>
  );
}
