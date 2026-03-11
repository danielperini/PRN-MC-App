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
      
      // Upload arquivo
      const uploadRes = await base44.integrations.Core.UploadFile({
        file
      });

      setUploading(false);
      setExtracting(true);

      // Extrair dados da nota fiscal
      const extractRes = await base44.functions.invoke('extractInvoiceData', {
        file_url: uploadRes.file_url
      });

      setExtracted(extractRes.data);
      setExtracting(false);

      // Opcionalmente criar fornecedor automaticamente
      if (extractRes.data?.data) {
        const fornecedorData = extractRes.data.data;
        try {
          const fornecedor = await base44.entities.Fornecedor.create({
            nome: fornecedorData.fornecedor_nome,
            tipo: fornecedorData.fornecedor_cpf_cnpj?.length === 11 ? 'pessoa_fisica' : 'pessoa_juridica',
            cpf_cnpj: fornecedorData.fornecedor_cpf_cnpj,
            email: fornecedorData.fornecedor_email,
            telefone: fornecedorData.fornecedor_telefone,
            banco: fornecedorData.fornecedor_banco,
            agencia: fornecedorData.fornecedor_agencia,
            conta: fornecedorData.fornecedor_conta,
            pix: fornecedorData.fornecedor_pix,
            categorias_servico: [fornecedorData.categoria_servico]
          });

          // Adicionar nota fiscal à prestação
          const nfData = {
            numero: fornecedorData.numero_nota,
            fornecedor_id: fornecedor.id,
            valor: fornecedorData.valor_total,
            data_emissao: fornecedorData.data_emissao,
            arquivo_url: uploadRes.file_url,
            dados_extraidos: fornecedorData
          };

          // Atualizar prestação com nova NF
          const prestacao = await base44.entities.PrestacaoDeContas.get(prestacaoId);
          const novas_nfs = [...(prestacao.notas_fiscais || []), nfData];
          const novo_total = novas_nfs.reduce((sum, nf) => sum + (nf.valor || 0), 0);

          await base44.entities.PrestacaoDeContas.update(prestacaoId, {
            notas_fiscais: novas_nfs,
            valor_total: novo_total
          });
        } catch (err) {
          console.error('Erro ao criar fornecedor:', err);
        }
      }
    } catch (err) {
      console.error('Erro ao processar nota fiscal:', err);
      setUploading(false);
      setExtracting(false);
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