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

function formatBRL(v){
  return `R$ ${toNumber(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
}

function calcValorParcela(member){
  const total = toNumber(member?.valor_total);
  const parcelas = toNumber(member?.numero_parcelas);
  if(!total || !parcelas) return 0;
  return total / parcelas;
}

function buildNFName(member, parcela, valor){
  return `NF ${parcela} - ${member.funcao?.toUpperCase()} - ${member.user_name?.toUpperCase()} - MUSEUS CENTRO - ${formatBRL(valor)}`;
}

export default function TeamPaymentSubmit({ userEmail }) {

  const [showForm,setShowForm] = useState(false);
  const [loading,setLoading] = useState(false);
  const [extractingNF,setExtractingNF] = useState(false);

  const [form,setForm] = useState({
    mes_referencia:'',
    ano:new Date().getFullYear(),
    numero_nf:'',
    valor_nf:0,
    nota_fiscal_url:'',
    xml_url:'',
    nf_valida:null,
    nf_erros:[]
  });

  const queryClient = useQueryClient();

  const { data: ownMember } = useQuery({
    queryKey:['own-member',userEmail],
    queryFn:async ()=>{
      const d = await base44.entities.TeamMember.filter({ user_email:userEmail });
      return d?.[0]||null;
    },
    enabled:!!userEmail
  });

  const member = ownMember;

  const { data: payments = [] } = useQuery({
    queryKey:['payments',userEmail],
    queryFn:()=> base44.entities.TeamPayment.filter({ user_email:userEmail },'-created_date',50),
    enabled:!!userEmail
  });

  const { data: report } = useQuery({
    queryKey:['report',userEmail,form.mes_referencia],
    queryFn:async ()=>{
      if(!form.mes_referencia) return null;
      const r = await base44.entities.Report.filter({
        created_by:userEmail,
        mes_referencia:form.mes_referencia
      });
      return r?.[0]||null;
    },
    enabled:!!form.mes_referencia
  });

  const reportApproved = report?.status === 'APPROVED';
  const contractUrl = member?.contrato_url;

  const parcelaAtual = (member?.parcelas_pagas || 0) + 1;
  const valorParcela = calcValorParcela(member);

  const isReady =
    form.mes_referencia &&
    reportApproved &&
    contractUrl &&
    form.nota_fiscal_url &&
    form.xml_url &&
    (form.nf_valida !== false);

  /* ================= NF ================= */

  const handleUploadNF = async (file)=>{
    if(!file) return;

    setLoading(true);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm(prev=>({...prev,nota_fiscal_url:file_url}));

      setExtractingNF(true);

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

      const valor = extracted?.output?.valor_total || 0;

      setForm(prev=>({
        ...prev,
        numero_nf:extracted?.output?.numero || '',
        valor_nf:valor,
        nf_valida: Math.abs(valor - valorParcela) <= 1,
        nf_erros: Math.abs(valor - valorParcela) <= 1 ? [] : ['Valor diferente da parcela']
      }));

    }catch(e){
      toast.error(e.message);
    }

    setExtractingNF(false);
    setLoading(false);
  };

  /* ================= XML ================= */

  const handleUploadXML = async (file)=>{
    if(!file) return;

    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev=>({...prev,xml_url:file_url}));
  };

  /* ================= SUBMIT ================= */

  const handleSubmit = async (e)=>{
    e.preventDefault();

    if(!isReady){
      toast.error('Complete todos os requisitos');
      return;
    }

    setLoading(true);

    try{

      await base44.entities.TeamPayment.create({
        team_member_id:member.id,
        user_email:userEmail,
        mes_referencia:form.mes_referencia,
        numero_nf:form.numero_nf,
        valor_nf:form.valor_nf,
        nota_fiscal_url:form.nota_fiscal_url,
        xml_url:form.xml_url,
        contract_url:contractUrl,
        numero_parcela:parcelaAtual,
        valor_parcela_previsto:valorParcela,
        status:'AGUARDANDO_APROVACAO',
        nf_valida:form.nf_valida,
        nf_erros:form.nf_erros,
        nf_nome_arquivo: buildNFName(member, parcelaAtual, form.valor_nf)
      });

      toast.success('Enviado com sucesso');

      setShowForm(false);

      await queryClient.invalidateQueries();

    }catch(e){
      toast.error(e.message);
    }

    setLoading(false);
  };

  if(!member) return null;

  return (
    <div className="space-y-4">

      <Button onClick={()=>setShowForm(true)}>
        <Plus className="w-4 h-4 mr-2"/>
        Novo envio
      </Button>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>

          <DialogHeader>
            <DialogTitle>
              Envio mensal — parcela {parcelaAtual}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* STATUS */}
            <div className="text-xs space-y-1">
              <div>Contrato: {contractUrl ? '✔' : '❌'}</div>
              <div>Relatório: {reportApproved ? '✔ aprovado' : '❌ pendente'}</div>
            </div>

            <div>
              <Label>Mês</Label>
              <Select value={form.mes_referencia} onValueChange={(v)=>setForm({...form,mes_referencia:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor esperado</Label>
              <Input value={formatBRL(valorParcela)} disabled />
            </div>

            <div>
              <Label>NF</Label>
              <input type="file" onChange={(e)=>handleUploadNF(e.target.files[0])}/>
              {extractingNF && <span className="text-xs">IA analisando...</span>}
            </div>

            {form.nf_valida === false && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3"/>
                Valor divergente da parcela
              </div>
            )}

            <div>
              <Label>XML</Label>
              <input type="file" onChange={(e)=>handleUploadXML(e.target.files[0])}/>
            </div>

            <Button type="submit" disabled={!isReady || loading}>
              {loading ? <Loader2 className="animate-spin w-4 h-4"/> : 'Enviar'}
            </Button>

          </form>

        </DialogContent>
      </Dialog>

    </div>
  );
}
