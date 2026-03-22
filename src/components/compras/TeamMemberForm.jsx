import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v){ return Number(v)||0 }

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember,
  budgetLines = [],
}) {

  const [loading,setLoading] = useState(false);
  const [aiLoading,setAiLoading] = useState(false);

  const [form,setForm] = useState({
    user_email:'',
    user_name:'',
    telefone:'',
    cpf:'',
    funcao:'',
    budgetline_id:'',
    rubrica_id:'',
    contrato_url:'',
    descricao_contrato:'',
    objeto_contrato:'',
    data_inicio_contrato:'',
    data_fim_contrato:'',
    valor_total:0,
    numero_parcelas:1,
    parcelas_pagas:0,
    valor_parcela:0,
    banco:'',
    agencia:'',
    conta:'',
    pix_key:'',
  });

  useEffect(()=>{
    if(isOpen){
      if(editingMember){
        setForm({
          ...form,
          ...editingMember,
          budgetline_id:
            editingMember?.budgetline_id ||
            editingMember?.budget_line_id ||
            editingMember?.rubrica_id ||
            '',
          rubrica_id:
            editingMember?.rubrica_id ||
            editingMember?.budgetline_id ||
            '',
        });
      }
    }
  },[isOpen,editingMember]);

  const set = (field,value)=>{
    setForm(prev=>({
      ...prev,
      [field]:value
    }));
  };

  /* ================= IA CONTRATO ================= */

  const processContratoIA = async(file_url)=>{
    try{

      const result = await base44.integrations.Core.InvokeLLM({
        prompt:`Extraia do contrato:
        data_inicio, data_fim, valor_total, numero_parcelas,
        banco, agencia, conta, pix_key, objeto_contrato`,
        file_urls:[file_url]
      });

      const parcelas = Math.max(1,parseInt(result.numero_parcelas)||1);
      const total = toNumber(result.valor_total);

      setForm(prev=>({
        ...prev,
        objeto_contrato: result.objeto_contrato || prev.objeto_contrato,
        data_inicio_contrato: result.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato: result.data_fim || prev.data_fim_contrato,
        valor_total: total,
        numero_parcelas: parcelas,
        valor_parcela: total && parcelas ? total/parcelas : prev.valor_parcela,
        banco: result.banco || prev.banco,
        agencia: result.agencia || prev.agencia,
        conta: result.conta || prev.conta,
        pix_key: result.pix_key || prev.pix_key,
      }));

      toast.success('Contrato preenchido com IA');

    }catch(e){
      toast.error('Erro IA contrato');
    }
  };

  const handleContratoUpload = async(file)=>{
    if(!file) return;

    setAiLoading(true);

    try{
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm(prev=>({
        ...prev,
        contrato_url:file_url
      }));

      await processContratoIA(file_url);

    }catch(e){
      toast.error(e.message);
    }

    setAiLoading(false);
  };

  /* ================= SUBMIT ================= */

  const handleSubmit = async(e)=>{
    e.preventDefault();
    setLoading(true);

    try{

      const payload = {
        ...form,
        budgetline_id: form.budgetline_id || form.rubrica_id,
        rubrica_id: form.rubrica_id || form.budgetline_id,
        valor_total: toNumber(form.valor_total),
        valor_parcela: toNumber(form.valor_parcela),
      };

      if(editingMember?.id){
        await base44.entities.TeamMember.update(editingMember.id,payload);
      }else{
        await base44.entities.TeamMember.create(payload);
      }

      toast.success('Salvo');
      onSuccess();
      onClose();

    }catch(e){
      toast.error(e.message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">

        <DialogHeader>
          <DialogTitle>Cadastro de Equipe</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* PERFIL */}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.user_name} onChange={e=>set('user_name',e.target.value)} />

            <Label>Email</Label>
            <Input value={form.user_email} onChange={e=>set('user_email',e.target.value)} />

            <Label>Telefone</Label>
            <Input value={form.telefone} onChange={e=>set('telefone',e.target.value)} />

            <Label>Função</Label>
            <Input value={form.funcao} onChange={e=>set('funcao',e.target.value)} />
          </div>

          {/* RUBRICA */}
          <div>
            <Label>Rubrica / Linha Orçamentária</Label>

            <Select
              value={form.rubrica_id}
              onValueChange={(v)=>{
                set('rubrica_id',v);
                set('budgetline_id',v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>

              <SelectContent>
                {budgetLines.map(b=>(
                  <SelectItem key={b.id} value={b.id}>
                    {b.codigo} - {b.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CONTRATO */}
          <div className="space-y-2">
            <Label>Contrato</Label>

            <input
              type="file"
              onChange={(e)=>handleContratoUpload(e.target.files[0])}
            />

            {aiLoading && <p className="text-xs">Processando IA...</p>}

            <Textarea
              placeholder="Descrição contrato"
              value={form.descricao_contrato}
              onChange={(e)=>set('descricao_contrato',e.target.value)}
            />
          </div>

          {/* FINANCEIRO */}
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Valor total"
              value={form.valor_total}
              onChange={(e)=>set('valor_total',e.target.value)}
            />

            <Input
              placeholder="Parcelas"
              value={form.numero_parcelas}
              onChange={(e)=>set('numero_parcelas',e.target.value)}
            />

            <Input
              placeholder="Valor parcela"
              value={form.valor_parcela}
              onChange={(e)=>set('valor_parcela',e.target.value)}
            />
          </div>

          {/* BANCO */}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Banco" value={form.banco} onChange={(e)=>set('banco',e.target.value)} />
            <Input placeholder="Agência" value={form.agencia} onChange={(e)=>set('agencia',e.target.value)} />
            <Input placeholder="Conta" value={form.conta} onChange={(e)=>set('conta',e.target.value)} />
            <Input placeholder="PIX" value={form.pix_key} onChange={(e)=>set('pix_key',e.target.value)} />
          </div>

          <Button type="submit" className="w-full">
            {loading ? <Loader2 className="animate-spin w-4 h-4"/> : 'Salvar'}
          </Button>

        </form>

      </DialogContent>
    </Dialog>
  );
}
