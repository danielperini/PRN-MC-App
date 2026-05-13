import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';
import LinkXmlModal from '@/components/entrada/LinkXmlModal';
import {
  Loader2,
  InboxIcon,
  UploadCloud,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ReceiptText
} from 'lucide-react';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseValorBR(value) {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

function getFileExt(intake) {
  const name = String(intake?.file_name_original || intake?.file_name_final || intake?.arquivo_original_url || '').toLowerCase();
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.pdf')) return 'pdf';
  return '';
}

function isReciboLike(intake) {
  const txt = normalizeText([
    intake?.file_name_original,
    intake?.file_name_final,
    intake?.tipo_detectado,
    intake?.tipo_documental,
    intake?.categoria_documental,
    intake?.resultado_ia?.tipo_documento,
    intake?.resultado_ia?.categoria_sugerida,
    intake?.resultado_ia?.descricao_servico,
  ].filter(Boolean).join(' '));

  return txt.includes('recibo') ||
    txt.includes('comprovante') ||
    txt.includes('pagamento') ||
    txt.includes('pix') ||
    txt.includes('boleto') ||
    txt.includes('transferencia') ||
    txt.includes('ted');
}

function getTipoByFile(intake) {
  const mime = String(intake?.mime_type || '').toLowerCase();
  const ext = getFileExt(intake);
  if (mime.includes('xml') || ext === 'xml') return 'NOTA_FISCAL_XML';
  if (isReciboLike(intake)) return 'RECIBO_PDF';
  if (mime.includes('pdf') || ext === 'pdf') return 'NOTA_FISCAL_PDF';
  return intake?.tipo_detectado || 'OUTRO';
}

function getNFNumero(intake) {
  const ia = intake?.resultado_ia || {};
  return onlyDigits(ia.nf_numero || intake?.nf_numero || '');
}

function getValorNF(intake) {
  const ia = intake?.resultado_ia || {};
  return parseValorBR(ia.nf_valor_total || ia.valor_total || ia.valor || intake?.nf_valor_total || intake?.valor || '');
}

function getFornecedor(intake) {
  const ia = intake?.resultado_ia || {};
  return normalizeText(ia.nf_emitente_nome || ia.fornecedor_nome || intake?.nf_emitente_nome || intake?.fornecedor_nome || intake?.file_name_original || '');
}

function getCnpj(intake) {
  const ia = intake?.resultado_ia || {};
  return onlyDigits(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || intake?.fornecedor_cpf_cnpj || '');
}

function getNomeBase(intake) {
  return normalizeText(intake?.file_name_original || intake?.file_name_final || '')
    .replace(/\.pdf$/i, '')
    .replace(/\.xml$/i, '')
    .replace(/\b(pdf|xml|recibo|comprovante|pagamento|boleto|pix|nfe|nfse|nf|nota|fiscal|museus|centro)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularScoreVinculo(a, b) {
  let score = 0;
  const nfA = getNFNumero(a); const nfB = getNFNumero(b);
  if (nfA && nfB && nfA === nfB) score += 4;
  const cnpjA = getCnpj(a); const cnpjB = getCnpj(b);
  if (cnpjA && cnpjB && cnpjA === cnpjB) score += 4;
  const valorA = getValorNF(a); const valorB = getValorNF(b);
  if (valorA > 0 && valorB > 0 && Math.abs(valorA - valorB) < 0.02) score += 3;
  const fornA = getFornecedor(a); const fornB = getFornecedor(b);
  if (fornA && fornB && (fornA.includes(fornB.slice(0, 12)) || fornB.includes(fornA.slice(0, 12)))) score += 2;
  const nomeA = getNomeBase(a); const nomeB = getNomeBase(b);
  if (nomeA && nomeB) {
    const palavrasA = nomeA.split(' ').filter((p) => p.length > 2);
    const palavrasB = nomeB.split(' ').filter((p) => p.length > 2);
    const comuns = palavrasA.filter((p) => palavrasB.includes(p));
    if (comuns.length >= 4) score += 4;
    else if (comuns.length >= 2) score += 2;
  }
  return score;
}

function getGrupoId(...ids) {
  return ids.filter(Boolean).map(String).sort().join('__');
}

function isDocumentoVinculado(intake) {
  return !!(
    intake?.grupo_documental_id ||
    intake?.nf_pdf_intake_id ||
    intake?.nf_xml_intake_id ||
    intake?.recibo_pdf_id ||
    intake?.comprovante_pdf_id ||
    intake?.documento_pai_id ||
    intake?.vinculado_a_intake_id ||
    intake?.grupo_status === 'COMPLETO'
  );
}

function getTipoCurto(intake) {
  const tipo = getTipoByFile(intake);
  if (tipo === 'NOTA_FISCAL_XML') return 'XML';
  if (tipo === 'RECIBO_PDF') return 'RECIBO';
  if (tipo === 'NOTA_FISCAL_PDF') return 'PDF';
  return 'DOC';
}

function getLabelArquivo(intake) {
  const ia = intake?.resultado_ia || {};
  const nf = getNFNumero(intake);
  const valor = getValorNF(intake);
  const fornecedor = ia.nf_emitente_nome || ia.fornecedor_nome || intake?.nf_emitente_nome || intake?.fornecedor_nome || intake?.file_name_original || 'arquivo';
  const valorTxt = valor ? ` — R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
  return `${getTipoCurto(intake)}${nf ? ` NF ${nf}` : ''} — ${fornecedor}${valorTxt}`;
}

export default function EntradaUnica() {
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [todosIntakes, setTodosIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [reviewIntake, setReviewIntake] = useState(null);
  const [linkXmlIntake, setLinkXmlIntake] = useState(null);
  const [manualBaseId, setManualBaseId] = useState('');
  const [manualComplementoId, setManualComplementoId] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const corrigirTravados = useCallback(async (lista) => {
    const agora = Date.now();
    for (const item of lista || []) {
      const status = String(item.status_processamento || '').toUpperCase();
      if (status !== 'ANALISANDO_IA') continue;
      const created = new Date(item.updated_date || item.created_date || 0).getTime();
      const passouTempo = created && agora - created > 45000;
      if (!passouTempo) continue;
      await base44.entities.DocumentIntake.update(item.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: getTipoByFile(item),
        erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.'],
      }).catch(() => {});
    }
  }, []);

  async function vincularPdfXml(pdf, xml) {
    if (!pdf?.id || !xml?.id || pdf.id === xml.id) return;
    const grupoId = getGrupoId(pdf.id, xml.id);
    await base44.entities.DocumentIntake.update(pdf.id, {
      grupo_status: 'COMPLETO', grupo_documental_id: grupoId,
      nf_xml_intake_id: xml.id, nf_xml_url: xml.arquivo_original_url,
      arquivo_complementar_tipo: 'XML', arquivo_complementar_status: 'VINCULADO', arquivo_complementar_dispensado: false,
    }).catch(() => {});
    await base44.entities.DocumentIntake.update(xml.id, {
      grupo_status: 'COMPLETO', grupo_documental_id: grupoId,
      nf_pdf_intake_id: pdf.id, nf_pdf_url: pdf.arquivo_original_url,
      vinculado_a_intake_id: pdf.id, ocultar_entrada_unica: true, arquivo_complementar_status: 'VINCULADO',
    }).catch(() => {});
  }

  async function vincularPdfRecibo(pdf, recibo) {
    if (!pdf?.id || !recibo?.id || pdf.id === recibo.id) return;
    const grupoId = getGrupoId(pdf.id, recibo.id);
    await base44.entities.DocumentIntake.update(pdf.id, {
      grupo_status: 'COMPLETO', grupo_documental_id: grupoId,
      recibo_pdf_id: recibo.id, comprovante_pdf_id: recibo.id, comprovante_url: recibo.arquivo_original_url,
      arquivo_complementar_tipo: 'RECIBO', arquivo_complementar_status: 'VINCULADO', arquivo_complementar_dispensado: false,
    }).catch(() => {});
    await base44.entities.DocumentIntake.update(recibo.id, {
      grupo_status: 'COMPLETO', grupo_documental_id: grupoId,
      documento_pai_id: pdf.id, vinculado_a_intake_id: pdf.id,
      nf_pdf_intake_id: pdf.id, nf_pdf_url: pdf.arquivo_original_url,
      ocultar_entrada_unica: true, arquivo_complementar_status: 'VINCULADO',
    }).catch(() => {});
  }

  const tentarVincularLista = useCallback(async (lista) => {
    const ativos = (lista || []).filter((i) => !i.ocultar_entrada_unica && String(i.status_registro || 'ATIVO').toUpperCase() !== 'DELETADO');
    const pdfs = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF' && !isReciboLike(i));
    const xmls = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_XML');
    const recibos = ativos.filter((i) => getTipoByFile(i) === 'RECIBO_PDF');
    const usados = new Set();

    for (const pdf of pdfs) {
      if (isDocumentoVinculado(pdf) || usados.has(pdf.id)) continue;
      let melhorXml = null; let melhorScoreXml = 0;
      for (const xml of xmls) {
        if (isDocumentoVinculado(xml) || usados.has(xml.id)) continue;
        const score = calcularScoreVinculo(pdf, xml);
        if (score > melhorScoreXml) { melhorScoreXml = score; melhorXml = xml; }
      }
      if (melhorXml && melhorScoreXml >= 2) {
        await vincularPdfXml(pdf, melhorXml);
        usados.add(pdf.id); usados.add(melhorXml.id);
      }
    }

    for (const pdf of pdfs) {
      if (isDocumentoVinculado(pdf) || usados.has(pdf.id)) continue;
      let melhorRecibo = null; let melhorScoreRecibo = 0;
      for (const recibo of recibos) {
        if (isDocumentoVinculado(recibo) || usados.has(recibo.id)) continue;
        const score = calcularScoreVinculo(pdf, recibo);
        if (score > melhorScoreRecibo) { melhorScoreRecibo = score; melhorRecibo = recibo; }
      }
      if (melhorRecibo && melhorScoreRecibo >= 2) {
        await vincularPdfRecibo(pdf, melhorRecibo);
        usados.add(pdf.id); usados.add(melhorRecibo.id);
      }
    }
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;
    setLoadingIntakes(true);
    try {
      const list = await base44.entities.DocumentIntake.filter({ user_email: user.email, status_registro: 'ATIVO' }, '-created_date', 200);
      await corrigirTravados(list || []);
      await tentarVincularLista(list || []);
      const listAtualizada = await base44.entities.DocumentIntake.filter({ user_email: user.email, status_registro: 'ATIVO' }, '-created_date', 200);
      setTodosIntakes(listAtualizada || []);
      const filtrados = (listAtualizada || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();
        if (status === 'APROVADO' || status === 'ENVIADO_APROVACAO' || status === 'DELETADO') return false;
        if (i.ocultar_entrada_unica === true) return false;
        const isXML = getTipoByFile(i) === 'NOTA_FISCAL_XML';
        if (isXML && (i.grupo_status === 'COMPLETO' || i.nf_pdf_intake_id || i.entidade_destino_id)) return false;
        const isRecibo = getTipoByFile(i) === 'RECIBO_PDF';
        if (isRecibo && (i.grupo_status === 'COMPLETO' || i.documento_pai_id || i.vinculado_a_intake_id)) return false;
        return true;
      });
      setIntakes(filtrados);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIntakes(false);
    }
  }, [user, corrigirTravados, tentarVincularLista]);

  useEffect(() => {
    if (user) loadIntakes();
  }, [user, loadIntakes]);

  async function analisarComIA(intakeId, fileUrl, mimeType, orientacoes) {
    const isPDF = mimeType?.includes('pdf') || fileUrl?.toLowerCase().endsWith('.pdf');
    const isXML = mimeType?.includes('xml') || fileUrl?.toLowerCase().endsWith('.xml');
    if (!isPDF && !isXML) return;
    if (isXML) {
      await base44.entities.DocumentIntake.update(intakeId, { status_processamento: 'AGUARDANDO_REVISAO', tipo_detectado: 'NOTA_FISCAL_XML' }).catch(() => {});
      return;
    }
    const tipoFallback = 'NOTA_FISCAL_PDF';
    const aplicarFallback = async () => {
      await base44.entities.DocumentIntake.update(intakeId, { status_processamento: 'AGUARDANDO_REVISAO', tipo_detectado: tipoFallback, erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.'] }).catch(() => {});
    };
    try {
      await base44.entities.DocumentIntake.update(intakeId, { status_processamento: 'ANALISANDO_IA' });
      const prompt = `Você é um especialista em notas fiscais, XML fiscal, recibos e comprovantes brasileiros.
Analise o documento e extraia os campos em JSON.
Se for recibo, comprovante, boleto ou comprovante PIX, classifique como RECIBO_PDF.

{
  "tipo_documento": "NOTA_FISCAL_PDF | NOTA_FISCAL_XML | RECIBO_PDF | DOCUMENTO_ADMINISTRATIVO | OUTRO",
  "nf_numero": "número da NF se existir",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_valor_total": número,
  "nf_emitente_nome": "razão social completa do emitente/prestador",
  "nf_emitente_cpf_cnpj": "somente dígitos do CPF ou CNPJ do emitente",
  "nf_destinatario_nome": "razão social do destinatário/tomador",
  "descricao_servico": "descrição completa",
  "municipio": "município",
  "estado": "UF",
  "competencia": "Mês/Ano",
  "centro_custo_sugerido": "MIS | MHAB | MUMO | Geral",
  "meta_sugerida": "MC3A-20 | MC3A-21 | MC3A-22 | MC3A-23 | MC3A-24 | MC3A-25 | MC3A-EXTRA",
  "tipo_gasto": "Produto | Serviço",
  "categoria_sugerida": "categoria do gasto",
  "rubrica_nome_sugerida": "rubrica provável",
  "justificativa_ia": "1-2 frases"
}
${orientacoes ? `\nOrientações do usuário: ${orientacoes}` : ''}
Retorne apenas JSON válido.`;
      const resultado = await Promise.race([
        base44.integrations.Core.InvokeLLM({ prompt, file_urls: [fileUrl] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000)),
      ]);
      const tipoDetectado = resultado?.tipo_documento === 'NOTA_FISCAL_XML'
        ? 'NOTA_FISCAL_XML'
        : resultado?.tipo_documento === 'RECIBO_PDF'
          ? 'RECIBO_PDF'
          : resultado?.tipo_documento === 'NOTA_FISCAL_PDF'
            ? 'NOTA_FISCAL_PDF'
            : isReciboLike({ file_name_original: fileUrl, resultado_ia: resultado }) ? 'RECIBO_PDF' : tipoFallback;
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoDetectado,
        resultado_ia: resultado || {},
        centro_custo: resultado?.centro_custo_sugerido || '',
        rubrica_nome_sugerida: resultado?.rubrica_nome_sugerida || '',
        rubrica_justificativa: resultado?.justificativa_ia || '',
      });
      await loadIntakes();
    } catch (err) {
      console.error('Erro na análise por IA:', err);
      await aplicarFallback();
      await loadIntakes();
    }
  }

  async function handleReanalyse(intake) {
    try {
      await base44.entities.DocumentIntake.update(intake.id, { status_processamento: 'ANALISANDO_IA', erros_validacao: [] });
      await loadIntakes();
      await analisarComIA(intake.id, intake.arquivo_original_url, intake.mime_type, intake.resultado_ia?.orientacoes_usuario);
    } catch (e) {
      console.error('Erro no reprocessamento:', e);
    } finally {
      await loadIntakes();
    }
  }

  async function handleLinkXml(xmlIntake) { setLinkXmlIntake(xmlIntake); }

  async function handleConfirmLinkXml(xmlIntake, pdfIntake) {
    try {
      await vincularPdfXml(pdfIntake, xmlIntake);
      toast.success('XML vinculado à nota fiscal com sucesso.');
      setLinkXmlIntake(null);
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao vincular XML:', e);
      toast.error('Erro ao vincular XML: ' + (e?.message || e));
    }
  }

  async function handleAddXmlToPdf(pdfIntake, xmlFile) {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: xmlFile });
      const xmlIntake = await base44.entities.DocumentIntake.create({
        user_email: user.email, user_name: user.full_name || user.email,
        arquivo_original_url: file_url, file_name_original: xmlFile.name,
        mime_type: xmlFile.type, status_processamento: 'AGUARDANDO_REVISAO',
        status_registro: 'ATIVO', tipo_detectado: 'NOTA_FISCAL_XML',
        revisado_pelo_usuario: false, resultado_ia: {},
      });
      await vincularPdfXml(pdfIntake, xmlIntake);
      toast.success('XML vinculado à nota fiscal com sucesso.');
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao adicionar XML ao PDF:', e);
      toast.error('Erro ao vincular XML: ' + (e?.message || e));
    }
  }

  async function marcarSemComplemento(intake, motivo = 'Usuário informou que não possui arquivo complementar neste momento.') {
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        arquivo_complementar_dispensado: true,
        arquivo_complementar_status: 'DISPENSADO_PELO_USUARIO',
        arquivo_complementar_motivo: motivo,
      });
      toast.success('Arquivo complementar marcado como não disponível.');
      await loadIntakes();
    } catch (e) {
      toast.error('Erro ao marcar complemento: ' + (e?.message || e));
    }
  }

  async function vincularManual() {
    const base = todosIntakes.find((i) => String(i.id) === String(manualBaseId));
    const complemento = todosIntakes.find((i) => String(i.id) === String(manualComplementoId));

    if (!base || !complemento || base.id === complemento.id) {
      toast.error('Selecione uma nota fiscal e um arquivo complementar diferente.');
      return;
    }
    if (isDocumentoVinculado(complemento)) {
      toast.error('Este arquivo complementar já está vinculado a outro documento.');
      return;
    }

    setManualSaving(true);
    try {
      const tipoComp = getTipoByFile(complemento);
      if (tipoComp === 'NOTA_FISCAL_XML') await vincularPdfXml(base, complemento);
      else await vincularPdfRecibo(base, complemento);
      toast.success('Arquivo complementar vinculado com sucesso.');
      setManualBaseId(''); setManualComplementoId('');
      await loadIntakes();
    } catch (e) {
      toast.error('Erro ao vincular arquivo: ' + (e?.message || e));
    } finally {
      setManualSaving(false);
    }
  }

  async function handleFilesSelected(files, orientacoes) {
    if (!user || !files || files.length === 0) return;
    setUploading(true);
    let successCount = 0; let errorCount = 0;
    const intakesCriados = [];
    for (const file of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const fileNameLower = file.name.toLowerCase();
        const tipoDetectado = fileNameLower.endsWith('.xml')
          ? 'NOTA_FISCAL_XML'
          : isReciboLike({ file_name_original: file.name })
            ? 'RECIBO_PDF'
            : fileNameLower.endsWith('.pdf')
              ? 'NOTA_FISCAL_PDF'
              : 'PENDENTE';
        const isXmlFile = tipoDetectado === 'NOTA_FISCAL_XML';
        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email, user_name: user.full_name || user.email,
          arquivo_original_url: file_url, file_name_original: file.name,
          mime_type: file.type, status_processamento: isXmlFile ? 'AGUARDANDO_REVISAO' : 'ENVIADO',
          status_registro: 'ATIVO', tipo_detectado: tipoDetectado,
          arquivo_complementar_status: 'PENDENTE',
          revisado_pelo_usuario: false, resultado_ia: orientacoes ? { orientacoes_usuario: orientacoes } : {},
        });
        intakesCriados.push({ intake, file_url, mime_type: file.type });
        successCount++;
      } catch (e) {
        console.error('Erro ao enviar arquivo:', e);
        errorCount++;
      }
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s). Analisando e tentando vincular automaticamente...`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) falharam ao enviar.`);
    await loadIntakes();
    for (const { intake, file_url, mime_type } of intakesCriados) {
      if (intake?.id) {
        analisarComIA(intake.id, file_url, mime_type, orientacoes).then(() => loadIntakes()).catch(() => {});
      }
    }
  }

  function handleReview(intake) { setReviewIntake(intake); }
  async function handleSaved() { await loadIntakes(); setReviewIntake(null); }
  function handleDeleted(id) { setIntakes((prev) => prev.filter((i) => i.id !== id)); }
  function handleSentToApproval(id) { setIntakes((prev) => prev.filter((i) => i.id !== id)); toast.success('Enviado para aprovação com sucesso.'); }

  const arquivosSemVinculo = useMemo(() => {
    return (todosIntakes || []).filter((i) => {
      if (!i?.id || i.status_registro === 'DELETADO' || i.ocultar_entrada_unica) return false;
      const tipo = getTipoByFile(i);
      if (!['NOTA_FISCAL_XML', 'RECIBO_PDF', 'NOTA_FISCAL_PDF'].includes(tipo)) return false;
      return !isDocumentoVinculado(i);
    });
  }, [todosIntakes]);

  const pdfsSemPar = arquivosSemVinculo.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF' && !isReciboLike(i));
  const complementosSemPar = arquivosSemVinculo.filter((i) => ['NOTA_FISCAL_XML', 'RECIBO_PDF'].includes(getTipoByFile(i)));

  const tipo = reviewIntake?.tipo_detectado;
  const isNF = tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML' || tipo === 'RECIBO_PDF';
  const isFoto = tipo === 'FOTO_ATIVIDADE';
  const isDocAdmin = tipo === 'DOCUMENTO_ADMINISTRATIVO';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 md:p-7 border-b border-gray-100 bg-gradient-to-br from-white via-white to-gray-50">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                  <UploadCloud className="w-3.5 h-3.5 text-black" />
                  Entrada Única
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">Contratos, termos e notas fiscais</h1>
                  <p className="text-sm text-gray-500 mt-1 max-w-2xl">Envie PDF, XML, recibos e documentos administrativos para análise, conferência e envio para aprovação.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Pendentes</p><p className="text-2xl font-bold text-black mt-1">{intakes.length}</p></div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">IA</p><p className="text-2xl font-bold text-black mt-1">{intakes.filter((i) => String(i.status_processamento || '').toUpperCase() === 'ANALISANDO_IA').length}</p></div>
                <div className="rounded-2xl border border-black bg-black px-4 py-3 shadow-sm text-white"><p className="text-[11px] uppercase tracking-wide font-semibold text-gray-300">Revisão</p><p className="text-2xl font-bold mt-1">{intakes.filter((i) => String(i.status_processamento || '').toUpperCase() === 'AGUARDANDO_REVISAO').length}</p></div>
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6"><DocumentUploadZone onFilesSelected={handleFilesSelected} uploading={uploading} disabled={!user} /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><FileText className="w-5 h-5 text-black" /></div><div><p className="text-sm font-semibold text-black">PDF e XML</p><p className="text-xs text-gray-500">Vinculação automática ou manual.</p></div></div></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><ReceiptText className="w-5 h-5 text-black" /></div><div><p className="text-sm font-semibold text-black">Recibos</p><p className="text-xs text-gray-500">Comprovante/recibo vinculado como par.</p></div></div></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-black" /></div><div><p className="text-sm font-semibold text-black">Fluxo de aprovação</p><p className="text-xs text-gray-500">Após conferência, segue para Compras.</p></div></div></div>
        </div>

        {arquivosSemVinculo.length > 0 && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/60 shadow-sm overflow-hidden">
            <div className="px-5 md:px-6 py-4 border-b border-amber-100"><h2 className="text-base font-semibold text-amber-950 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-700" />Arquivos fiscais sem vínculo</h2><p className="text-xs text-amber-800 mt-0.5">Selecione uma NF PDF e um XML ou recibo/comprovante. Cada complemento só pode ser vinculado uma vez.</p></div>
            <div className="p-4 md:p-6 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div className="space-y-1"><label className="text-xs font-semibold text-amber-900">Nota fiscal PDF</label><select value={manualBaseId} onChange={(e) => setManualBaseId(e.target.value)} className="w-full h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-gray-800"><option value="">Selecione a NF PDF</option>{pdfsSemPar.map((item) => <option key={item.id} value={item.id}>{getLabelArquivo(item)}</option>)}</select></div>
                <div className="space-y-1"><label className="text-xs font-semibold text-amber-900">XML ou recibo/comprovante</label><select value={manualComplementoId} onChange={(e) => setManualComplementoId(e.target.value)} className="w-full h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-gray-800"><option value="">Selecione o complemento</option>{complementosSemPar.map((item) => <option key={item.id} value={item.id}>{getLabelArquivo(item)}</option>)}</select></div>
                <button type="button" onClick={vincularManual} disabled={manualSaving || !manualBaseId || !manualComplementoId} className="h-10 rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:opacity-40">{manualSaving ? 'Vinculando...' : 'Vincular'}</button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-amber-900">{pdfsSemPar.slice(0, 8).map((item) => (<button key={item.id} type="button" onClick={() => marcarSemComplemento(item)} className="rounded-full border border-amber-200 bg-white px-3 py-1 hover:bg-amber-100">Não tenho complemento: {getNFNumero(item) ? `NF ${getNFNumero(item)}` : item.file_name_original}</button>))}</div>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div><h2 className="text-base font-semibold text-black flex items-center gap-2"><InboxIcon className="w-4 h-4 text-black" />Documentos em análise{!loadingIntakes && intakes.length > 0 && (<span className="ml-1 text-xs font-semibold text-gray-500 rounded-full border border-gray-200 px-2 py-0.5">{intakes.length}</span>)}</h2><p className="text-xs text-gray-500 mt-0.5">Revise, vincule XML/recibo, reanalise ou envie documentos para aprovação.</p></div>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"><CheckCircle2 className="w-3.5 h-3.5 text-black" />Backend como fonte da verdade</div>
          </div>
          <div className="p-4 md:p-6">
            {loadingIntakes ? (<div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando documentos...</div>) : intakes.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50"><InboxIcon className="w-11 h-11 mb-3 text-gray-300" /><p className="text-sm font-semibold text-gray-600">Nenhum documento pendente</p><p className="text-xs mt-1 text-gray-400">Faça o upload de arquivos acima para começar.</p></div>) : (<div className="space-y-3">{intakes.map((intake) => (<DocumentIntakeCard key={intake.id} intake={intake} onReview={handleReview} onDeleted={handleDeleted} onSentToApproval={handleSentToApproval} onReanalyse={handleReanalyse} onLinkXml={handleLinkXml} onAddXmlToPdf={handleAddXmlToPdf} />))}</div>)}
          </div>
        </div>

        {reviewIntake && isNF && (<ReviewModalNF intake={reviewIntake} onClose={() => setReviewIntake(null)} onSaved={handleSaved} />)}
        {reviewIntake && isFoto && (<ReviewModalFoto intake={reviewIntake} onClose={() => setReviewIntake(null)} onSaved={handleSaved} />)}
        {reviewIntake && isDocAdmin && (<ReviewModalDocAdmin intake={reviewIntake} onClose={() => setReviewIntake(null)} onSaved={handleSaved} />)}
        {reviewIntake && !isNF && !isFoto && !isDocAdmin && (<ReviewModalOutro intake={reviewIntake} onClose={() => setReviewIntake(null)} onSaved={handleSaved} />)}
        {linkXmlIntake && (<LinkXmlModal xmlIntake={linkXmlIntake} pdfsDisponiveis={intakes.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF' && !i.nf_xml_intake_id && i.grupo_status !== 'COMPLETO')} onConfirm={(pdfIntake) => handleConfirmLinkXml(linkXmlIntake, pdfIntake)} onClose={() => setLinkXmlIntake(null)} />)}
      </div>
    </div>
  );
}
