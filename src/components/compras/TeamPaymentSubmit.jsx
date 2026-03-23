// (arquivo completo já corrigido e robusto)

import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function toNumber(v){ return Number(v)||0 }

function calcValorParcela(member){
  const total = toNumber(member?.valor_total);
  const parcelas = toNumber(member?.numero_parcelas);
  if(!total || !parcelas) return 0;
  return total / parcelas;
}

function isDentroDoContrato(member, mes, ano){
  if(!member?.data_inicio || !member?.data_fim) return true;

  const inicio = new Date(member.data_inicio);
  const fim = new Date(member.data_fim);

  const mesIndex = MONTHS.indexOf(mes);
  const dataRef = new Date(ano, mesIndex, 1);

  return dataRef >= inicio && dataRef <= fim;
}

export default function TeamPaymentSubmit({ userEmail }) {

  const [showForm,setShowForm] = useState(false);
  const [loading,setLoading] = useState(false);
  const [extractingNF,setExtractingNF] = useState(false);
  const [selectedMemberId,setSelectedMemberId] = useState('');

  const [form,setForm] = useState({
    mes_referencia:'',
    ano:new Date().getFullYear(),
    numero_nf:'',
    valor_nf:0,
    nota_fiscal_url:'',
    xml_url:'',
  });

  const [nfPreview,setNfPreview] = useState(null);

  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey:['auth-me'],
    queryFn:()=> base44.auth.me()
  });

  const isCoordinator = ['ADMIN','COORDENADOR','admin'].includes(currentUser?.role);

  const { data: ownMember } = useQuery({
    queryKey:['own-member',userEmail],
    queryFn:async ()=>{
      const d = await base44.entities.TeamMember.filter({ user_email:userEmail });
      return d?.[0]||null;
    },
    enabled:!!userEmail
  });

  const { data: allMembers = [] } = useQuery({
    queryKey:['all-members'],
    queryFn:()=> base44.entities.TeamMember.list('-created_date',500),
    enabled:isCoordinator
  });

  const accessibleMembers = useMemo(()=>{
    return isCoordinator ? allMembers : ownMember ? [ownMember] : [];
  },[isCoordinator,allMembers,ownMember]);

  useEffect(()=>{
    if(accessibleMembers.length && !selectedMemberId){
      setSelectedMemberId(accessibleMembers[0].id);
    }
  },[accessibleMembers]);

  const member = useMemo(()=>{
    return accessibleMembers.find(m=>m.id===selectedMemberId) || null;
  },[accessibleMembers,selectedMemberId]);

  const parcelaAtual = (member?.parcelas_pagas || 0) + 1;
  const valorParcela = calcValorParcela(member);

  const handleUploadNF = async (file)=>{
    if(!file) return;

    setLoading(true);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm(prev=>({...prev,nota_fiscal_url:file_url}));

      const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema:{
          type:'object',
          properties:{
            numero:{type:'string'},
            valor_total:{type:'number'}
          }
        }
      });

      if(extracted?.output){
        setForm(prev=>({
          ...prev,
          numero_nf:extracted.output.numero,
          valor_nf:extracted.output.valor_total
        }));
      }

      const validation = await base44.functions.invoke('validateNotaFiscal', {
        documentId:'preview',
        file_url
      });

      setNfPreview(validation);

    }catch(e){
      toast.error(e.message);
    }

    setLoading(false);
  };

  const handleUploadXML = async (file)=>{
    if(!file) return;

    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev=>({...prev,xml_url:file_url}));
  };

  const handleSubmit = async (e)=>{
    e.preventDefault();

    // 🔥 VALIDAÇÕES NOVAS

    if(!isDentroDoContrato(member, form.mes_referencia, form.ano)){
      toast.error('Fora do período do contrato');
      return;
    }

    if(parcelaAtual > (member?.numero_parcelas || 0)){
      toast.error('Contrato já finalizado');
      return;
    }

    if(Math.abs(form.valor_nf - valorParcela) > 1){
      toast.error('Valor divergente da parcela');
      return;
    }

    if(!form.nota_fiscal_url || !form.xml_url){
      toast.error('Envie NF e XML');
      return;
    }

    setLoading(true);

    try{

      await base44.entities.TeamPayment.create({
        team_member_id:member.id,
        user_email:member.user_email,
        mes_referencia:form.mes_referencia,
        ano:form.ano,
        numero_nf:form.numero_nf,
        valor_nf:form.valor_nf,
        nota_fiscal_url:form.nota_fiscal_url,
        xml_url:form.xml_url,
        numero_parcela:parcelaAtual,
        valor_parcela_previsto:valorParcela,
        status:'AGUARDANDO_APROVACAO'
      });

      toast.success('Enviado corretamente');

      setShowForm(false);
      await queryClient.invalidateQueries();

    }catch(e){
      toast.error(e.message);
    }

    setLoading(false);
  };

  if(!member){
    return <div className="p-4 text-sm text-gray-500">Sem acesso</div>;
  }

  return (
    <div className="space-y-6">

      <Button onClick={()=>setShowForm(true)}>
        <Plus className="w-4 h-4 mr-2"/>
        Novo envio
      </Button>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>

          <DialogHeader>
            <DialogTitle>Envio mensal</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            <Select
              value={form.mes_referencia}
              onValueChange={(v)=>setForm({...form,mes_referencia:v})}
            >
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* 🔥 VALOR AUTOMÁTICO */}
            <Input
              type="number"
              value={form.valor_nf || valorParcela}
              onChange={(e)=>setForm({...form,valor_nf:parseFloat(e.target.value)||0})}
            />

            <input type="file" onChange={(e)=>handleUploadNF(e.target.files[0])}/>
            <input type="file" onChange={(e)=>handleUploadXML(e.target.files[0])}/>

            {nfPreview && (
              <div className={`text-xs p-2 rounded ${
                nfPreview.status === 'divergente'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
              }`}>
                {nfPreview.status === 'divergente'
                  ? <AlertCircle className="inline w-3 mr-1"/>
                  : <CheckCircle2 className="inline w-3 mr-1"/>}
                Validação IA: R$ {nfPreview.valor}
              </div>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin w-4"/> : 'Enviar'}
            </Button>

          </form>

        </DialogContent>
      </Dialog>

    </div>
  );
}
