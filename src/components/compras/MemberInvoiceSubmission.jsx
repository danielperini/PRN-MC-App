import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function MemberInvoiceSubmission() {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [daysUntilSubmit, setDaysUntilSubmit] = useState(null);

  useEffect(() => {
    // Carregar usuário atual
    base44.auth.me().then(user => {
      setCurrentUser(user);
    });

    // Verificar se pode fazer submissão
    checkSubmissionWindow();
  }, []);

  const checkSubmissionWindow = () => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const isFirstDay = dayOfMonth === 1;
    
    if (isFirstDay) {
      setCanSubmit(true);
      setDaysUntilSubmit(null);
    } else {
      setCanSubmit(false);
      // Calcular dias até o próximo 1º
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const daysLeft = Math.ceil((nextMonth - today) / (1000 * 60 * 60 * 24));
      setDaysUntilSubmit(daysLeft);
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    if (!canSubmit) {
      toast.error(`Submissão disponível apenas no 1º dia do mês. Faltam ${daysUntilSubmit} dias.`);
      return;
    }

    setUploading(true);
    const newInvoices = [];

    for (const file of files) {
      try {
        // Upload do arquivo
        const uploadRes = await base44.integrations.Core.UploadFile({ file });

        setAnalyzing(true);

        // Análise pela IA
        const extracted = await base44.integrations.Core.InvokeLLM({
          model: 'gpt_5',
          prompt: `Analise esta nota fiscal e extraia os dados. Retorne um JSON válido:
{
  "numero_nota": (string - número da nota fiscal),
  "fornecedor_nome": (nome da empresa/pessoa),
  "fornecedor_cnpj": (CNPJ ou CPF),
  "data_emissao": (YYYY-MM-DD),
  "valor_total": (número - valor total),
  "descricao_servico": (descrição do serviço/produto),
  "categoria_servico": (categoria)
}`,
          file_urls: [uploadRes.file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              numero_nota: { type: 'string' },
              fornecedor_nome: { type: 'string' },
              fornecedor_cnpj: { type: 'string' },
              data_emissao: { type: 'string' },
              valor_total: { type: 'number' },
              descricao_servico: { type: 'string' },
              categoria_servico: { type: 'string' }
            }
          }
        });

        setAnalyzing(false);

        newInvoices.push({
          id: Math.random().toString(36),
          file_name: file.name,
          file_url: uploadRes.file_url,
          extracted: extracted,
          status: 'analisado'
        });
      } catch (error) {
        console.error('Erro ao processar nota:', error);
        toast.error(`Erro ao analisar ${file.name}: ${error.message}`);
      }
    }

    setUploading(false);
    setInvoices(prev => [...prev, ...newInvoices]);

    if (newInvoices.length > 0) {
      toast.success(`${newInvoices.length} nota(s) fiscal(is) analisada(s) pela IA`);
    }
  };

  const handleSubmit = async () => {
    if (invoices.length === 0) {
      toast.error('Envie pelo menos uma nota fiscal');
      return;
    }

    setUploading(true);
    try {
      // Criar registro de submissão
      const submission = await base44.entities.InvoiceSubmission.create({
        user_email: currentUser.email,
        user_name: currentUser.full_name,
        mes_referencia: new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
        data_submissao: new Date().toISOString(),
        notas_fiscais: invoices.map(inv => ({
          numero: inv.extracted?.numero_nota,
          fornecedor: inv.extracted?.fornecedor_nome,
          valor: inv.extracted?.valor_total,
          file_url: inv.file_url,
          dados_extraidos: inv.extracted
        })),
        valor_total: invoices.reduce((sum, inv) => sum + (inv.extracted?.valor_total || 0), 0),
        status: 'PENDENTE_ANALISE'
      });

      toast.success('Notas fiscais enviadas com sucesso!');
      setInvoices([]);
      setIsOpen(false);
    } catch (error) {
      console.error('Erro ao enviar:', error);
      toast.error('Erro ao enviar notas: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeInvoice = (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  return (
    <>
      <Button
        onClick={() => {
          checkSubmissionWindow();
          setIsOpen(true);
        }}
        variant={canSubmit ? 'default' : 'outline'}
        className={canSubmit ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
      >
        <Upload className="w-4 h-4 mr-2" />
        Enviar Notas Fiscais
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Submissão de Notas Fiscais
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status de submissão */}
            {!canSubmit && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  Submissão de notas fiscais está disponível <strong>apenas no 1º dia de cada mês</strong>.
                  <br />
                  Próxima submissão em <strong>{daysUntilSubmit} dia(s)</strong>.
                </AlertDescription>
              </Alert>
            )}

            {canSubmit && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 text-sm">
                  ✓ Janela de submissão aberta! Você pode enviar notas fiscais agora.
                </AlertDescription>
              </Alert>
            )}

            {/* Upload de notas */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Notas Fiscais (PDF, JPG, PNG)
              </label>
              <label className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                canSubmit ? 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50' : 'border-gray-200 bg-gray-50 cursor-not-allowed'
              }`}>
                {uploading || analyzing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="text-sm text-indigo-600 font-medium">
                      {uploading ? 'Enviando...' : 'Analisando com IA...'}
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-700 font-medium">Clique para enviar notas fiscais</span>
                    <span className="text-xs text-gray-500">ou arraste os arquivos aqui</span>
                  </>
                )}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => handleFileUpload(e.target.files)}
                  disabled={!canSubmit || uploading || analyzing}
                  className="hidden"
                />
              </label>
            </div>

            {/* Lista de notas enviadas */}
            {invoices.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Notas Analisadas ({invoices.length})</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {invoices.map(inv => (
                    <div key={inv.id} className="border border-green-200 bg-green-50 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{inv.file_name}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <strong>{inv.extracted?.fornecedor_nome}</strong> - NF {inv.extracted?.numero_nota}
                          </p>
                        </div>
                        <button
                          onClick={() => removeInvoice(inv.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium flex-shrink-0"
                        >
                          Remover
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                        <div>
                          <span className="font-semibold">Valor:</span> R$ {(inv.extracted?.valor_total || 0).toFixed(2)}
                        </div>
                        <div>
                          <span className="font-semibold">Data:</span> {inv.extracted?.data_emissao}
                        </div>
                        <div>
                          <span className="font-semibold">Serviço:</span> {inv.extracted?.categoria_servico}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700">Valor Total:</span>
                    <span className="text-lg font-bold text-gray-900">
                      R$ {invoices.reduce((sum, inv) => sum + (inv.extracted?.valor_total || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-3 justify-end border-t pt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={uploading || analyzing}>
              Cancelar
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSubmit}
              disabled={invoices.length === 0 || uploading || analyzing}
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Enviar Notas ({invoices.length})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}