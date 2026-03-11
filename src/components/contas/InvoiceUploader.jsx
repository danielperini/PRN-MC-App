import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, CheckCircle2, Sparkles, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function InvoiceUploader({ prestacaoId }) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [selectedFornecedorId, setSelectedFornecedorId] = useState('');
  const [showNewFornecedorDialog, setShowNewFornecedorDialog] = useState(false);
  const [novoFornecedor, setNovoFornecedor] = useState({
    nome: '',
    tipo: 'pessoa_juridica',
    cpf: '',
    cnpj: '',
    email: '',
    telefone: '',
    categoria: 'outro',
    banco: '',
    agencia: '',
    conta: '',
    tipo_conta: 'corrente',
    pix: '',
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores'],
    queryFn: () => base44.entities.Fornecedor.list(),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      setUploading(false);
      setExtracting(true);

      // Extrair dados da nota fiscal com IA
      const extractRes = await base44.integrations.Core.InvokeLLM({
        prompt: `Leia esta nota fiscal e extraia um JSON com: numero_nota, fornecedor_nome, fornecedor_cnpj, fornecedor_email, fornecedor_telefone, fornecedor_banco, fornecedor_agencia, fornecedor_conta, fornecedor_pix, valor_total (número), data_emissao (YYYY-MM-DD), categoria_servico. Se não encontrar, deixe nulo.`,
        file_urls: [uploadRes.file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            numero_nota: { type: 'string' },
            fornecedor_nome: { type: 'string' },
            fornecedor_cnpj: { type: 'string' },
            fornecedor_email: { type: 'string' },
            fornecedor_telefone: { type: 'string' },
            fornecedor_banco: { type: 'string' },
            fornecedor_agencia: { type: 'string' },
            fornecedor_conta: { type: 'string' },
            fornecedor_pix: { type: 'string' },
            valor_total: { type: 'number' },
            data_emissao: { type: 'string' },
            categoria_servico: { type: 'string' },
            resumo: { type: 'string' }
          }
        }
      });

      setExtracted({
        file_url: uploadRes.file_url,
        data: extractRes
      });
      setExtracting(false);
    } catch (err) {
      console.error('Erro ao processar nota fiscal:', err);
      toast.error('Erro ao ler nota fiscal');
      setUploading(false);
      setExtracting(false);
    }
  };

  const handleCreateAndLinkInvoice = async () => {
    if (!extracted?.data?.numero_nota || !selectedFornecedorId) {
      toast.error('Selecione um fornecedor');
      return;
    }

    try {
      const nfData = {
        numero: extracted.data.numero_nota,
        fornecedor_id: selectedFornecedorId,
        fornecedor: fornecedores.find(f => f.id === selectedFornecedorId)?.nome,
        valor: extracted.data.valor_total,
        data_emissao: extracted.data.data_emissao,
        file_url: extracted.file_url,
        dados_extraidos: extracted.data
      };

      const prestacao = await base44.entities.InvoiceSubmission.get(prestacaoId);
      const novas_nfs = [...(prestacao.notas_fiscais || []), nfData];
      const novo_total = novas_nfs.reduce((sum, nf) => sum + (nf.valor || 0), 0);

      await base44.entities.InvoiceSubmission.update(prestacaoId, {
        notas_fiscais: novas_nfs,
        valor_total: novo_total
      });

      toast.success('✅ Nota fiscal vinculada!');
      setExtracted(null);
      setSelectedFornecedorId('');
    } catch (err) {
      console.error('Erro:', err);
      toast.error('Erro ao vincular nota fiscal');
    }
  };

  const handleCreateNewFornecedor = async () => {
    if (!novoFornecedor.nome) {
      toast.error('Nome obrigatório');
      return;
    }

    try {
      const created = await base44.entities.Fornecedor.create(novoFornecedor);
      setSelectedFornecedorId(created.id);
      setShowNewFornecedorDialog(false);
      setNovoFornecedor({
        nome: '',
        tipo: 'pessoa_juridica',
        cpf: '',
        cnpj: '',
        email: '',
        telefone: '',
        categoria: 'outro',
        banco: '',
        agencia: '',
        conta: '',
        tipo_conta: 'corrente',
        pix: '',
      });
      toast.success('Fornecedor criado com sucesso!');
    } catch (err) {
      toast.error('Erro ao criar fornecedor');
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
      {extracted ? (
        <div className="text-green-600">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          <p className="font-semibold">Nota fiscal processada</p>
          <p className="text-sm text-gray-600">{extracted.data?.fornecedor_nome}</p>
        </div>
      ) : uploading || extracting ? (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{uploading ? 'Enviando...' : 'Analisando...'}</span>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <label className="cursor-pointer">
            <span className="text-blue-600 font-semibold">Clique aqui</span>
            <span className="text-gray-600"> ou arraste para fazer upload da nota fiscal</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </>
      )}
    </div>
  );
}