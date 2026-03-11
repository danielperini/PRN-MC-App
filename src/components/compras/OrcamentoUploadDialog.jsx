import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function OrcamentoUploadDialog({ open, onOpenChange, onSuccess, purchaseRequestId, activityTitle }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [userInputs, setUserInputs] = useState({});
  const [step, setStep] = useState('upload'); // upload, confirm, verify

  const requiredFields = ['fornecedor_nome', 'descricao_item', 'valor_solicitado'];
  const importantFields = ['prazo_entrega', 'fornecedor_contato', 'garantia', 'condicoes_pagamento', 'meios_pagamento'];

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUploadAndExtract = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        const mimeType = file.type;

        // Extract data with Claude
        const response = await base44.functions.invoke('extractOrcamentoData', {
          fileBase64: base64,
          mimeType,
          fileName: file.name,
        });

        const data = response.data.data;
        setExtractedData(data);

        // Check for missing required fields
        const missing = requiredFields.filter(field => !data[field] || data[field] === null);
        setMissingFields(missing);

        if (missing.length === 0) {
          setStep('confirm');
        } else {
          setStep('verify');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Erro ao extrair dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setUserInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const finalData = {
        ...extractedData,
        ...userInputs,
      };

      // Upload arquivo para armazenamento
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        
        // Fazer upload do arquivo para o armazenamento
        const uploadRes = await base44.integrations.Core.UploadFile({
          file: file
        });
        
        // Backup para Google Drive
        await base44.functions.invoke('backupOrcamentoToDrive', {
          fileBase64: base64,
          fileName: file.name,
          activityTitle: activityTitle || 'Sem Atividade',
          purchaseRequestId,
        });

        // Return data to parent com URL de arquivo confirmado
        onSuccess({
          fornecedor_nome: finalData.fornecedor_nome,
          fornecedor_cnpj: finalData.fornecedor_cnpj,
          fornecedor_contato: finalData.fornecedor_contato,
          fornecedor_cidade: finalData.fornecedor_cidade,
          descricao_item: finalData.descricao_item,
          valor_solicitado: Number(finalData.valor_solicitado) || 0,
          valor_unitario: Number(finalData.valor_unitario) || Number(finalData.valor_solicitado),
          orcamento_url: uploadRes.file_url,
          orcamento_nome: file.name,
          garantia: finalData.garantia,
          condicoes_pagamento: finalData.condicoes_pagamento,
          meios_pagamento: finalData.meios_pagamento,
          prazo_entrega: finalData.prazo_entrega,
        });

        setStep('upload');
        setFile(null);
        setExtractedData(null);
        setUserInputs({});
        onOpenChange(false);
        toast.success('Orçamento anexado e dados preenchidos!');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Erro ao processar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload de Orçamento</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <Label className="cursor-pointer">
                <span className="text-blue-600 hover:underline">Clique para selecionar</span>
                <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
              </Label>
              <p className="text-sm text-gray-500 mt-2">PDF ou Imagem (JPG, PNG)</p>
              {file && <p className="text-sm font-semibold mt-2 text-green-600">✓ {file.name}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUploadAndExtract} disabled={!file || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Processar Orçamento
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'verify' && extractedData && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Informações Ausentes</p>
                <p className="text-sm text-amber-800">Preencha os campos obrigatórios abaixo:</p>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {missingFields.map(field => (
                <div key={field}>
                  <Label className="text-sm font-semibold">
                    {field.replace(/_/g, ' ').toUpperCase()}
                  </Label>
                  <Input
                    value={userInputs[field] || ''}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    placeholder={`Digite o ${field.replace(/_/g, ' ')}`}
                    className="mt-1"
                  />
                </div>
              ))}

              <div className="border-t pt-3">
                <p className="text-sm font-semibold mb-3">Campos Adicionais (opcionais):</p>
                {importantFields.map(field => (
                  <div key={field} className="mb-2">
                    <Label className="text-xs">{field.replace(/_/g, ' ')}</Label>
                    <Input
                      value={userInputs[field] || extractedData[field] || ''}
                      onChange={(e) => handleInputChange(field, e.target.value)}
                      placeholder={extractedData[field] || ''}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={missingFields.some(f => !userInputs[f])}>
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'confirm' && extractedData && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900">Dados Extraídos com Sucesso</p>
                <p className="text-sm text-green-800">Revise e confirme os dados abaixo:</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(extractedData)
                .filter(([key]) => key !== 'confianca' && extractedData[key] !== null)
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-gray-900">{String(value)}</span>
                  </div>
                ))}
            </div>

            <div className="text-xs text-gray-500">
              Confiança da extração: <span className="font-semibold">{extractedData.confianca}</span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar e Salvar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}