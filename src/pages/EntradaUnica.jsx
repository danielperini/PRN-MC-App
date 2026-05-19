import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import LoadingPage from '@/components/common/LoadingPage';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';
import ReviewModalContrato from '@/components/entrada/ReviewModalContrato';
import LinkXmlModal from '@/components/entrada/LinkXmlModal';
import LinkArquivoModal from '@/components/entrada/LinkArquivoModal';
import { backupContractIntakeToDrive, isContractIntakeType } from '@/lib/contractDriveBackup';
import {
  Loader2,
  InboxIcon,
  UploadCloud,
  FileText,
  ShieldCheck,
  Clock3,
  CheckCircle2
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
  const name = String(intake?.file_name_original || intake?.arquivo_original_url || '').toLowerCase();
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.pdf')) return 'pdf';
  return '';
}

function isReciboLike(intake) {
  const name = normalizeText(intake?.file_name_original || '');
  const ia = intake?.resultado_ia || {};
  const tipo = normalizeText(ia.tipo_documento || '');

  return (
    name.includes('recibo') ||
    name.includes('comprovante') ||
    name.includes('boleto') ||
    name.includes('pix') ||
    tipo.includes('recibo') ||
    tipo.includes('comprovante')
  );
}

function getTipoByFile(intake) {
  const mime = String(intake?.mime_type || '').toLowerCase();
  const ext = getFileExt(intake);

  if (mime.includes('xml') || ext === 'xml') return 'NOTA_FISCAL_XML';
  if (mime.includes('pdf') || ext === 'pdf') return 'NOTA_FISCAL_PDF';

  return intake?.tipo_detectado || 'OUTRO';
}

function getNFNumero(intake) {
  const ia = intake?.resultado_ia || {};
  return onlyDigits(ia.nf_numero || intake?.nf_numero || '');
}

function getValorNF(intake) {
  const ia = intake?.resultado_ia || {};
  return parseValorBR(
    ia.nf_valor_total ||
      ia.valor_total ||
      ia.valor ||
      intake?.nf_valor_total ||
      intake?.valor ||
      ''
  );
}

function getFornecedor(intake) {
  const ia = intake?.resultado_ia || {};
  return normalizeText(
    ia.nf_emitente_nome ||
      ia.fornecedor_nome ||
      intake?.nf_emitente_nome ||
      intake?.fornecedor_nome ||
      intake?.file_name_original ||
      ''
  );
}

