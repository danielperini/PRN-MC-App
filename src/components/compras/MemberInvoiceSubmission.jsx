import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, CheckCircle2, AlertCircle, FileText, FileCode, X, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';

export default function MemberInvoiceSubmission() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('upload'); // 'upload' | 'analyzing' | 'review' | 'submitting' | 'done'
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [xmlUrl, setXmlUrl] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [result, setResult] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const resetState = () => {
    setStep('upload');
    setPdfFile(null); setXmlFile(null);
    setPdfUrl(null); setXmlUrl(null);
    setAiData(null); setResult(null);
  };

  const handleOpen = () => { resetState(); setIsOpen(true); };
  const handleClose = () => { setIsOpen(false); resetState(); };

  const handleFileSelect = (type, file) => {
    if (!file) return;
    if (type === 'pdf') { setPdfFile(file); setPdfUrl(null); }
    if (type === 'xml') { setXmlFile(file); setXmlUrl(null); }
  };

  const handleAnalyze = async () => {
    if (!pdfFile || !xmlFile) {
      toast.error('Você precisa anexar o PDF e o XML da nota fiscal.');
      return;
    }

    setStep('analyzing');
    try {
      // Upload ambos arquivos
      toast.info('Enviando arquivos...');
      const [pdfRes, xmlRes] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: pdfFile }),
        base44.integrations.Core.UploadFile({ file: xmlFile }),
      ]);
      setPdfUrl(pdfRes.file_url);
      setXmlUrl(xmlRes.file_url);

      // Análise pela IA
      toast.info('Analisando nota fiscal com IA...');
      const extracted = await base44.integrations.Core.InvokeLLM({
        model: 'gpt_5',
        prompt: `Analise esta nota fiscal (PDF e XML) e extraia os dados bancários e fiscais. Retorne JSON:
{
  "numero_nota": "número da nota emitido pelo prestador",
  "fornecedor_nome": "nome da empresa/pessoa emitente",
  "fornecedor_cnpj": "CNPJ ou CPF do emitente",
  "destinatario_nome": "nome do destinatário/tomador",
  "destinatario_cnpj": "CNPJ ou CPF do destinatário",
  "data_emissao": "YYYY-MM-DD",
  "valor_total": número_decimal,
  "descricao_servico": "descrição completa do serviço",
  "chave_acesso": "chave de acesso NF-e (44 dígitos se houver)",
  "banco_nome": "nome do banco para pagamento (se houver)",
  "banco_agencia": "agência (se houver)",
  "banco_conta": "conta bancária (se houver)",
  "banco_pix": "chave pix (se houver)",
  "banco_favorecido": "nome do favorecido da conta (se houver)"
}`,
        file_urls: [pdfRes.file_url, xmlRes.file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            numero_nota: { type: 'string' },
            fornecedor_nome: { type: 'string' },
            fornecedor_cnpj: { type: 'string' },
            destinatario_nome: { type: 'string' },
            destinatario_cnpj: { type: 'string' },
            data_emissao: { type: 'string' },
            valor_total: { type: 'number' },
            descricao_servico: { type: 'string' },
            chave_acesso: { type: 'string' },
            banco_nome: { type: 'string' },
            banco_agencia: { type: 'string' },
            banco_conta: { type: 'string' },
            banco_pix: { type: 'string' },
            banco_favorecido: { type: 'string' },
          }
        }
      });

      setAiData(extracted);
      setStep('review');
    } catch (err) {
      toast.error('Erro ao analisar arquivos: ' + err.message);
      setStep('upload');
    }
  };

  const handleSubmit = async () => {
    setStep('submitting');
    try {
      const res = await base44.functions.invoke('submitInvoiceWithBackup', {
        pdfFileUrl: pdfUrl,
        xmlFileUrl: xmlUrl,
        aiExtracted: aiData,
        invoiceData: { user_email: currentUser?.email, user_name: currentUser?.full_name },
      });

      if (res?.data?.success) {
        setResult(res.data);
        setStep('done');
        toast.success('✅ Nota fiscal enviada com sucesso!');
      } else {
        throw new Error(res?.data?.error || 'Erro desconhecido');
      }
    } catch (err) {
      toast.error('Erro ao enviar: ' + err.message);
      setStep('review');
    }
  };

  return (
    <>
      <Button onClick={handleOpen} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
        <Upload className="w-4 h-4" /> Enviar Nota Fiscal
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Envio Mensal de Nota Fiscal
            </DialogTitle>
          </DialogHeader>

          {/* STEP: UPLOAD */}
          {(step === 'upload' || step === 'analyzing') && (
            <div className="space-y-4 py-2">
              <Alert className="border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-sm">
                  <strong>Obrigatório:</strong> anexe o <strong>PDF</strong> e o <strong>XML</strong> da nota fiscal.
                  Os dados bancários serão lidos automaticamente pela IA.
                </AlertDescription>
              </Alert>

              {/* Upload PDF */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  📄 PDF da Nota Fiscal <span className="text-red-500">*</span>
                </label>
                <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${pdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                  {pdfFile ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-800 font-medium truncate">{pdfFile.name}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); setPdfFile(null); }} className="ml-auto text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-600">Clique para selecionar o PDF</span>
                    </>
                  )}
                  <input type="file" accept=".pdf" onChange={e => handleFileSelect('pdf', e.target.files[0])} className="hidden" />
                </label>
              </div>

              {/* Upload XML */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  🗂️ XML da Nota Fiscal <span className="text-red-500">*</span>
                </label>
                <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${xmlFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                  {xmlFile ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-800 font-medium truncate">{xmlFile.name}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); setXmlFile(null); }} className="ml-auto text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <FileCode className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-600">Clique para selecionar o XML</span>
                    </>
                  )}
                  <input type="file" accept=".xml" onChange={e => handleFileSelect('xml', e.target.files[0])} className="hidden" />
                </label>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button
                  onClick={handleAnalyze}
                  disabled={!pdfFile || !xmlFile || step === 'analyzing'}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {step === 'analyzing' ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando...</>
                  ) : (
                    <>Analisar com IA →</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* STEP: REVIEW */}
          {step === 'review' && aiData && (
            <div className="space-y-4 py-2">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 text-sm font-medium">
                  IA analisou os arquivos com sucesso. Revise os dados antes de enviar.
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 rounded-lg border p-4 space-y-2 text-sm">
                <h4 className="font-semibold text-gray-800 mb-2">📋 Dados da Nota Fiscal</h4>
                {[
                  ['Nº da Nota', aiData.numero_nota],
                  ['Emitente', aiData.fornecedor_nome],
                  ['CNPJ/CPF Emitente', aiData.fornecedor_cnpj],
                  ['Destinatário', aiData.destinatario_nome],
                  ['Data de Emissão', aiData.data_emissao],
                  ['Valor Total', aiData.valor_total ? `R$ ${Number(aiData.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'],
                  ['Serviço', aiData.descricao_servico],
                ].map(([label, val]) => val ? (
                  <div key={label} className="flex gap-2">
                    <span className="text-gray-500 w-36 flex-shrink-0">{label}:</span>
                    <span className="text-gray-800 font-medium">{val}</span>
                  </div>
                ) : null)}
              </div>

              {(aiData.banco_nome || aiData.banco_pix || aiData.banco_conta) && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-2 text-sm">
                  <h4 className="font-semibold text-blue-800 mb-2">🏦 Dados Bancários</h4>
                  {[
                    ['Banco', aiData.banco_nome],
                    ['Favorecido', aiData.banco_favorecido],
                    ['Agência', aiData.banco_agencia],
                    ['Conta', aiData.banco_conta],
                    ['PIX', aiData.banco_pix],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="flex gap-2">
                      <span className="text-blue-600 w-24 flex-shrink-0">{label}:</span>
                      <span className="text-blue-900 font-medium">{val}</span>
                    </div>
                  ) : null)}
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <strong>Nome do arquivo no Drive:</strong><br />
                {`NF ${aiData.numero_nota} ${(currentUser?.funcao || currentUser?.role || 'PROFISSIONAL').toUpperCase()} - ${(currentUser?.full_name || '').toUpperCase()} - MUSEUS CENTRO - R$ ${Number(aiData.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.pdf`}
              </div>

              <div className="flex gap-3 justify-between pt-2">
                <Button variant="outline" onClick={() => setStep('upload')}>← Voltar</Button>
                <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700">
                  <CloudUpload className="w-4 h-4 mr-2" /> Enviar para Aprovação
                </Button>
              </div>
            </div>
          )}

          {/* STEP: SUBMITTING */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <p className="text-sm font-medium text-gray-700">Salvando no banco de dados e fazendo backup no Drive...</p>
              <p className="text-xs text-gray-500">Aguarde, isso pode levar alguns segundos.</p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && result && (
            <div className="space-y-4 py-2">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <AlertDescription className="text-green-800">
                  <p className="font-semibold text-base mb-1">✅ Nota Fiscal enviada com sucesso!</p>
                  <p className="text-sm">Sua NF foi salva no banco de dados{result.backup_done ? ', backup feito no Google Drive' : ''} e enviada para aprovação do coordenador.</p>
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500">Status:</span>
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">Aguardando Aprovação</Badge>
                </div>
                {result.drive_link && (
                  <div className="flex gap-2 items-center">
                    <span className="text-gray-500">Drive:</span>
                    <a href={result.drive_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm">Abrir no Drive</a>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-gray-500">Arquivo:</span>
                  <span className="text-gray-800 text-xs break-all">{result.nome_arquivo}</span>
                </div>
                <div className="text-xs text-gray-500 pt-1">
                  📧 Notificações enviadas para: {(result.notificacoes_enviadas || []).join(', ')}
                </div>
              </div>

              <Button className="w-full" onClick={handleClose}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}