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
    <>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        {extracted ? (
          <div className="space-y-4">
            <div className="text-green-600">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
              <p className="font-semibold">Nota fiscal lida com sucesso</p>
              <p className="text-sm text-gray-600">{extracted.data?.fornecedor_nome}</p>
              {extracted.data?.valor_total && (
                <p className="text-sm font-medium text-gray-700">
                  R$ {extracted.data.valor_total.toLocaleString('pt-BR')}
                </p>
              )}
            </div>

            <div className="space-y-3 text-left">
              <div>
                <Label className="text-sm">Selecione ou crie fornecedor</Label>
                <div className="flex gap-2 mt-1">
                  <Select value={selectedFornecedorId} onValueChange={setSelectedFornecedorId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Escolha um fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedores.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setNovoFornecedor({
                        ...novoFornecedor,
                        nome: extracted.data?.fornecedor_nome || '',
                        cnpj: extracted.data?.fornecedor_cnpj || '',
                        email: extracted.data?.fornecedor_email || '',
                        telefone: extracted.data?.fornecedor_telefone || '',
                        banco: extracted.data?.fornecedor_banco || '',
                        agencia: extracted.data?.fornecedor_agencia || '',
                        conta: extracted.data?.fornecedor_conta || '',
                        pix: extracted.data?.fornecedor_pix || '',
                      });
                      setShowNewFornecedorDialog(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setExtracted(null)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateAndLinkInvoice}
                  disabled={!selectedFornecedorId}
                  className="flex-1 bg-black hover:bg-gray-800"
                >
                  Vincular Nota Fiscal
                </Button>
              </div>
            </div>
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

      {/* Dialog para criar novo fornecedor */}
      <Dialog open={showNewFornecedorDialog} onOpenChange={setShowNewFornecedorDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Novo Fornecedor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome do Fornecedor *</Label>
              <Input 
                value={novoFornecedor.nome} 
                onChange={e => setNovoFornecedor({...novoFornecedor, nome: e.target.value})}
                placeholder="Nome ou razão social"
              />
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={novoFornecedor.tipo} onValueChange={v => setNovoFornecedor({...novoFornecedor, tipo: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CPF</Label>
                <Input 
                  value={novoFornecedor.cpf} 
                  onChange={e => setNovoFornecedor({...novoFornecedor, cpf: e.target.value})}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input 
                  value={novoFornecedor.cnpj} 
                  onChange={e => setNovoFornecedor({...novoFornecedor, cnpj: e.target.value})}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input 
                  value={novoFornecedor.email} 
                  onChange={e => setNovoFornecedor({...novoFornecedor, email: e.target.value})}
                  placeholder="email@fornecedor.com"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input 
                  value={novoFornecedor.telefone} 
                  onChange={e => setNovoFornecedor({...novoFornecedor, telefone: e.target.value})}
                  placeholder="(31) 99999-9999"
                />
              </div>
            </div>

            <div>
              <Label>Categoria</Label>
              <Select value={novoFornecedor.categoria} onValueChange={v => setNovoFornecedor({...novoFornecedor, categoria: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contabilidade">Contabilidade</SelectItem>
                  <SelectItem value="audiovisual">Audiovisual</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="consultoria">Consultoria</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-3">Dados Bancários</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Banco</Label>
                  <Input 
                    value={novoFornecedor.banco} 
                    onChange={e => setNovoFornecedor({...novoFornecedor, banco: e.target.value})}
                    placeholder="Caixa"
                  />
                </div>
                <div>
                  <Label className="text-sm">Agência</Label>
                  <Input 
                    value={novoFornecedor.agencia} 
                    onChange={e => setNovoFornecedor({...novoFornecedor, agencia: e.target.value})}
                    placeholder="0001"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label className="text-sm">Conta</Label>
                  <Input 
                    value={novoFornecedor.conta} 
                    onChange={e => setNovoFornecedor({...novoFornecedor, conta: e.target.value})}
                    placeholder="123456"
                  />
                </div>
                <div>
                  <Label className="text-sm">PIX</Label>
                  <Input 
                    value={novoFornecedor.pix} 
                    onChange={e => setNovoFornecedor({...novoFornecedor, pix: e.target.value})}
                    placeholder="Chave PIX"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button variant="outline" onClick={() => setShowNewFornecedorDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateNewFornecedor} className="bg-black hover:bg-gray-800">
                Criar Fornecedor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}