import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function toNumber(v){ return Number(v)||0 }

function calcValorParcela(member){
  const total = toNumber(member?.valor_total);
  const parcelas = toNumber(member?.numero_parcelas);
  if(!total || !parcelas) return 0;
  return total / parcelas;
}

function getDescricaoPadrao(member, mes, ano){
  return `${member?.funcao || ''} — Projeto Museus Centro — Termo de Colaboração 01-031.069/24-80 — Parceria SMC/FMC — ${mes}/${ano}`;
}

function getNomeArquivoPadrao(member, parcela, valor){
  const nome = (member?.user_name || '').toUpperCase();
  const funcao = (member?.funcao || '').toUpperCase();
  return `NF ${parcela} ${funcao} - ${nome} - MUSEUS CENTRO - R$ ${toNumber(valor).toFixed(2)}`;
}

export default function TeamPaymentSubmit({ userEmail }) {

  const [showForm,setShowForm] = useState(false);
  const [loading,setLoading] = useState(false);
  const [extractingNF,setExtractingNF] = useState(false);
  const [uploadingXML,setUploadingXML] = useState(false);
  const [selectedMemberId,setSelectedMemberId] = useState('');

  const [form,setForm] = useState({
    mes_referencia:'',
    ano:new Date().getFullYear(),
    numero_nf:'',
    valor_nf:0,
    nota_fiscal_url:'',
    xml_url:'',
  });

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

  const effectiveEmail = member?.user_email || userEmail;

  const { data: payments = [] } = useQuery({
    queryKey:['payments',effectiveEmail],
    queryFn:()=> base44.entities.TeamPayment.filter({ user_email:effectiveEmail },'-created_date',50),
    enabled:!!effectiveEmail
  });

  const { data: report } = useQuery({
    queryKey:['report',effectiveEmail,form.mes_referencia,form.ano],
    queryFn:async ()=>{
      if(!form.mes_referencia) return null;
      const r = await base44.entities.Report.filter({
        created_by:effectiveEmail,
        mes_referencia:form.mes_referencia,
        ano:form.ano
      });
      return r?.[0]||null;
    },
    enabled:!!form.mes_referencia && !!effectiveEmail
  });

  const reportApproved = report?.status === 'APPROVED';

  const contractUrl = member?.contrato_url || member?.contract_url;

  const parcelaAtual = (member?.parcelas_pagas || 0) + 1;
  const valorParcela = calcValorParcela(member);

  const handleUploadNF = async (file)=>{
    if(!file) return;

    setLoading(true);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm(prev=>({...prev,nota_fiscal_url:file_url}));

      setExtractingNF(true);

      try{
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
            numero_nf:extracted.output.numero || prev.numero_nf,
            valor_nf:extracted.output.valor_total || prev.valor_nf
          }));
        }

      }catch{}

      setExtractingNF(false);

    }catch(e){
      toast.error(e.message);
    }

    setLoading(false);
  };

  const handleUploadXML = async (file)=>{
    if(!file) return;

    setUploadingXML(true);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev=>({...prev,xml_url:file_url}));
    }catch(e){
      toast.error(e.message);
    }

    setUploadingXML(false);
  };

  const handleSubmit = async (e)=>{
    e.preventDefault();

    if(!member){
      toast.error('Membro não encontrado');
      return;
    }

    if(!form.mes_referencia){
      toast.error('Selecione o mês');
      return;
    }

    if(!reportApproved){
      toast.error('Relatório ainda não aprovado para este mês');
      return;
    }

    if(!contractUrl){
      toast.error('Contrato não vinculado ao membro');
      return;
    }

    if(!form.nota_fiscal_url || !form.xml_url){
      toast.error('Envie NF e XML');
      return;
    }

    if(valorParcela && Math.abs(form.valor_nf - valorParcela) > 1){
      toast.error(`Valor da NF difere da parcela (${valorParcela.toFixed(2)})`);
      return;
    }

    const existing = payments.find(p=>
      p.mes_referencia===form.mes_referencia &&
      p.ano===form.ano &&
      !['RECUSADO','DEVOLVIDO_REVISAO'].includes(p.status)
    );

    if(existing){
      toast.error('Já existe envio para este mês');
      return;
    }

    setLoading(true);

    try{

      const descricao_nf = getDescricaoPadrao(member, form.mes_referencia, form.ano);
      const nome_arquivo_nf = getNomeArquivoPadrao(member, parcelaAtual, form.valor_nf || valorParcela);

      await base44.entities.TeamPayment.create({
        team_member_id:member.id,
        user_email:effectiveEmail,
        mes_referencia:form.mes_referencia,
        ano:form.ano,
        numero_nf:form.numero_nf,
        valor_nf:form.valor_nf,
        nota_fiscal_url:form.nota_fiscal_url,
        xml_url:form.xml_url,
        contract_url:contractUrl,
        numero_parcela:parcelaAtual,
        valor_parcela_previsto:valorParcela,
        descricao_nf,
        nome_arquivo_nf,
        banco: member?.banco || '',
        agencia: member?.agencia || '',
        conta: member?.conta || '',
        pix_key: member?.pix_key || '',
        tipo_pessoa: member?.tipo_pessoa || '',
        cpf: member?.tipo_pessoa === 'PF' ? member?.cpf || '' : '',
        cnpj: member?.tipo_pessoa === 'PJ' ? member?.cnpj || '' : '',
        status:'AGUARDANDO_APROVACAO'
      });

      toast.success('Envio realizado');

      setShowForm(false);

      setForm({
        mes_referencia:'',
        ano:new Date().getFullYear(),
        numero_nf:'',
        valor_nf:0,
        nota_fiscal_url:'',
        xml_url:'',
      });

      await Promise.all([
        queryClient.invalidateQueries(['payments']),
        queryClient.invalidateQueries(['team-payments']),
        queryClient.invalidateQueries(['team-payments-pending']),
        queryClient.invalidateQueries(['team-payments-pending-review']),
        queryClient.invalidateQueries(['purchase-requests']),
      ]);

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

      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-semibold">
            Financeiro — {member.user_name}
          </h2>
          <p className="text-xs text-gray-500">
            Parcela {parcelaAtual} de {member.numero_parcelas}
          </p>
        </div>

        <Button onClick={()=>setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2"/>
          Novo envio
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>

          <DialogHeader>
            <DialogTitle>
              Envio mensal — parcela {parcelaAtual}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <Label>Mês</Label>
              <Select
                value={form.mes_referencia}
                onValueChange={(v)=>setForm({...form,mes_referencia:v})}
              >
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m=>(
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor esperado</Label>
              <Input value={valorParcela.toFixed(2)} disabled />
            </div>

            <div>
              <Label>Valor NF</Label>
              <Input
                type="number"
                value={form.valor_nf}
                onChange={(e)=>setForm({...form,valor_nf:parseFloat(e.target.value)||0})}
              />
            </div>

            <div>
              <Label>NF PDF</Label>
              <input type="file" onChange={(e)=>handleUploadNF(e.target.files[0])}/>
              {extractingNF && <span className="text-xs">Extraindo IA...</span>}
            </div>

            <div>
              <Label>XML</Label>
              <input type="file" onChange={(e)=>handleUploadXML(e.target.files[0])}/>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={()=>setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Enviar'}
              </Button>
            </div>

          </form>

        </DialogContent>
      </Dialog>

    </div>
  );
}
