import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, CheckCircle2, AlertCircle, FileText, FileCode, X, CloudUpload, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import InvoiceFullAnalysisPanel from './InvoiceFullAnalysisPanel';
import ContractAutoFill, { applyAiSuggestions } from '@/components/users/ContractAutoFill';

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
  const [contractData, setContractData] = useState(null);
  const [appliedContractFields, setAppliedContractFields] = useState({});
  const [contractValid, setContractValid] = useState(null);
  const [contractAlert, setContractAlert] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Validar contrato quando o usuário entra
  useEffect(() => {
    if (currentUser?.email && isOpen) {
      validateUserContract(currentUser.email);
    }
  }, [currentUser?.email, isOpen]);

  const validateUserContract = async (userEmail) => {
    try {
      const members = await base44.entities.TeamMember.filter({ user_email: userEmail });
      if (!members?.length) {
        setContractValid(false);
        return;
      }
      const member = members.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
      if (!member.data_fim_contrato) {
        setContractValid(false);
        return;
      }
      const endDate = new Date(member.data_fim_contrato);
      const today = new Date();
      const isValid = endDate >= today;
      setContractValid(isValid);
      if (!isValid) {
        setContractAlert(`⚠️ Contrato vencido em ${endDate.toLocaleDateString('pt-BR')}. Solicite renovação à coordenação.`);
      } else {
        setContractAlert(null);
      }
    } catch (e) {
      console.warn('Erro ao validar contrato:', e);
      setContractValid(false);
    }
  };

  const resetState = () => {
    setStep('upload');
    setPdfFile(null); setXmlFile(null);
    setPdfUrl(null); setXmlUrl(null);
    setAiData(null); setResult(null);
    setContractData(null);
    setAppliedContractFields({});
    setContractAlert(null);
    setUploadingFiles(false);
  };

  const handleOpen = () => { resetState(); setIsOpen(true); };
  const handleClose = () => { setIsOpen(false); resetState(); };

  const handleFileSelect = async (type, file) => {
    if (!file) return;
    if (type === 'pdf') { setPdfFile(file); setPdfUrl(null); }
    if (type === 'xml') { setXmlFile(file); setXmlUrl(null); }
    
    // Se ambos os arquivos estão selecionados, fazer upload automático
    const pdf = type === 'pdf' ? file : pdfFile;
    const xml = type === 'xml' ? file : xmlFile;
    if (pdf && xml && !uploadingFiles) {
      await triggerAutoUploadAndAnalysis(pdf, xml);
    }
  };

  const triggerAutoUploadAndAnalysis = async (pdf, xml) => {
    if (uploadingFiles) return;
    setUploadingFiles(true);
    setStep('analyzing');
    
    try {
      toast.info('Enviando arquivos...');
      const [pdfRes, xmlRes] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: pdf }),
        base44.integrations.Core.UploadFile({ file: xml }),
      ]);
      setPdfUrl(pdfRes.file_url);
      setXmlUrl(xmlRes.file_url);

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
      
      // Mesclar com dados do contrato se aplicável
      if (contractData && Object.keys(appliedContractFields).length > 0) {
        const merged = {
          ...extracted,
          banco_nome: extracted.banco_nome || contractData.banco,
          banco_agencia: extracted.banco_agencia || contractData.agencia,
          banco_conta: extracted.banco_conta || contractData.conta,
          banco_pix: extracted.banco_pix || contractData.pix_key,
          banco_favorecido: extracted.banco_favorecido || contractData.user_name,
        };
        setAiData(merged);
      }

      toast.success('✅ Análise concluída!');
      setStep('review');
    } catch (err) {
      toast.error('Erro ao analisar arquivos: ' + err.message);
      setStep('upload');
    } finally {
      setUploadingFiles(false);
    }
  };

  // Mantém fallback manual apenas se análise automática falhar
  const handleAnalyzeManual = async () => {
    if (!pdfFile || !xmlFile) {
      toast.error('Você precisa anexar o PDF e o XML da nota fiscal.');
      return;
    }
    // Já foi feito automaticamente, apenas avança
    if (aiData) {
      setStep('review');
      return;
    }
    await triggerAutoUploadAndAnalysis(pdfFile, xmlFile);
  };

  const handleSubmit = async () => {
    setStep('submitting');
    try {
      const res = await base44.functions.invoke('analyzeInvoiceFull', {
        submissionId: null,
        pdfFileUrl: pdfUrl,
        xmlFileUrl: xmlUrl,
        aiExtracted: aiData,
      });

      if (res?.data?.success) {
        setResult(res.data);
        setStep('done');
        const valid = res.data.is_nota_valida;
        if (res.data.is_equipe && res.data.equipe_msg) {
          toast.success(res.data.equipe_msg);
        }
        if (valid) {
          toast.success('✅ Nota fiscal salva, analisada e backup realizado!');
        } else {
          toast.warning('⚠️ Nota salva com pendências — verifique os pontos críticos.');
        }
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
              {/* Validação de Contrato */}
              {contractValid !== null && (
                <Alert className={contractValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  {contractValid ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 text-sm">
                        ✅ Contrato válido. Prosseguir com envio de nota fiscal.
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800 text-sm">
                        {contractAlert || '❌ Nenhum contrato válido encontrado. Solicite cadastro à coordenação.'}
                      </AlertDescription>
                    </>
                  )}
                </Alert>
              )}

              {/* Informação sobre dados bancários */}
              <Alert className="border-blue-200 bg-blue-50">
               <AlertCircle className="h-4 w-4 text-blue-600" />
               <AlertDescription className="text-blue-800 text-sm">
                 <strong>💳 Dados Bancários:</strong> Seus dados bancários cadastrados serão utilizados para conferência automática com a nota fiscal.
                 {contractValid && !contractAlert && ' Se incompletos, serão lidos automaticamente do seu contrato.'}
               </AlertDescription>
              </Alert>

              {/* Auto-fill de contrato */}
              {currentUser && currentUser.email && (
               <ContractAutoFill
                 userEmail={currentUser.email}
                 onApply={(suggestions) => {
                   const applied = {};
                   for (const [key, val] of Object.entries(suggestions)) {
                     applied[key] = true;
                   }
                   setAppliedContractFields(applied);
                   setContractData(suggestions);
                   toast.info('✅ Dados do contrato carregados para preenchimento.');
                 }}
                 appliedFields={appliedContractFields}
               />
              )}
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

              {/* Mostrar status quando em análise automática */}
              {step === 'analyzing' && (
                <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando e analisando arquivos...
                </div>
              )}

              {/* Botão de avançar apenas quando análise automática completar com falha */}
              {step === 'upload' && pdfFile && xmlFile && !aiData && (
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                  <Button
                    onClick={handleAnalyzeManual}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    Analisar com IA →
                  </Button>
                </div>
              )}
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
                  <div className="text-xs text-blue-600 mt-2 pt-2 border-t border-blue-200">
                    {result?.data_origem_bancaria && <p>ℹ️ Origem: {result.data_origem_bancaria}</p>}
                  </div>
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

              {/* Mensagem de sucesso principal */}
              <div className="rounded-xl border-2 border-green-400 bg-green-50 p-5 text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-green-800 font-bold text-lg">Nota Fiscal Enviada com Sucesso!</p>
                <p className="text-green-700 text-sm mt-1">
                  Sua NF foi gravada no banco de dados{result.backup_done ? ', backup feito no Google Drive' : ''} e <strong>enviada para aprovação da coordenação</strong>.
                </p>
                <p className="text-green-600 text-xs mt-1">📧 Emails enviados para você e para os coordenadores.</p>
              </div>

              {/* Confirmação de dados bancários */}
              {result?.banco && (
               <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                 <div className="flex items-center gap-2 font-semibold text-green-800 mb-2">
                   <CheckCircle2 className="w-4 h-4" /> Dados Bancários Conferidos
                 </div>
                 <div className="text-xs text-green-700 space-y-1">
                   <p><strong>Banco:</strong> {result.banco.nome || '-'}</p>
                   <p><strong>Conta:</strong> {result.banco.conta || result.banco.pix || '-'}</p>
                   {result.data_origem_bancaria && <p className="mt-2 text-green-600">ℹ️ Dados lidos de: {result.data_origem_bancaria}</p>}
                 </div>
               </div>
              )}

              {/* Card da nota enviada */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
               <div className="flex items-center justify-between mb-3">
                 <h4 className="font-semibold text-amber-900 flex items-center gap-2">
                   <FileText className="w-4 h-4" /> Nota Fiscal Enviada
                 </h4>
                 <span className="text-xs font-semibold bg-amber-200 text-amber-800 px-3 py-1 rounded-full">
                   ⏳ Aguardando Aprovação da Coordenação
                 </span>
               </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Nº da Nota', result.nota?.numero || aiData?.numero_nota],
                    ['Valor', result.nota?.valor_total ? `R$ ${Number(result.nota.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null],
                    ['Emitente', result.emitente?.nome || aiData?.fornecedor_nome],
                    ['Data Emissão', result.nota?.data_emissao || aiData?.data_emissao],
                    ['Serviço', result.nota?.descricao_servico || aiData?.descricao_servico],
                    ['Arquivo', result.nome_arquivo],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="col-span-2 sm:col-span-1">
                      <span className="text-amber-600 text-xs">{label}: </span>
                      <span className="text-amber-900 font-medium text-xs">{val}</span>
                    </div>
                  ) : null)}
                </div>
                <div className="flex gap-3 mt-3">
                  {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center gap-1"><FileText className="w-3 h-3" />PDF</a>}
                  {xmlUrl && <a href={xmlUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center gap-1"><FileCode className="w-3 h-3" />XML</a>}
                  {result.drive_pdf_link && <a href={result.drive_pdf_link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">📁 Drive</a>}
                </div>
              </div>

              {/* Painel de conformidade */}
              <InvoiceFullAnalysisPanel result={result} />

              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleClose}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}