function getCnpj(intake) {
  const ia = intake?.resultado_ia || {};
  return onlyDigits(
    ia.nf_emitente_cpf_cnpj ||
      ia.fornecedor_cpf_cnpj ||
      intake?.nf_emitente_cpf_cnpj ||
      intake?.fornecedor_cpf_cnpj ||
      ''
  );
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function normalizarResultadoNotaFiscal(resultado = {}) {
  const cpfCnpjEmitente = pickFirst(
    resultado.nf_emitente_cpf_cnpj,
    resultado.fornecedor_cpf_cnpj,
    resultado.cnpj_emitente,
    resultado.cpf_emitente,
    resultado.cpf_cnpj_emitente,
    resultado.emitente_cnpj,
    resultado.emitente_cpf,
    resultado.emitente_cpf_cnpj,
    resultado.cnpj_prestador,
    resultado.cpf_prestador,
    resultado.cpf_cnpj_prestador,
    resultado.prestador_cnpj,
    resultado.prestador_cpf,
    resultado.prestador_cpf_cnpj,
    resultado.dados_emitente?.cnpj,
    resultado.dados_emitente?.cpf,
    resultado.dados_emitente?.cpf_cnpj,
    resultado.emitente?.cnpj,
    resultado.emitente?.cpf,
    resultado.emitente?.cpf_cnpj,
    resultado.prestador?.cnpj,
    resultado.prestador?.cpf,
    resultado.prestador?.cpf_cnpj
  );

  const municipioEmitente = pickFirst(
    resultado.municipio,
    resultado.municipio_emitente,
    resultado.cidade_emitente,
    resultado.localidade_emitente,
    resultado.emitente_municipio,
    resultado.emitente_cidade,
    resultado.municipio_prestador,
    resultado.cidade_prestador,
    resultado.localidade_prestador,
    resultado.prestador_municipio,
    resultado.prestador_cidade,
    resultado.dados_emitente?.municipio,
    resultado.dados_emitente?.cidade,
    resultado.emitente?.municipio,
    resultado.emitente?.cidade,
    resultado.prestador?.municipio,
    resultado.prestador?.cidade
  );

  return {
    ...resultado,
    nf_emitente_cpf_cnpj: cpfCnpjEmitente || resultado.nf_emitente_cpf_cnpj || '',
    fornecedor_cpf_cnpj: cpfCnpjEmitente || resultado.fornecedor_cpf_cnpj || '',
    municipio: municipioEmitente || resultado.municipio || '',
  };
}

function getNomeBase(intake) {
  return normalizeText(intake?.file_name_original || intake?.file_name_final || '')
    .replace(/\.pdf$/i, '')
    .replace(/\.xml$/i, '')
    .replace(/\bpdf\b/g, '')
    .replace(/\bxml\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularScoreVinculo(a, b) {
  let score = 0;

  const nfA = getNFNumero(a);
  const nfB = getNFNumero(b);

  if (nfA && nfB && nfA === nfB) score += 4;

  const cnpjA = getCnpj(a);
  const cnpjB = getCnpj(b);

  if (cnpjA && cnpjB && cnpjA === cnpjB) score += 4;

  const valorA = getValorNF(a);
  const valorB = getValorNF(b);

  if (valorA > 0 && valorB > 0 && Math.abs(valorA - valorB) < 0.02) score += 3;

  const fornA = getFornecedor(a);
  const fornB = getFornecedor(b);

  if (
    fornA &&
    fornB &&
    (fornA.includes(fornB.slice(0, 12)) || fornB.includes(fornA.slice(0, 12)))
  ) {
    score += 2;
  }

  const nomeA = getNomeBase(a);
  const nomeB = getNomeBase(b);

  if (nomeA && nomeB) {
    const palavrasA = nomeA.split(' ').filter((p) => p.length > 2);
    const palavrasB = nomeB.split(' ').filter((p) => p.length > 2);
    const comuns = palavrasA.filter((p) => palavrasB.includes(p));

    if (comuns.length >= 4) score += 4;
    else if (comuns.length >= 2) score += 2;
  }

  return score;
}

export default function EntradaUnica() {
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [intakesLoadError, setIntakesLoadError] = useState(false);
  const [reviewIntake, setReviewIntake] = useState(null);
  const [linkXmlIntake, setLinkXmlIntake] = useState(null);
  const [linkArquivoIntake, setLinkArquivoIntake] = useState(null);

  useEffect(() => {
    let mounted = true;

    setUserLoading(true);
    setUserLoadError(false);

    base44.auth
      .me()
      .then((currentUser) => {
        if (!mounted) return;
        setUser(currentUser || null);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        setUserLoadError(true);
      })
      .finally(() => {
        if (!mounted) return;
        setUserLoading(false);
      });

    return () => {
      mounted = false;
    };
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

  const tentarVincularLista = useCallback(async (lista) => {
    const ativos = (lista || []).filter((i) => !i.ocultar_entrada_unica);
    const pdfs = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF');
    const xmls = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_XML');

    const recibos = ativos.filter((i) => {
      const tipo = i.tipo_detectado || getTipoByFile(i);
      return tipo === 'RECIBO_PDF' || isReciboLike(i);
    });

    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') continue;

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        const score = calcularScoreVinculo(xml, pdf);

        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 2) {
        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          nf_xml_intake_id: xml.id,
          nf_xml_url: xml.arquivo_original_url,
        }).catch(() => {});

        await base44.entities.DocumentIntake.update(xml.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url,
          ocultar_entrada_unica: true,
        }).catch(() => {});
      }
    }

    for (const recibo of recibos) {
      if (recibo.nf_pdf_intake_id || recibo.grupo_status === 'COMPLETO') continue;

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        const score = calcularScoreVinculo(recibo, pdf);

        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 2) {
        await base44.entities.DocumentIntake.update(recibo.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url,
          ocultar_entrada_unica: true,
          ...(melhorPdf.entidade_destino_id
            ? {
                entidade_destino_id: melhorPdf.entidade_destino_id,
                entidade_destino: 'PurchaseRequest'
              }
            : {}),
        }).catch(() => {});

        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          recibo_intake_id: recibo.id,
          recibo_url: recibo.arquivo_original_url,
        }).catch(() => {});

        if (melhorPdf.entidade_destino_id) {
          await base44.entities.Attachment.create({
            purchase_request_id: melhorPdf.entidade_destino_id,
            document_intake_id: recibo.id,
            file_name: recibo.file_name_final || recibo.file_name_original || 'comprovante.pdf',
            file_url: recibo.arquivo_original_url || '',
            file_type: recibo.mime_type || 'application/pdf',
            description: 'Comprovante/Recibo vinculado — Entrada Única',
            nf_tipo_documento: 'pdf_nf',
          }).catch(() => {});
        }
      }
    }
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;

    setLoadingIntakes(true);
    setIntakesLoadError(false);

    try {
      const list = await base44.entities.DocumentIntake.filter(
        { user_email: user.email, status_registro: 'ATIVO' },
        '-created_date',
        100
      );

      await corrigirTravados(list || []);
      await tentarVincularLista(list || []);

      const listAtualizada = await base44.entities.DocumentIntake.filter(
        { user_email: user.email, status_registro: 'ATIVO' },
        '-created_date',
        100
      );

      const filtrados = (listAtualizada || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();

        if (status === 'APROVADO') return false;
        if (status === 'ENVIADO_APROVACAO') return false;
        if (status === 'DELETADO') return false;
        if (i.ocultar_entrada_unica === true) return false;

        const tipo = i.tipo_detectado || getTipoByFile(i);
        const isXML = tipo === 'NOTA_FISCAL_XML';
        const isRecibo = tipo === 'RECIBO_PDF' || isReciboLike(i);

        if (
          (isXML || isRecibo) &&
          (i.grupo_status === 'COMPLETO' || i.nf_pdf_intake_id || i.entidade_destino_id)
        ) {
          return false;
        }

        return true;
      });

      setIntakes(filtrados);
    } catch (e) {
      console.error(e);
      setIntakesLoadError(true);
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
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: 'NOTA_FISCAL_XML'
      }).catch(() => {});
      return;
    }

    const tipoFallback = 'NOTA_FISCAL_PDF';

    const aplicarFallback = async () => {
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoFallback,
        erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.']
      }).catch(() => {});
    };

    try {
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ANALISANDO_IA'
      });

      const tipagemRapida = await Promise.race([
        base44.integrations.Core.InvokeLLM({
          prompt: `Este documento é um CONTRATO (contrato de prestação de serviços, contrato de trabalho, termo de prestação, etc.) ou uma NOTA FISCAL / RECIBO / OUTRO?
Responda apenas com uma palavra: CONTRATO ou NOTA_FISCAL ou OUTRO.`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              tipo: { type: 'string' }
            }
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000)),
      ]).catch(() => ({ tipo: 'NOTA_FISCAL' }));

      const tipoRapido = String(tipagemRapida?.tipo || '').toUpperCase();

      if (tipoRapido === 'CONTRATO' || tipoRapido === 'CONTRATO_PDF' || tipoRapido === 'TERMO_COMPROMISSO_PDF') {
        const nomeArquivoNormalizado = normalizeText(fileUrl);
        const tipoContrato =
          tipoRapido === 'TERMO_COMPROMISSO_PDF' || nomeArquivoNormalizado.includes('termo')
            ? 'TERMO_COMPROMISSO_PDF'
            : 'CONTRATO_PDF';

        await base44.entities.DocumentIntake.update(intakeId, {
          tipo_detectado: tipoContrato,
          status_processamento: 'ANALISANDO_IA',
        });

        try {
          await base44.functions.invoke('processarContratoEntradaUnica', {
            intake_id: intakeId,
            file_url: fileUrl,
            file_name: orientacoes ? undefined : undefined,
          });
        } catch (contratoErr) {
          console.error('Erro ao processar contrato:', contratoErr);

          await base44.entities.DocumentIntake.update(intakeId, {
            status_processamento: 'AGUARDANDO_REVISAO',
            tipo_detectado: tipoContrato,
            erros_validacao: ['Análise de contrato falhou. Revise manualmente.'],
          }).catch(() => {});
        }

        await backupContractIntakeToDrive({
          intake: {
            id: intakeId,
            tipo_detectado: tipoContrato,
            arquivo_original_url: fileUrl,
            file_name_original: '',
            user_email: user?.email || ''
          },
          currentUser: user,
          linkType: ''
        }).then((result) => {
          if (result?.success) {
            toast.success('Contrato vinculado ao app. Backup salvo no Drive.');
          } else if (result && !result.skipped) {
            toast.warning('Contrato vinculado ao app. Backup no Drive nao foi concluido.');
          }
        }).catch(() => {});

        return;
      }

      const prompt = `Você é um especialista em notas fiscais, XML fiscal, recibos e comprovantes brasileiros.
Analise o documento anexado e extraia os campos em JSON.

REGRA CRÍTICA:
- Os campos nf_emitente_cpf_cnpj e municipio são OBRIGATÓRIOS quando existirem na nota fiscal.
- Leia o PDF inteiro, inclusive cabeçalho, rodapé, bloco do prestador/emitente e dados cadastrais.
- Use sempre os dados do EMITENTE/PRESTADOR/FORNECEDOR.
- Nunca use CPF/CNPJ ou município do TOMADOR/DESTINATÁRIO.
- Se o documento tiver prestador de serviço, o prestador é o emitente.
- Se algum desses campos não existir no documento, retorne string vazia.

Se for recibo, comprovante, boleto ou comprovante PIX, classifique como RECIBO_PDF.

{
  "tipo_documento": "NOTA_FISCAL_PDF | NOTA_FISCAL_XML | RECIBO_PDF | DOCUMENTO_ADMINISTRATIVO | OUTRO",
  "nf_numero": "número da NF (somente dígitos ou alfanumérico exato)",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_valor_total": número,
  "nf_emitente_nome": "razão social completa do EMITENTE/PRESTADOR/FORNECEDOR",
  "nf_emitente_cpf_cnpj": "CPF ou CNPJ do EMITENTE/PRESTADOR/FORNECEDOR, somente dígitos",
  "fornecedor_cpf_cnpj": "mesmo CPF ou CNPJ do EMITENTE/PRESTADOR/FORNECEDOR, somente dígitos",
  "nf_destinatario_nome": "razão social do destinatário/tomador",
  "descricao_servico": "descrição completa do serviço ou produto fornecido",
  "municipio": "município do EMITENTE/PRESTADOR/FORNECEDOR",
  "municipio_emitente": "município do EMITENTE/PRESTADOR/FORNECEDOR",
  "cidade_emitente": "cidade do EMITENTE/PRESTADOR/FORNECEDOR",
  "estado": "UF do emitente/prestador/fornecedor",
  "competencia": "Mês/Ano de referência (ex: Março/2026)",
  "centro_custo_sugerido": "MIS | MHAB | MUMO | Geral | Atuação Geral",
  "banco": "nome do banco do emitente se informado no documento",
  "agencia": "número da agência bancária se informado",
  "conta": "número da conta bancária se informado",
  "tipo_conta": "Corrente | Poupança se informado",
  "pix": "chave pix se informada",
  "meta_sugerida": "MC3A-20 | MC3A-21 | MC3A-22 | MC3A-23 | MC3A-24 | MC3A-25 | MC3A-EXTRA",
  "tipo_gasto": "Produto | Serviço",
  "categoria_sugerida": "categoria do gasto",
  "rubrica_nome_sugerida": "nome da rubrica orçamentária mais provável",
  "justificativa_ia": "em 1-2 frases explique porque classificou assim"
}
${orientacoes ? `\nOrientações do usuário: ${orientacoes}` : ''}
Retorne apenas o JSON válido, sem explicações adicionais.`;

      const resultado = await Promise.race([
        base44.integrations.Core.InvokeLLM({
          prompt,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              tipo_documento: { type: 'string' },
              nf_numero: { type: 'string' },
              nf_data_emissao: { type: 'string' },
              nf_valor_total: { type: 'number' },
              nf_emitente_nome: { type: 'string' },
              nf_emitente_cpf_cnpj: { type: 'string' },
              fornecedor_cpf_cnpj: { type: 'string' },
              cnpj_emitente: { type: 'string' },
              cpf_cnpj_emitente: { type: 'string' },
              nf_destinatario_nome: { type: 'string' },
              descricao_servico: { type: 'string' },
              municipio: { type: 'string' },
              municipio_emitente: { type: 'string' },
              cidade_emitente: { type: 'string' },
              estado: { type: 'string' },
              competencia: { type: 'string' },
              centro_custo_sugerido: { type: 'string' },
              banco: { type: 'string' },
              agencia: { type: 'string' },
              conta: { type: 'string' },
              tipo_conta: { type: 'string' },
              pix: { type: 'string' },
              meta_sugerida: { type: 'string' },
              tipo_gasto: { type: 'string' },
              categoria_sugerida: { type: 'string' },
              rubrica_nome_sugerida: { type: 'string' },
              justificativa_ia: { type: 'string' },
            },
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000)),
      ]);

      const resultadoNormalizado = normalizarResultadoNotaFiscal(resultado || {});

      const tipoDetectado =
        resultadoNormalizado?.tipo_documento === 'NOTA_FISCAL_XML'
          ? 'NOTA_FISCAL_XML'
          : resultadoNormalizado?.tipo_documento === 'RECIBO_PDF'
            ? 'RECIBO_PDF'
            : resultadoNormalizado?.tipo_documento === 'NOTA_FISCAL_PDF'
              ? 'NOTA_FISCAL_PDF'
              : isReciboLike({
                  file_name_original: fileUrl,
                  resultado_ia: resultadoNormalizado
                })
                ? 'RECIBO_PDF'
                : tipoFallback;

      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoDetectado,
        resultado_ia: resultadoNormalizado,
        nf_emitente_cpf_cnpj: resultadoNormalizado?.nf_emitente_cpf_cnpj || '',
        fornecedor_cpf_cnpj:
          resultadoNormalizado?.fornecedor_cpf_cnpj ||
          resultadoNormalizado?.nf_emitente_cpf_cnpj ||
          '',
        municipio: resultadoNormalizado?.municipio || '',
        centro_custo: resultadoNormalizado?.centro_custo_sugerido || '',
        rubrica_nome_sugerida: resultadoNormalizado?.rubrica_nome_sugerida || '',
        rubrica_justificativa: resultadoNormalizado?.justificativa_ia || '',
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
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ANALISANDO_IA',
        erros_validacao: []
      });

      await loadIntakes();

      await analisarComIA(
        intake.id,
        intake.arquivo_original_url,
        intake.mime_type,
        intake.resultado_ia?.orientacoes_usuario
      );
    } catch (e) {
      console.error('Erro no reprocessamento:', e);
    } finally {
      await loadIntakes();
    }
  }

  async function handleLinkXml(xmlIntake) {
    setLinkXmlIntake(xmlIntake);
  }

  function handleLinkArquivo(intake) {
    setLinkArquivoIntake(intake);
  }

  async function handleConfirmLinkArquivo(origemIntake, alvoIntake) {
    try {
      const origemTipo = origemIntake.tipo_detectado || getTipoByFile(origemIntake);
      const alvoTipo = alvoIntake.tipo_detectado || getTipoByFile(alvoIntake);

      const pdfNF =
        origemTipo === 'NOTA_FISCAL_PDF'
          ? origemIntake
          : alvoTipo === 'NOTA_FISCAL_PDF'
            ? alvoIntake
            : null;

      const outro = pdfNF?.id === origemIntake.id ? alvoIntake : origemIntake;
      const outreTipo = outro.tipo_detectado || getTipoByFile(outro);

      const purchaseId =
        pdfNF?.entidade_destino_id ||
        origemIntake.entidade_destino_id ||
        alvoIntake.entidade_destino_id ||
        '';

      if (pdfNF) {
        const pdfUpdate = {};

        if (outreTipo === 'NOTA_FISCAL_XML') {
          pdfUpdate.nf_xml_intake_id = outro.id;
          pdfUpdate.nf_xml_url = outro.arquivo_original_url;
        } else {
          pdfUpdate.recibo_intake_id = outro.id;
          pdfUpdate.recibo_url = outro.arquivo_original_url;
        }

        await base44.entities.DocumentIntake.update(pdfNF.id, pdfUpdate);

        await base44.entities.DocumentIntake.update(outro.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: pdfNF.id,
          nf_pdf_url: pdfNF.arquivo_original_url,
          ocultar_entrada_unica: true,
          ...(purchaseId
            ? {
                entidade_destino_id: purchaseId,
                entidade_destino: 'PurchaseRequest'
              }
            : {}),
        });

        if (purchaseId) {
          await base44.entities.Attachment.create({
            purchase_request_id: purchaseId,
            document_intake_id: outro.id,
            file_name: outro.file_name_final || outro.file_name_original || 'arquivo.pdf',
            file_url: outro.arquivo_original_url || '',
            file_type: outro.mime_type || 'application/pdf',
            description:
              outreTipo === 'NOTA_FISCAL_XML'
                ? 'XML da NF — vinculado manualmente'
                : 'Comprovante/Recibo — vinculado manualmente',
            nf_tipo_documento: outreTipo === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
          }).catch(() => {});
        }
      } else {
        await base44.entities.DocumentIntake.update(origemIntake.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: alvoIntake.id,
          ocultar_entrada_unica: true,
        });

        await base44.entities.DocumentIntake.update(alvoIntake.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: origemIntake.id,
          ocultar_entrada_unica: true,
        });
      }

      toast.success('Arquivos vinculados com sucesso.');
      setLinkArquivoIntake(null);
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao vincular arquivo:', e);
      toast.error('Erro ao vincular: ' + (e?.message || e));
    }
  }

  async function handleConfirmLinkXml(xmlIntake, pdfIntake) {
    try {
      await base44.entities.DocumentIntake.update(pdfIntake.id, {
        grupo_status: 'COMPLETO',
        nf_xml_intake_id: xmlIntake.id,
        nf_xml_url: xmlIntake.arquivo_original_url
      });

      await base44.entities.DocumentIntake.update(xmlIntake.id, {
        grupo_status: 'COMPLETO',
        nf_pdf_intake_id: pdfIntake.id,
        nf_pdf_url: pdfIntake.arquivo_original_url,
        ocultar_entrada_unica: true
      });

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
        user_email: user.email,
        user_name: user.full_name || user.email,
        arquivo_original_url: file_url,
        file_name_original: xmlFile.name,
        mime_type: xmlFile.type,
        status_processamento: 'AGUARDANDO_REVISAO',
        status_registro: 'ATIVO',
        tipo_detectado: 'NOTA_FISCAL_XML',
        revisado_pelo_usuario: false,
        resultado_ia: {},
      });

      await base44.entities.DocumentIntake.update(pdfIntake.id, {
        grupo_status: 'COMPLETO',
        nf_xml_intake_id: xmlIntake.id,
        nf_xml_url: file_url
      });

      await base44.entities.DocumentIntake.update(xmlIntake.id, {
        grupo_status: 'COMPLETO',
        nf_pdf_intake_id: pdfIntake.id,
        nf_pdf_url: pdfIntake.arquivo_original_url,
        ocultar_entrada_unica: true,
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: 'NOTA_FISCAL_XML'
      });

      toast.success('XML vinculado à nota fiscal com sucesso.');
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao adicionar XML ao PDF:', e);
      toast.error('Erro ao vincular XML: ' + (e?.message || e));
    }
  }

  async function handleFilesSelected(files, orientacoes) {
    if (!user || !files || files.length === 0) return;

    setUploading(true);

    let successCount = 0;
    const failedFiles = [];
    const intakesCriados = [];

    for (const file of files) {
      try {
        let fileToUpload = file;

        if (
          file.name.toLowerCase().endsWith('.xml') &&
          (!file.type || file.type === 'application/octet-stream')
        ) {
          fileToUpload = new File([file], file.name, { type: 'text/xml' });
        }

        const uploadResult = await base44.integrations.Core.UploadFile({
          file: fileToUpload
        });

        if (!uploadResult?.file_url) {
          throw new Error('URL do arquivo não retornada pelo servidor');
        }

        const { file_url } = uploadResult;

        const ext = file.name.toLowerCase().endsWith('.xml')
          ? 'NOTA_FISCAL_XML'
          : file.name.toLowerCase().endsWith('.pdf')
            ? 'NOTA_FISCAL_PDF'
            : 'PENDENTE';

        const isXmlFile = ext === 'NOTA_FISCAL_XML';

        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: fileToUpload.type || file.type,
          status_processamento: isXmlFile ? 'AGUARDANDO_REVISAO' : 'ENVIADO',
          status_registro: 'ATIVO',
          tipo_detectado: ext,
          revisado_pelo_usuario: false,
          resultado_ia: orientacoes ? { orientacoes_usuario: orientacoes } : {},
        });

        intakesCriados.push({
          intake,
          file_url,
          mime_type: fileToUpload.type || file.type
        });

        successCount++;
      } catch (e) {
        console.error(`Erro ao enviar arquivo "${file.name}":`, e);
        failedFiles.push(file.name);
      }
    }

    setUploading(false);

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) enviado(s). Analisando com IA...`);
    }

    if (failedFiles.length > 0) {
      toast.error(`Falha ao enviar: ${failedFiles.join(', ')}`);
    }

    await loadIntakes();

    for (const { intake, file_url, mime_type } of intakesCriados) {
      if (intake?.id) {
        analisarComIA(intake.id, file_url, mime_type, orientacoes)
          .then(() => loadIntakes())
          .catch(() => {});
      }
    }
  }

  function handleReview(intake) {
    setReviewIntake(intake);
  }

  async function handleSaved() {
    if (reviewIntake && reviewIntake.tipo_detectado === 'FOTO_ATIVIDADE') {
      try {
        await base44.functions.invoke('processarFotoEntradaUnica', {
          intake_id: reviewIntake.id,
          file_url: reviewIntake.arquivo_original_url,
          file_name: reviewIntake.file_name_original || reviewIntake.file_name_final,
          user_email: user.email,
          user_name: user.full_name || user.email
        });
      } catch (err) {
        console.error('Erro ao processar foto:', err);
        toast.error('Erro ao encaminhar foto para galeria');
      }
    }

    await loadIntakes();
    setReviewIntake(null);
  }

  function handleDeleted(id) {
    setIntakes((prev) => prev.filter((i) => i.id !== id));
  }

  function handleSentToApproval(id) {
    setIntakes((prev) => prev.filter((i) => i.id !== id));
    toast.success('Enviado para aprovação com sucesso.');
  }

  const tipo = reviewIntake?.tipo_detectado;
  const isNF = tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML';
  const isFoto = tipo === 'FOTO_ATIVIDADE';
  const isDocAdmin = tipo === 'DOCUMENTO_ADMINISTRATIVO';
  const isContrato = isContractIntakeType(tipo);

  const isInitialPageLoading = userLoading || (!!user && loadingIntakes);

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando seus documentos, vínculos, pendências e dados de análise da Entrada Única. Aguarde alguns instantes."
      />
    );
  }

  if ((userLoadError && !user) || intakesLoadError) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a Entrada Única"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

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
                  <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">
                    Contratos, termos e notas fiscais
                  </h1>
                  <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                    Envie PDF, XML e documentos administrativos para análise, conferência e envio para aprovação.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
                    Pendentes
                  </p>
                  <p className="text-2xl font-bold text-black mt-1">
                    {intakes.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
                    IA
                  </p>
                  <p className="text-2xl font-bold text-black mt-1">
                    {
                      intakes.filter(
                        (i) =>
                          String(i.status_processamento || '').toUpperCase() ===
                          'ANALISANDO_IA'
                      ).length
                    }
                  </p>
                </div>

                <div className="rounded-2xl border border-black bg-black px-4 py-3 shadow-sm text-white">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-300">
                    Revisão
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {
                      intakes.filter(
                        (i) =>
                          String(i.status_processamento || '').toUpperCase() ===
                          'AGUARDANDO_REVISAO'
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <DocumentUploadZone
              onFilesSelected={handleFilesSelected}
              uploading={uploading}
              disabled={!user}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-black" />
              </div>

              <div>
                <p className="text-sm font-semibold text-black">PDF e XML</p>
                <p className="text-xs text-gray-500">Vinculação automática ou manual.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Clock3 className="w-5 h-5 text-black" />
              </div>

              <div>
                <p className="text-sm font-semibold text-black">Análise assistida</p>
                <p className="text-xs text-gray-500">Se a IA travar, libera revisão manual.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-black" />
              </div>

              <div>
                <p className="text-sm font-semibold text-black">Fluxo de aprovação</p>
                <p className="text-xs text-gray-500">Após conferência, segue para Compras.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black flex items-center gap-2">
                <InboxIcon className="w-4 h-4 text-black" />
                Documentos em análise
                {intakes.length > 0 && (
                  <span className="ml-1 text-xs font-semibold text-gray-500 rounded-full border border-gray-200 px-2 py-0.5">
                    {intakes.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Revise, vincule XML, reanalise ou envie documentos para aprovação.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-black" />
              Backend como fonte da verdade
            </div>
          </div>

          <div className="p-4 md:p-6">
            {intakes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <InboxIcon className="w-11 h-11 mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-600">Nenhum documento pendente</p>
                <p className="text-xs mt-1 text-gray-400">Faça o upload de arquivos acima para começar.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {intakes.map((intake) => (
                  <DocumentIntakeCard
                    key={intake.id}
                    intake={intake}
                    allIntakes={intakes}
                    onReview={handleReview}
                    onDeleted={handleDeleted}
                    onSentToApproval={handleSentToApproval}
                    onReanalyse={handleReanalyse}
                    onLinkXml={handleLinkXml}
                    onAddXmlToPdf={handleAddXmlToPdf}
                    onLinkArquivo={handleLinkArquivo}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {reviewIntake && isNF && (
          <ReviewModalNF
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved}
          />
        )}

        {reviewIntake && isFoto && (
          <ReviewModalFoto
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved}
          />
        )}

        {reviewIntake && isDocAdmin && (
          <ReviewModalDocAdmin
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved}
          />
        )}

        {reviewIntake && isContrato && (
          <ReviewModalContrato
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved}
          />
        )}

        {reviewIntake && !isNF && !isFoto && !isDocAdmin && !isContrato && (
          <ReviewModalOutro
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved}
          />
        )}

        {linkXmlIntake && (
          <LinkXmlModal
            xmlIntake={linkXmlIntake}
            pdfsDisponiveis={intakes.filter(
              (i) =>
                getTipoByFile(i) === 'NOTA_FISCAL_PDF' &&
                !i.nf_xml_intake_id &&
                i.grupo_status !== 'COMPLETO'
            )}
            onConfirm={(pdfIntake) => handleConfirmLinkXml(linkXmlIntake, pdfIntake)}
            onClose={() => setLinkXmlIntake(null)}
          />
        )}

        {linkArquivoIntake &&
          (() => {
            const candidatos = intakes.filter((i) => {
              if (i.id === linkArquivoIntake.id) return false;
              if (i.grupo_status === 'COMPLETO') return false;
              if (i.nf_pdf_intake_id) return false;
              return true;
            });

            return (
              <LinkArquivoModal
                intake={linkArquivoIntake}
                candidatos={candidatos}
                onConfirm={(alvo) => handleConfirmLinkArquivo(linkArquivoIntake, alvo)}
                onClose={() => setLinkArquivoIntake(null)}
              />
            );
          })()}
      </div>
    </div>
  );
}
