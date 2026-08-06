import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { isCoordenador, COORD_GERAL_EMAILS } from '@/components/auth/permissions';
import { Link } from 'react-router-dom';
import {
  Loader2,
  InboxIcon,
  UploadCloud,
  FileText,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Mail,
  Link2,
  FileSignature,
  ArrowRight,
  Settings,
  Send,
  Sparkles,
  Zap } from
'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ImportarPacoteRelatorios from '@/components/entrada/ImportarPacoteRelatorios';
import PainelConciliacaoComprovantes from '@/components/compras/PainelConciliacaoComprovantes';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import MonitoramentoFila from '@/components/entrada/MonitoramentoFila';
import ReprocessarFilaModal from '@/components/entrada/ReprocessarFilaModal';
import useAutoProcessarFilaCompleta from '@/hooks/useAutoProcessarFilaCompleta';
import useReclassificarComprovantesSilencioso from '@/hooks/useReclassificarComprovantesSilencioso';

function normalizeText(value) {
  return String(value || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toLowerCase().
  replace(/\s+/g, ' ').
  trim();
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
    tipo.includes('comprovante'));

}

function isOrcamentoLike(intake) {
  const name = normalizeText(intake?.file_name_original || '');
  const ia = intake?.resultado_ia || {};
  const tipo = normalizeText(ia.tipo_documento || '');

  // Orçamento/proposta: nome contém "orcamento", "orçamento", "proposta", "cotação", "budget"
  // e NÃO contém "NF " (número de NF) no nome
  const temIndicioOrcamento =
  name.includes('orcamento') ||
  name.includes('orçamento') ||
  name.includes('proposta') ||
  name.includes('cotacao') ||
  name.includes('cotaçao') ||
  name.includes('budget') ||
  tipo.includes('orcamento') ||
  tipo.includes('proposta');


  // Se tem "NF " seguido de número, provavelmente é NF real
  const temNFnoNome = /\bnf\s*\d+/i.test(name) || /\bnota\s+fiscal\b/i.test(name);

  // Só classifica como orçamento se NÃO tem indícios de NF no nome
  return temIndicioOrcamento && !temNFnoNome;
}

function getTipoByFile(intake) {
  const mime = String(intake?.mime_type || '').toLowerCase();
  const ext = getFileExt(intake);
  const name = normalizeText(intake?.file_name_original || '');

  if (mime.includes('xml') || ext === 'xml') return 'NOTA_FISCAL_XML';

  // Verificar se é orçamento pelo nome antes de classificar como NF PDF
  if (isOrcamentoLike(intake)) return 'DOCUMENTO_ADMINISTRATIVO';

  // Comprovante/recibo: nome contém COMP, BOL, recibo, comprovante
  const isComp = /\b(comp|bol|boleto|recibo|comprovante|pix|pagamento)\b/i.test(name);
  if (isComp && (mime.includes('pdf') || ext === 'pdf')) return 'RECIBO_PDF';

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
    municipio: municipioEmitente || resultado.municipio || ''
  };
}

function getNomeBase(intake) {
  return normalizeText(intake?.file_name_original || intake?.file_name_final || '').
  replace(/\.pdf$/i, '').
  replace(/\.xml$/i, '').
  replace(/\bpdf\b/g, '').
  replace(/\bxml\b/g, '').
  replace(/\s+/g, ' ').
  trim();
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
  fornB && (
  fornA.includes(fornB.slice(0, 12)) || fornB.includes(fornA.slice(0, 12))))
  {
    score += 2;
  }

  const nomeA = getNomeBase(a);
  const nomeB = getNomeBase(b);

  if (nomeA && nomeB) {
    const palavrasA = nomeA.split(' ').filter((p) => p.length > 2);
    const palavrasB = nomeB.split(' ').filter((p) => p.length > 2);
    const comuns = palavrasA.filter((p) => palavrasB.includes(p));

    if (comuns.length >= 4) score += 4;else
    if (comuns.length >= 2) score += 2;
  }

  return score;
}

// ---- Matching por percentual (threshold 85%) para vínculo XML <-> PDF ----
function normalizarNomeBaseArquivo(value) {
  return normalizeText(value || '')
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/\b(comp|comprovante|boleto|bol|recibo|pix|pagamento)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairNumeroNFDoNome(value) {
  const m = String(value || '').match(/(?:^|\D)(\d{3,})/);
  return m ? m[1] : '';
}

function extrairValorDoNome(value) {
  const m = String(value || '').match(/r\$?\s*([\d.,]+)/i);
  return m ? m[1] : '';
}

function jaccardTokens(a, b) {
  const setA = new Set(a.split(' ').filter((p) => p.length > 1));
  const setB = new Set(b.split(' ').filter((p) => p.length > 1));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function matchPercentualXmlPdf(xml, pdf) {
  const xmlNome = normalizarNomeBaseArquivo(xml?.file_name_original || xml?.file_name_final || '');
  const pdfNome = normalizarNomeBaseArquivo(pdf?.file_name_original || pdf?.file_name_final || '');

  const xmlNfObj = getNFNumero(xml) || extrairNumeroNFDoNome(xmlNome);
  const pdfNfObj = getNFNumero(pdf) || extrairNumeroNFDoNome(pdfNome);

  const xmlValorObj = getValorNF(xml) || Number((extrairValorDoNome(xmlNome) || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const pdfValorObj = getValorNF(pdf) || Number((extrairValorDoNome(pdfNome) || '0').replace(/\./g, '').replace(',', '.')) || 0;

  // Match por número de NF + valor
  if (xmlNfObj && pdfNfObj && xmlNfObj === pdfNfObj) {
    if (xmlValorObj > 0 && pdfValorObj > 0 && Math.abs(xmlValorObj - pdfValorObj) < 0.02) return 100;
    return 92;
  }

  // Match por nome base identico
  if (xmlNome && pdfNome && xmlNome === pdfNome) return 100;

  // Jaccard alto
  if (xmlNome && pdfNome) {
    const j = jaccardTokens(xmlNome, pdfNome);
    if (j >= 0.85) return Math.round(j * 100);
  }

  return 0;
}

export default function EntradaUnica() {
  const [user, setUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [intakesLoadError, setIntakesLoadError] = useState(false);
  const [reviewIntake, setReviewIntake] = useState(null);
  const [linkXmlIntake, setLinkXmlIntake] = useState(null);
  const [linkArquivoIntake, setLinkArquivoIntake] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncGmailLoading, setSyncGmailLoading] = useState(false);
  const [autoVinculoLoading, setAutoVinculoLoading] = useState(false);
  const [filaProcessando, setFilaProcessando] = useState(false);
  const [progressoFila, setProgressoFila] = useState({ atual: 0, total: 0 });
  const [padronizarLoading, setPadronizarLoading] = useState(false);
  const [syncNFsRootLoading, setSyncNFsRootLoading] = useState(false);
  const [syncNFsRootResult, setSyncNFsRootResult] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('pendentes'); // 'pendentes' | 'processados'
  const [processados, setProcessados] = useState([]);
  const filaRef = useRef([]);
  const abortarRef = useRef(false);
  const retryingRef = useRef(false);
  const jaVinculouRef = useRef(false);
  const [higienizarLoading, setHigienizarLoading] = useState(false);
  const [preenchendoIAHistorico, setPreenchendoIAHistorico] = useState(false);
  const [enviandoCoordenacaoLote, setEnviandoCoordenacaoLote] = useState(false);
  const [conciliarEnviandoLote, setConciliarEnviandoLote] = useState(false);
  const [reprocessarFilaOpen, setReprocessarFilaOpen] = useState(false);

  // Reutilizado por handleEnviarCoordenacaoLote e handleConciliarEEnviarTudo.
  // Cria PurchaseRequest (SOLICITADO), Attachment, atualiza DocumentIntake para
  // ENVIADO_APROVACAO + ocultar_entrada_unica=true e gera Notification in-app
  // (sem e-mail) para os coordenadores gerais. Retorna { ok, motivo }.
  async function enviarIntakeParaAprovacao(intake) {
    try {
      const ia = intake.resultado_ia || {};
      const rubrica_id = intake.rubrica_id_sugerida || intake.rubrica_id || ia.rubrica_id;
      const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
      const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || intake.nf_valor_total || 0);
      const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';

      if (!rubrica_id || !centro_custo || !valor) {
        return { ok: false, motivo: 'rubrica/centro_custo/valor ausente' };
      }

      const rubrica = await base44.entities.Rubrica.get(rubrica_id).catch(() => null);
      const rubrica_nome = rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || intake.rubrica_nome_sugerida || '';

      const novaPurchase = await base44.entities.PurchaseRequest.create({
        descricao_item: ia.descricao_servico || ia.nf_emitente_nome || intake.fornecedor_nome || fileName,
        fornecedor_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
        fornecedor_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
        valor_solicitado: valor,
        valor_total: valor,
        valor: valor,
        rubrica_id,
        rubrica_nome,
        budgetline_id: rubrica_id,
        centro_custo,
        nota_fiscal_url: intake.arquivo_original_url || '',
        arquivo_url: intake.arquivo_original_url || '',
        status: 'SOLICITADO',
        origem: 'EntradaUnica',
        intake_id: intake.id,
        documento_intake_id: intake.id,
        nf_numero: ia.nf_numero || intake.nf_numero || '',
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || intake.nf_data_emissao || '',
      });

      await base44.entities.Attachment.create({
        purchase_request_id: novaPurchase?.id || '',
        document_intake_id: intake.id,
        file_name: fileName,
        file_url: intake.arquivo_original_url || '',
        file_type: intake.mime_type || 'application/pdf',
        description: 'Entrada Única — envio para aprovação (conciliação automática)',
        nf_tipo_documento: 'pdf_nf',
        nf_numero: ia.nf_numero || intake.nf_numero || '',
        nf_valor_total: valor,
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || intake.nf_data_emissao || '',
        nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
        nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
        rubrica_id,
        rubrica_nome,
      }).catch(() => null);

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: novaPurchase?.id || '',
      });

      // Notificação in-app para coordenadores (sem e-mail — e-mails pausados)
      await Promise.all(
        COORD_GERAL_EMAILS.map((email) =>
          base44.entities.Notification.create({
            user_email: email,
            type: 'INVOICE_SUBMITTED',
            title: 'NF enviada para aprovação',
            message: `${fileName} — R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ${ia.nf_emitente_nome || intake.fornecedor_nome || ''}`,
            entity_type: 'PurchaseRequest',
            entity_id: novaPurchase?.id || '',
            action_url: '/Compras',
            read: false,
            email_sent: false,
          }).catch(() => {})
        )
      );

      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String(e?.message || e) };
    }
  }

  useEffect(() => {
    let mounted = true;

    setUserLoading(true);
    setUserLoadError(false);

    (async () => {
      let currentUser = null;
      try {
        currentUser = await base44.auth.me();
      } catch {
        if (mounted) setUserLoadError(true);
      }

      if (mounted) setUser(currentUser || null);

      if (currentUser?.email) {
        try {
          const perms = await base44.entities.UserPermission.filter({ user_email: currentUser.email });
          if (mounted) setUserPermission(perms?.[0] || null);
        } catch {
          // silencioso — canSeeAll apenas com role=admin
        }
      }

      if (mounted) setUserLoading(false);
    })().catch(() => {
      if (!mounted) return;
      setUserLoadError(true);
      setUserLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  const corrigirTravados = useCallback(async (lista) => {
    if (!Array.isArray(lista) || lista.length === 0) return;

    const agora = Date.now();

    for (const item of lista) {
      if (!item?.id) continue;
      const status = String(item.status_processamento || '').toUpperCase();

      // Libera documentos travados em ENVIADO há mais de 3 minutos para revisão manual
      if (status === 'ENVIADO') {
        const created = new Date(item.updated_date || item.created_date || 0).getTime();
        const passouTempo = created && agora - created > 180000; // 3 minutos
        if (passouTempo) {
          await base44.entities.DocumentIntake.update(item.id, {
            status_processamento: 'AGUARDANDO_REVISAO',
            tipo_detectado: getTipoByFile(item),
            erros_validacao: ['IA não iniciou a análise. Revise manualmente.']
          }).catch(() => {});
        }
        continue;
      }

      if (status !== 'ANALISANDO_IA') continue;

      const created = new Date(item.updated_date || item.created_date || 0).getTime();
      // Timeout aumentado para 120s para documentos grandes
      const passouTempo = created && agora - created > 120000;

      if (!passouTempo) continue;

      // Tentar reanalisar automaticamente em vez de desistir
      try {
        await analisarComIA(
          item.id,
          item.arquivo_original_url,
          item.mime_type,
          item.resultado_ia?.orientacoes_usuario
        );
      } catch (e) {
        // Se falhar novamente, libera para revisão manual
        await base44.entities.DocumentIntake.update(item.id, {
          status_processamento: 'AGUARDANDO_REVISAO',
          tipo_detectado: getTipoByFile(item),
          erros_validacao: [`IA não conseguiu concluir após 2 tentativas. Erro: ${e?.message || 'timeout'}. Revise manualmente.`]
        }).catch(() => {});
      }
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

    let xmlVinculadosCount = 0;
    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') continue;

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        if (pdf.nf_xml_intake_id || pdf.grupo_status === 'COMPLETO') continue;
        const score = matchPercentualXmlPdf(xml, pdf);

        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 85) {
        xmlVinculadosCount++;
        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          nf_xml_intake_id: xml.id,
          nf_xml_url: xml.arquivo_original_url,
          xml_obrigatorio_pendente: false,
          enviado_sem_xml: false,
          xml_pendente_desde: null
        }).catch(() => {});

        await base44.entities.DocumentIntake.update(xml.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url,
          ocultar_entrada_unica: true
        }).catch(() => {});
      }
    }

    let reciboVinculadosCount = 0;
    for (const recibo of recibos) {
      if (recibo.nf_pdf_intake_id || recibo.grupo_status === 'COMPLETO') continue;

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        if (pdf.nf_xml_intake_id || pdf.recibo_intake_id || pdf.grupo_status === 'COMPLETO') continue;
        const score = calcularScoreVinculo(recibo, pdf);

        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 2) {
        reciboVinculadosCount++;
        await base44.entities.DocumentIntake.update(recibo.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url,
          ocultar_entrada_unica: true,
          ...(melhorPdf.entidade_destino_id ?
          {
            entidade_destino_id: melhorPdf.entidade_destino_id,
            entidade_destino: 'PurchaseRequest'
          } :
          {})
        }).catch(() => {});

        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          recibo_intake_id: recibo.id,
          recibo_url: recibo.arquivo_original_url
        }).catch(() => {});

        if (melhorPdf.entidade_destino_id) {
          await base44.entities.Attachment.create({
            purchase_request_id: melhorPdf.entidade_destino_id,
            document_intake_id: recibo.id,
            file_name: recibo.file_name_final || recibo.file_name_original || 'comprovante.pdf',
            file_url: recibo.arquivo_original_url || '',
            file_type: recibo.mime_type || 'application/pdf',
            description: 'Comprovante/Recibo vinculado — Entrada Única',
            nf_tipo_documento: 'pdf_nf'
          }).catch(() => {});
        }
      }
    }

    return {
      vinculadosXml: xmlVinculadosCount,
      vinculadosRecibo: reciboVinculadosCount,
    };
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;

    setLoadingIntakes(true);
    setIntakesLoadError(false);

    const base = String(userPermission?.base_role || '').toUpperCase();
    const canSeeAll = user?.role === 'admin' || base.includes('COORD') || base.includes('ADMIN') || isCoordenador(user);

    try {
      // Tenta filter com timeout de 15s — em vez de rejeitar, resolve null e cai no fallback
      let list = null;
      try {
        const query = { status_registro: 'ATIVO' };
        if (!canSeeAll) query.user_email = user.email;
        list = await Promise.race([
        base44.entities.DocumentIntake.filter(
          query,
          '-created_date',
          200
        ),
        new Promise((resolve) => setTimeout(() => resolve(null), 15000))]
        );
      } catch (filterErr) {
        console.warn('Filter falhou/timeout, usando list() como fallback:', filterErr?.message);
        list = null;
      }

      // Fallback: só quando o filter realmente falhou (lista vazia é resultado válido)
      if (!list) {
        const all = await base44.entities.DocumentIntake.list('-created_date', 200);
        list = (all || []).filter(
          (d) => {
            if (d.status_registro === 'REMOVIDO') return false;
            if (!canSeeAll && d.user_email !== user.email) return false;
            return true;
          }
        ).slice(0, 200);
      }

      // Correções em background (leves). Vinculação automática roda apenas sob
      // ação do administrador, para não estourar o limite de requisições.
      corrigirTravados(list || []).catch(() => {});

      const filtrados = (list || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();

        if (status === 'APROVADO') return false;
        if (status === 'ENVIADO_APROVACAO') return false;
        if (status === 'DELETADO') return false;
        if (i.ocultar_entrada_unica === true) return false;

        const tipo = i.tipo_detectado || getTipoByFile(i);
        const isXML = tipo === 'NOTA_FISCAL_XML';
        const isRecibo = tipo === 'RECIBO_PDF' || isReciboLike(i);

        if (
        (isXML || isRecibo) && (
        i.grupo_status === 'COMPLETO' || i.nf_pdf_intake_id || i.entidade_destino_id))
        {
          return false;
        }

        return true;
      });

      // Documentos já processados (aprovados, enviados para aprovação ou vinculados)
      const jaProcessados = (list || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();
        return status === 'APROVADO' || status === 'ENVIADO_APROVACAO';
      }).sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date));

      setIntakes(filtrados);
      setProcessados(jaProcessados);

      // Vínculo automático XML↔PDF ao carregar — uma vez por sessão
      if (!jaVinculouRef.current && (list || []).length > 0) {
        jaVinculouRef.current = true;
        tentarVincularLista(list || [])
          .then((res) => {
            if (res && (res.vinculadosXml > 0 || res.vinculadosRecibo > 0)) {
              loadIntakes();
            }
          })
          .catch(() => {});
      }

      return { filtrados, jaProcessados };
    } catch (e) {
      console.error('loadIntakes fatal:', e);
      // Limite de requisições: aguarda e tenta uma vez antes de mostrar erro
      if (e?.status === 429 && !retryingRef.current) {
        retryingRef.current = true;
        setTimeout(() => {
          retryingRef.current = false;
          loadIntakes();
        }, 4000);
      } else {
        setIntakesLoadError(true);
      }
    } finally {
      setLoadingIntakes(false);
    }
  }, [user, userPermission, corrigirTravados, tentarVincularLista]);

  useEffect(() => {
    if (user) loadIntakes();
  }, [user, loadIntakes]);

  const base = String(userPermission?.base_role || '').toUpperCase();

  const { disparar: dispararAutoPipeline } = useAutoProcessarFilaCompleta({
    canSeeAll: user?.role === 'admin' || base.includes('COORD') || base.includes('ADMIN') || isCoordenador(user),
    loadingIntakes,
    loadIntakes,
  });

  // Reclassificação automática e silenciosa de comprovantes de pagamento mal
  // classificados como NOTA_FISCAL_PDF (somente registros novos < 24h). Aplica
  // a regra determinística no nome do arquivo (+fallback IA) e, se houver
  // mudanças, recarrega a fila.
  useReclassificarComprovantesSilencioso(loadIntakes);

  // Dispara o pipeline automático UMA vez após a primeira carga de intakes
  useEffect(() => {
    if (!user) return;
    if (loadingIntakes) return;
    const podeVer =
      user.role === 'admin' ||
      base.includes('COORD') ||
      base.includes('ADMIN') ||
      isCoordenador(user);
    if (!podeVer) return;
    if (intakes.length === 0 && processados.length === 0) return;
    dispararAutoPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingIntakes]);

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
        prompt: `Este documento é um CONTRATO (contrato de prestação de serviços, contrato de trabalho, termo de prestação), um ORCAMENTO (proposta comercial, cotação, orçamento sem número de NF) ou uma NOTA FISCAL / RECIBO / OUTRO?
Responda apenas com uma palavra: CONTRATO ou ORCAMENTO ou NOTA_FISCAL ou OUTRO.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string' }
          }
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))]
      ).catch(() => ({ tipo: 'NOTA_FISCAL' }));

      const tipoRapido = String(tipagemRapida?.tipo || '').toUpperCase();

      if (tipoRapido === 'ORCAMENTO' || tipoRapido === 'PROPOSTA') {
        await base44.entities.DocumentIntake.update(intakeId, {
          tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
          status_processamento: 'AGUARDANDO_REVISAO',
          erros_validacao: ['Este documento é um ORÇAMENTO/PROPOSTA, não uma nota fiscal.']
        }).catch(() => {});
        await loadIntakes();
        return;
      }

      if (tipoRapido === 'CONTRATO' || tipoRapido === 'CONTRATO_PDF' || tipoRapido === 'TERMO_COMPROMISSO_PDF') {
        const nomeArquivoNormalizado = normalizeText(fileUrl);
        const tipoContrato =
        tipoRapido === 'TERMO_COMPROMISSO_PDF' || nomeArquivoNormalizado.includes('termo') ?
        'TERMO_COMPROMISSO_PDF' :
        'CONTRATO_PDF';

        await base44.entities.DocumentIntake.update(intakeId, {
          tipo_detectado: tipoContrato,
          status_processamento: 'ANALISANDO_IA'
        });

        try {
          await base44.functions.invoke('processarContratoEntradaUnica', {
            intake_id: intakeId,
            file_url: fileUrl,
            file_name: orientacoes ? undefined : undefined
          });
        } catch (contratoErr) {
          console.error('Erro ao processar contrato:', contratoErr);

          await base44.entities.DocumentIntake.update(intakeId, {
            status_processamento: 'AGUARDANDO_REVISAO',
            tipo_detectado: tipoContrato,
            erros_validacao: ['Análise de contrato falhou. Revise manualmente.']
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

      const hoje = new Date().toISOString().slice(0, 10);
      const prompt = `Você é um especialista em notas fiscais, XML fiscal, recibos e comprovantes brasileiros.
Analise o documento anexado INTEGRALMENTE e extraia TODOS os campos disponíveis em JSON.

A data atual é ${hoje}. Não sinalize datas passadas como "futuras".

REGRA CRÍTICA:
- TODO documento PDF DEVE ser analisado 100%. Não pare no meio. Leia cada página.
- Os campos nf_emitente_cpf_cnpj, municipio, nf_numero, nf_valor_total, nf_data_emissao e descricao_servico são OBRIGATÓRIOS quando existirem.
- Extraia o HORÁRIO de emissão se visível (campo nf_horario_emissao no formato HH:MM:SS).
- Leia o PDF inteiro, inclusive cabeçalho, rodapé, bloco do prestador/emitente, dados cadastrais, dados bancários.
- Use sempre os dados do EMITENTE/PRESTADOR/FORNECEDOR.
- Nunca use CPF/CNPJ, município ou endereço do TOMADOR/DESTINATÁRIO.
- Se o documento tiver prestador de serviço, o prestador é o emitente.
- Se algum campo não existir no documento, retorne string vazia.
- Só marque como duplicata se TODOS os 4 campos coincidirem exatamente: mesmo CNPJ do emitente + mesmo número da NF + mesmo valor total + mesma data de emissão.

IMPORTANTE — CLASSIFICAÇÃO DO TIPO DE DOCUMENTO:
- Se o documento tem número de nota fiscal, CNPJ/CPF de emitente, valor total e data de emissão → é NOTA_FISCAL_PDF.
- Se o documento é um ORÇAMENTO/PROPOSTA/COTAÇÃO (tem título como "Orçamento", "Proposta Comercial", "Cotação", NÃO tem número de NF, pode ter validade da proposta, condições de pagamento) → classifique como DOCUMENTO_ADMINISTRATIVO.
- DOCUMENTO_ADMINISTRATIVO é para documentos sem características fiscais: atas, ofícios, declarações, autorizações, certidões, relatórios internos, orçamentos, propostas.
- Se houver qualquer indício de nota fiscal (número NF, DANFE, CFOP, natureza da operação, dados do FISCO) → classifique como NOTA_FISCAL_PDF.
- Recibo, comprovante, boleto ou comprovante PIX → classifique como RECIBO_PDF.

{
  "tipo_documento": "NOTA_FISCAL_PDF | NOTA_FISCAL_XML | RECIBO_PDF | DOCUMENTO_ADMINISTRATIVO | OUTRO",
  "nf_numero": "número da NF (somente dígitos ou alfanumérico exato)",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_horario_emissao": "HH:MM:SS (horário exato de emissão se visível na nota)",
  "nf_valor_total": número,
  "nf_emitente_nome": "razão social completa do EMITENTE/PRESTADOR/FORNECEDOR",
  "nf_emitente_cpf_cnpj": "CPF ou CNPJ do EMITENTE/PRESTADOR/FORNECEDOR, somente dígitos",
  "fornecedor_cpf_cnpj": "mesmo CPF ou CNPJ do EMITENTE/PRESTADOR/FORNECEDOR, somente dígitos",
  "fornecedor_nome": "razão social do fornecedor/emitente",
  "nf_destinatario_nome": "razão social do destinatário/tomador",
  "nf_destinatario_cpf_cnpj": "CPF ou CNPJ do destinatário/tomador, somente dígitos",
  "descricao_servico": "descrição COMPLETA do serviço ou produto, sem abreviar",
  "municipio": "município do EMITENTE/PRESTADOR/FORNECEDOR",
  "municipio_emitente": "município do EMITENTE/PRESTADOR/FORNECEDOR",
  "cidade_emitente": "cidade do EMITENTE/PRESTADOR/FORNECEDOR",
  "estado": "UF do emitente/prestador/fornecedor",
  "endereco_emitente": "endereço completo do emitente",
  "competencia": "Mês/Ano de referência (ex: Março/2026)",
  "centro_custo_sugerido": "MIS | MHAB | MUMO | Geral | Atuação Geral | Noturno",
  "banco": "nome do banco do emitente se informado no documento",
  "agencia": "número da agência bancária se informado",
  "conta": "número da conta bancária se informado",
  "tipo_conta": "Corrente | Poupança se informado",
  "pix": "chave pix se informada",
  "meta_sugerida": "MC3A-20 | MC3A-21 | MC3A-22 | MC3A-23 | MC3A-24 | MC3A-25 | MC3A-EXTRA",
  "tipo_gasto": "Produto | Serviço",
  "categoria_sugerida": "categoria do gasto",
  "rubrica_nome_sugerida": "nome da rubrica orçamentária mais provável",
  "justificativa_ia": "em 1-2 frases explique porque classificou assim",
  "indicios_duplicidade": "se houver, descreva indícios de que esta NF pode ser duplicata de outra",
  "inconsistencias": ["lista de problemas encontrados no documento, como CNPJ inválido, valor divergente, data incoerente"]
}
${orientacoes ? `\nOrientações do usuário: ${orientacoes}` : ''}
Retorne apenas o JSON válido, sem explicações adicionais.`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [fileUrl],
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            tipo_documento: { type: 'string' },
            nf_numero: { type: 'string' },
            nf_data_emissao: { type: 'string' },
            nf_horario_emissao: { type: 'string' },
            nf_valor_total: { type: 'number' },
            nf_emitente_nome: { type: 'string' },
            nf_emitente_cpf_cnpj: { type: 'string' },
            fornecedor_cpf_cnpj: { type: 'string' },
            fornecedor_nome: { type: 'string' },
            cnpj_emitente: { type: 'string' },
            cpf_cnpj_emitente: { type: 'string' },
            nf_destinatario_nome: { type: 'string' },
            nf_destinatario_cpf_cnpj: { type: 'string' },
            descricao_servico: { type: 'string' },
            municipio: { type: 'string' },
            municipio_emitente: { type: 'string' },
            cidade_emitente: { type: 'string' },
            estado: { type: 'string' },
            endereco_emitente: { type: 'string' },
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
            indicios_duplicidade: { type: 'string' },
            inconsistencias: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      const resultadoNormalizado = normalizarResultadoNotaFiscal(resultado || {});

      // Se a análise rápida já identificou como NOTA_FISCAL, não permitir que a análise detalhada classifique como DOCUMENTO_ADMINISTRATIVO.
      // DOCUMENTO_ADMINISTRATIVO só é válido quando a análise rápida retornou OUTRO.
      const tipoDetectado =
      resultadoNormalizado?.tipo_documento === 'NOTA_FISCAL_XML' ?
      'NOTA_FISCAL_XML' :
      resultadoNormalizado?.tipo_documento === 'RECIBO_PDF' ?
      'RECIBO_PDF' :
      resultadoNormalizado?.tipo_documento === 'DOCUMENTO_ADMINISTRATIVO' && tipoRapido !== 'NOTA_FISCAL' ?
      'DOCUMENTO_ADMINISTRATIVO' :
      resultadoNormalizado?.tipo_documento === 'NOTA_FISCAL_PDF' ?
      'NOTA_FISCAL_PDF' :
      isReciboLike({
        file_name_original: fileUrl,
        resultado_ia: resultadoNormalizado
      }) ?
      'RECIBO_PDF' :
      tipoFallback;

      // Mesclar inconsistências da IA com erros já existentes
      const inconsistencias = Array.isArray(resultadoNormalizado?.inconsistencias) ?
      resultadoNormalizado.inconsistencias :
      [];

      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoDetectado,
        resultado_ia: resultadoNormalizado,
        nf_emitente_cpf_cnpj: resultadoNormalizado?.nf_emitente_cpf_cnpj || '',
        fornecedor_cpf_cnpj:
        resultadoNormalizado?.fornecedor_cpf_cnpj ||
        resultadoNormalizado?.nf_emitente_cpf_cnpj ||
        '',
        fornecedor_nome:
        resultadoNormalizado?.fornecedor_nome ||
        resultadoNormalizado?.nf_emitente_nome ||
        '',
        municipio: resultadoNormalizado?.municipio || '',
        centro_custo: resultadoNormalizado?.centro_custo_sugerido || '',
        rubrica_nome_sugerida: resultadoNormalizado?.rubrica_nome_sugerida || '',
        rubrica_justificativa: resultadoNormalizado?.justificativa_ia || '',
        nf_numero: resultadoNormalizado?.nf_numero || '',
        nf_valor_total: resultadoNormalizado?.nf_valor_total || 0,
        erros_validacao: inconsistencias.length > 0 ? inconsistencias : []
      });

      await loadIntakes();
    } catch (err) {
      console.error('Erro na análise por IA (frontend):', err);
      // Tentar via backend como fallback para análise mais robusta
      try {
        await base44.functions.invoke('classifyAndRouteDocument', {
          intake_id: intakeId,
          file_url: fileUrl,
          file_name: fileUrl,
          orientacoes_usuario: orientacoes || ''
        });
        await loadIntakes();
      } catch (backendErr) {
        console.error('Fallback backend também falhou:', backendErr);
        await aplicarFallback();
        await loadIntakes();
      }
    }
  }

  async function handleReanalyse(intake) {
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ANALISANDO_IA',
        erros_validacao: [],
        resultado_ia: {}
      });

      await loadIntakes();

      // Tenta primeiro via backend robusto (Claude+Gemini+GPT com normalização completa)
      const isPDF = intake.mime_type?.includes('pdf') || intake.arquivo_original_url?.toLowerCase().endsWith('.pdf');
      if (isPDF) {
        try {
          await base44.functions.invoke('processarNotaFiscalComClaude', {
            intake_id: intake.id,
            file_url: intake.arquivo_original_url,
            orientacoes_usuario: intake.resultado_ia?.orientacoes_usuario || ''
          });
          await loadIntakes();
          return;
        } catch (backendErr) {
          console.warn('Backend processarNotaFiscalComClaude falhou, usando fluxo frontend:', backendErr);
        }
      }

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

  async function handleSyncDrive() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }

    setSyncLoading(true);
    try {
      const res = await base44.functions.invoke('syncDriveNotasFiscaisDesdeMarco2026', {
        dryRun: false,
        maxFiles: 50,
        triggeredBy: 'manual'
      });

      const data = res?.data || {};
      if (data.success) {
        toast.success(
          `Sincronização concluída: ${data.importados || 0} importados, ${data.ignorados || 0} ignorados, ${data.duplicados || 0} duplicados${data.tem_mais ? ' (há mais arquivos)' : ''}.`
        );
        await loadIntakes();
      } else {
        toast.error(data.error || 'Erro na sincronização.');
      }
    } catch (e) {
      console.error('Erro ao sincronizar Drive:', e);
      toast.error('Erro ao executar sincronização: ' + (e?.message || e));
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleSincronizarNFsDriveRaiz() {
    if (!user || (user.role !== 'admin' && !isCoordenador(user))) {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }
    setSyncNFsRootLoading(true);
    setSyncNFsRootResult(null);
    try {
      const res = await base44.functions.invoke('sincronizarNFsPastaRaizDrive', { batch_size: 80 });
      const data = res?.data || res;
      setSyncNFsRootResult(data);
      if (data?.erro) {
        toast.error(data.erro);
      } else if (data?.cobertura_percentual >= 100) {
        toast.success(`Sincronização 100% concluída — ${data.total_criados} notas sincronizadas.`);
      } else {
        toast.success(`Sincronização parcial: ${data?.cobertura_percentual?.toFixed(1)}% (${data?.total_pendentes || 0} pendentes).`);
      }
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao sincronizar NFs do Drive:', e);
      toast.error('Erro ao executar sincronização: ' + (e?.message || e));
      setSyncNFsRootResult({ erro: String(e?.message || e) });
    } finally {
      setSyncNFsRootLoading(false);
    }
  }

  async function handleSyncGmail() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }

    setSyncGmailLoading(true);
    try {
      // 1. Primeiro contar — cria o job e mostra resumo
      const countRes = await base44.functions.invoke('syncGmailBlocos', { action: 'contar' });
      const countData = countRes?.data || {};

      if (!countData.success) {
        toast.error(countData.error || 'Erro ao iniciar contagem de e-mails.');
        setSyncGmailLoading(false);
        return;
      }

      const { job, resumo } = countData;
      const total = resumo?.total_arquivos_validos || 0;
      const jaSync = resumo?.total_ja_sincronizados || 0;
      const pendentes = resumo?.total_pendentes || 0;

      if (pendentes === 0) {
        toast.success(`Nenhum novo e-mail pendente. ${jaSync} já sincronizados de ${total} encontrados.`);
        setSyncGmailLoading(false);
        return;
      }

      toast.info(`Encontrados ${total} arquivos em e-mails (${jaSync} já sincronizados). Processando ${pendentes} pendentes em blocos de ${resumo?.tamanho_bloco || 25}...`);

      // 2. Processar todos os blocos sequencialmente
      let continuar = true;
      let blocos = 0;

      while (continuar) {
        const procRes = await base44.functions.invoke('syncGmailBlocos', { action: 'processar_todos' });
        const procData = procRes?.data || {};

        if (!procData.success) {
          toast.warning(`Bloco ${blocos + 1}: ${procData.error || 'erro ao processar'}`);
          break;
        }

        blocos++;
        continuar = procData.continuar === true;

        // Usa os acumulados do job (sempre reflete o total até agora)
        const j = procData.job || {};
        const restantes = j.remaining_count ?? '?';

        if (continuar) {
          toast.info(`Bloco ${blocos} de ${j.total_batches || '?'} concluído — ${restantes} restantes.`);
        } else {
          // Último bloco — pega os totais finais do job
          const criados = j.created_count || 0;
          const dups = j.duplicate_count || 0;
          const erros = j.error_count || 0;

          if (erros > 0) {
            toast.warning(`Concluído: ${criados} importados, ${dups} duplicados, ${erros} erros.`);
          } else {
            toast.success(`Concluído! ${criados} documentos importados, ${dups} duplicados ignorados.`);
          }
        }
      }

      await loadIntakes();
    } catch (e) {
      console.error('Erro ao sincronizar Gmail:', e);
      toast.error('Erro ao executar sincronização de e-mails: ' + (e?.message || e));
    } finally {
      setSyncGmailLoading(false);
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
      origemTipo === 'NOTA_FISCAL_PDF' ?
      origemIntake :
      alvoTipo === 'NOTA_FISCAL_PDF' ?
      alvoIntake :
      null;

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
          pdfUpdate.xml_obrigatorio_pendente = false;
          pdfUpdate.enviado_sem_xml = false;
          pdfUpdate.xml_pendente_desde = null;
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
          ...(purchaseId ?
          {
            entidade_destino_id: purchaseId,
            entidade_destino: 'PurchaseRequest'
          } :
          {})
        });

        if (purchaseId) {
          await base44.entities.Attachment.create({
            purchase_request_id: purchaseId,
            document_intake_id: outro.id,
            file_name: outro.file_name_final || outro.file_name_original || 'arquivo.pdf',
            file_url: outro.arquivo_original_url || '',
            file_type: outro.mime_type || 'application/pdf',
            description:
            outreTipo === 'NOTA_FISCAL_XML' ?
            'XML da NF — vinculado manualmente' :
            'Comprovante/Recibo — vinculado manualmente',
            nf_tipo_documento: outreTipo === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf'
          }).catch(() => {});
        }
      } else {
        await base44.entities.DocumentIntake.update(origemIntake.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: alvoIntake.id,
          ocultar_entrada_unica: true
        });

        await base44.entities.DocumentIntake.update(alvoIntake.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: origemIntake.id,
          ocultar_entrada_unica: true
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

  async function handlePadronizarNomes() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }
    setPadronizarLoading(true);
    try {
      const res = await base44.functions.invoke('padronizarNomeArquivosNF', { mode: 'migrate' });
      const data = res?.data || {};
      if (data.processados > 0) {
        toast.success(`Padronização concluída: ${data.processados} arquivos renomeados${data.erros ? `, ${data.erros} erros` : ''}.`);
        await loadIntakes();
      } else {
        toast.info('Nenhum arquivo precisou ser renomeado.');
      }
    } catch (e) {
      toast.error('Erro ao padronizar nomes: ' + (e?.message || e));
    } finally {
      setPadronizarLoading(false);
    }
  }

  async function handleAutoVinculo() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }
    setAutoVinculoLoading(true);
    try {
      const res = await base44.functions.invoke('vincularDocumentosAutomatico', { dryRun: false });
      const data = res?.data || {};
      if (data.vinculos_xml_criados || data.vinculos_recibo_criados || data.duplicatas_excluidas) {
        toast.success(
          `Vinculação concluída: ${data.vinculos_xml_criados || 0} XML, ${data.vinculos_recibo_criados || 0} recibos, ${data.duplicatas_excluidas || 0} duplicatas removidas.`
        );
        await loadIntakes();
      } else {
        toast.info('Nenhum novo vínculo encontrado. Tudo já está vinculado.');
      }
    } catch (e) {
      toast.error('Erro ao vincular documentos: ' + (e?.message || e));
    } finally {
      setAutoVinculoLoading(false);
    }
  }

  async function handleHigienizarFila() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }
    setHigienizarLoading(true);
    try {
      const res = await tentarVincularLista(intakes || []);
      const xml = res?.vinculadosXml || 0;
      const recibo = res?.vinculadosRecibo || 0;
      if (xml > 0 || recibo > 0) {
        toast.success(`Higienização concluída: ${xml} XML(s) e ${recibo} recibo(s) vinculados.`);
        await loadIntakes();
      } else {
        toast.info('Nenhum novo vínculo encontrado. Tudo já está vinculado.');
      }
    } catch (e) {
      toast.error('Erro ao higienizar fila: ' + (e?.message || e));
    } finally {
      setHigienizarLoading(false);
    }
  }

  async function handlePreencherIAHistorico() {
    if (!user || user.role !== 'admin') {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }
    // Intakes pendentes: NF PDF em AGUARDANDO_REVISAO / RASCUNHO / ENVIADO sem preenchimento IA histórico
    const candidatos = (intakes || []).filter((i) => {
      const tipo = i.tipo_detectado || getTipoByFile(i);
      if (tipo !== 'NOTA_FISCAL_PDF') return false;
      const status = String(i.status_processamento || '').toUpperCase();
      const ia = i.resultado_ia || {};
      const ehHistorico = ia.preenchido_por_ia_historico === true;
      const jaTemRubrica = !!i.rubrica_id_sugerida || !!ia.rubrica_id;
      // Já preenchido por IA histórico com score>=70: pula
      if (ehHistorico && Number(ia.ia_historico_score || 0) >= 70) return false;
      // Aprovações: pula
      if (['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO', 'REJEITADO'].includes(status)) return false;
      // Precisa ter CNPJ ou nome emitente para buscar histórico
      const cnpj = onlyDigits(ia.nf_emitente_cpf_cnpj || i.nf_emitente_cpf_cnpj || i.fornecedor_cpf_cnpj || '');
      const emitente = normalizeText(ia.nf_emitente_nome || i.nf_emitente_nome || i.fornecedor_nome || '');
      return !!cnpj || !!emitente || !jaTemRubrica;
    });

    if (candidatos.length === 0) {
      toast.info('Nenhuma NF pendente elegível para preenchimento com IA histórico.');
      return;
    }

    setPreenchendoIAHistorico(true);
    try {
      const res = await base44.functions.invoke('preencherNFsComHistoricoIA', {
        intake_ids: candidatos.map((c) => c.id),
      });
      const data = res?.data || {};
      const preenchidos = data.preenchidos || 0;
      const total = data.total || candidatos.length;
      toast.success(`Preenchimento IA histórico: ${preenchidos} de ${total} NFs preenchidas.`);
      await loadIntakes();
    } catch (e) {
      toast.error('Erro ao preencher com IA histórico: ' + (e?.message || e));
    } finally {
      setPreenchendoIAHistorico(false);
    }
  }

  async function handleEnviarCoordenacaoLote() {
    if (!user || (user.role !== 'admin' && !isCoordenador(user))) {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }

    const elegiveis = (intakes || []).filter((i) => {
      const tipo = i.tipo_detectado || getTipoByFile(i);
      if (tipo !== 'NOTA_FISCAL_PDF') return false;
      const status = String(i.status_processamento || '').toUpperCase();
      if (status !== 'AGUARDANDO_REVISAO') return false;
      const ia = i.resultado_ia || {};
      return ia.preenchido_por_ia_historico === true && Number(ia.ia_historico_score || 0) >= 70;
    });

    if (elegiveis.length === 0) {
      toast.info('Nenhuma NF elegível para envio direto à coordenação.');
      return;
    }

    setEnviandoCoordenacaoLote(true);
    let enviados = 0;
    let falhas = 0;
    try {
      for (const intake of elegiveis) {
        const res = await enviarIntakeParaAprovacao(intake);
        if (res?.ok) enviados++;
        else falhas++;
      }

      if (enviados > 0) {
        toast.success(`${enviados} NF${enviados !== 1 ? 's' : ''} enviada${enviados !== 1 ? 's' : ''} para coordenação.`);
        await loadIntakes();
      } else if (falhas > 0) {
        toast.error(`Falha ao enviar ${falhas} NF(s). Verifique rubrica/centro de custo/valor.`);
      } else {
        toast.info('Nenhuma NF elegível para envio.');
      }
    } finally {
      setEnviandoCoordenacaoLote(false);
    }
  }

  // Ação única: (1) chama processarEntradaUnicaLote no backend para vincular
  // XML↔PDF e preencher campos faltantes; (2) recarrega a fila; (3) envia para
  // aprovação todas as NF PDFs que ficaram com XML vinculado (sem duplicar).
  // NFs sem XML, extratos, recibos, contratos e documentos administrativos
  // permanecem na fila.
  async function handleConciliarEEnviarTudo() {
    if (!user || (user.role !== 'admin' && !isCoordenador(user))) {
      toast.error('Função exclusiva da coordenação geral.');
      return;
    }

    setConciliarEnviandoLote(true);
    try {
      // Pipeline completo: Fase 1 (local) → Fase 2 (Drive) → Fase 3 (Gmail) → Fase 4 (aprovação)
      let totals = null;
      try {
        const res = await base44.functions.invoke('conciliarEEnviarNFsPipeline', { triggeredBy: 'manual' });
        totals = res?.data?.totals || res?.totals || null;
        const okFlag = res?.data?.ok !== false && res?.ok !== false;
        if (!okFlag) {
          toast.error('Erro ao conciliar: ' + (res?.data?.error || res?.error || 'falha no backend'));
          return;
        }
      } catch (e) {
        console.error('Erro ao chamar conciliarEEnviarNFsPipeline:', e);
        toast.error('Erro ao conciliar fila: ' + (e?.message || e));
        return;
      }

      await loadIntakes();
      const t = totals || {};
      toast.success(
        `Local: ${t.vinculados_local || 0} | Drive: ${t.encontrados_drive || 0} | Gmail: ${t.encontrados_gmail || 0} | Enviados: ${t.enviados_aprovacao || 0} | Pendentes s/ XML: ${t.pendentes_sem_xml || 0}`
      );
    } finally {
      setConciliarEnviandoLote(false);
    }
  }

  async function handleConfirmLinkXml(xmlIntake, pdfIntake) {
    try {
      await base44.entities.DocumentIntake.update(pdfIntake.id, {
        grupo_status: 'COMPLETO',
        nf_xml_intake_id: xmlIntake.id,
        nf_xml_url: xmlIntake.arquivo_original_url,
        xml_obrigatorio_pendente: false,
        enviado_sem_xml: false,
        xml_pendente_desde: null
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
        resultado_ia: {}
      });

      await base44.entities.DocumentIntake.update(pdfIntake.id, {
        grupo_status: 'COMPLETO',
        nf_xml_intake_id: xmlIntake.id,
        nf_xml_url: file_url,
        xml_obrigatorio_pendente: false,
        enviado_sem_xml: false,
        xml_pendente_desde: null
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
        file.name.toLowerCase().endsWith('.xml') && (
        !file.type || file.type === 'application/octet-stream'))
        {
          fileToUpload = new File([file], file.name, { type: 'text/xml' });
        }

        const uploadResult = await base44.integrations.Core.UploadFile({
          file: fileToUpload
        });

        if (!uploadResult?.file_url) {
          throw new Error('URL do arquivo não retornada pelo servidor');
        }

        const { file_url } = uploadResult;

        const ext = file.name.toLowerCase().endsWith('.xml') ?
        'NOTA_FISCAL_XML' :
        file.name.toLowerCase().endsWith('.pdf') ?
        'NOTA_FISCAL_PDF' :
        'PENDENTE';

        const isXmlFile = ext === 'NOTA_FISCAL_XML';

        const DATA_CORTE_XML_OBRIG = new Date('2026-08-01');
        const isPdfFile = ext === 'NOTA_FISCAL_PDF';
        const xmlObrigatorio = isPdfFile && new Date() >= DATA_CORTE_XML_OBRIG;

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
          ...(xmlObrigatorio ? { xml_obrigatorio_pendente: true, xml_pendente_desde: new Date().toISOString() } : {})
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

    // Coloca na fila sequencial (máx 20 por vez, cada PDF analisado por completo)
    const novos = intakesCriados.filter((i) => i.intake?.id);
    if (novos.length > 0) {
      filaRef.current = [...filaRef.current, ...novos];
      processarFila();
    }
  }

  async function processarFila() {
    if (filaProcessando) return;
    setFilaProcessando(true);
    abortarRef.current = false;

    const BATCH_SIZE = 20;
    let processados = 0;

    try {
      while (filaRef.current.length > 0 && !abortarRef.current) {
        const lote = filaRef.current.splice(0, BATCH_SIZE);
        setProgressoFila({ atual: processados, total: processados + filaRef.current.length + lote.length });

        for (let i = 0; i < lote.length; i++) {
          if (abortarRef.current) break;
          const { intake, file_url, mime_type } = lote[i];
          processados++;
          setProgressoFila({ atual: processados, total: processados + filaRef.current.length });

          const isPDF = mime_type?.includes('pdf') || file_url?.toLowerCase().endsWith('.pdf');

          const comTimeout = (promise) => Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_60S')), 60000))]
          );

          try {
            if (isPDF) {
              // PDFs: backend robusto (Claude → Gemini → GPT) com normalização completa
              await comTimeout(base44.functions.invoke('processarNotaFiscalComClaude', {
                intake_id: intake.id,
                file_url,
                orientacoes_usuario: intake.resultado_ia?.orientacoes_usuario || ''
              }));
            } else {
              await comTimeout(analisarComIA(intake.id, file_url, mime_type, null));
            }
          } catch (e) {
            console.error(`Falha ao analisar ${intake.file_name_original || intake.id}:`, e);
            // Fallback: tenta fluxo frontend
            try {
              await comTimeout(analisarComIA(intake.id, file_url, mime_type, null));
            } catch (e2) {
              await base44.entities.DocumentIntake.update(intake.id, {
                status_processamento: 'AGUARDANDO_REVISAO',
                erros_validacao: ['Análise automática falhou. Revise manualmente ou use o botão "Preencher com IA" no modal de revisão.']
              }).catch(() => {});
            }
          }

          await loadIntakes().catch(() => {});
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } finally {
      setFilaProcessando(false);
      setProgressoFila({ atual: 0, total: 0 });
      filaRef.current = [];
    }
  }

  async function handleReanalisarPendentes() {
    if (filaProcessando) {
      toast.error('Já existe uma fila de análise em andamento.');
      return;
    }

    // Pega todos os intakes que ainda estão em ENVIADO ou ANALISANDO_IA há mais de 60s
    const pendentes = intakes.filter((i) => {
      const status = String(i.status_processamento || '').toUpperCase();
      if (status === 'ENVIADO') return true;
      if (status === 'ANALISANDO_IA') {
        const created = new Date(i.updated_date || i.created_date || 0).getTime();
        return Date.now() - created > 60000;
      }
      return false;
    });

    if (pendentes.length === 0) {
      toast.info('Nenhum documento pendente de análise.');
      return;
    }

    toast.info(`Reanalisando ${pendentes.length} documento(s) com OCR e IA. Cada PDF será lido integralmente.`);
    filaRef.current = pendentes.map((i) => ({
      intake: i,
      file_url: i.arquivo_original_url,
      mime_type: i.mime_type
    }));
    processarFila();
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

  const canSeeAll = user?.role === 'admin' || base.includes('COORD') || base.includes('ADMIN') || isCoordenador(user);

  const tipo = reviewIntake?.tipo_detectado;
  const isNF = tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML' || tipo === 'DOCUMENTO_ADMINISTRATIVO';
  const isFoto = tipo === 'FOTO_ATIVIDADE';
  const isDocAdmin = false;
  const isContrato = isContractIntakeType(tipo);

  const isInitialPageLoading = userLoading || !!user && loadingIntakes;

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando seus documentos, vínculos, pendências e dados de análise da Entrada Única. Aguarde alguns instantes." />);


  }

  if (userLoadError && !user) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a Entrada Única"
        errorDescription="Atualize a página ou tente novamente em alguns instantes." />);


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

              <div className="flex items-start gap-3 flex-wrap">
                <div className="grid grid-cols-3 gap-2">
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

                {(user?.role === 'admin' || isCoordenador(user)) &&
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setReprocessarFilaOpen(true)}
                      disabled={reprocessarFilaOpen}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm hover:bg-amber-100 transition-colors"
                      title="Limpa dados IA, reanalisa cada NF isoladamente, revincula XMLs e envia automaticamente para aprovação"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reprocessar Fila
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          Ações admin
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">Administração</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={handleSyncDrive}
                          disabled={syncLoading}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {syncLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                          Sync Drive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleSyncGmail}
                          disabled={syncGmailLoading}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {syncGmailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          Sync Gmail
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleHigienizarFila}
                          disabled={higienizarLoading}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {higienizarLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                          Higienizar fila (XML↔PDF)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handlePreencherIAHistorico}
                          disabled={preenchendoIAHistorico}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {preenchendoIAHistorico ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Preencher com IA histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleConciliarEEnviarTudo}
                          disabled={conciliarEnviandoLote || enviandoCoordenacaoLote}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {conciliarEnviandoLote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Conciliar e enviar tudo
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleReanalisarPendentes}
                          disabled={filaProcessando}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {filaProcessando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Reanalisar pendentes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handlePadronizarNomes}
                          disabled={padronizarLoading}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {padronizarLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />}
                          Padronizar nomes
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleSincronizarNFsDriveRaiz}
                          disabled={syncNFsRootLoading}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          {syncNFsRootLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                          Sincronizar NFs do Drive (recuperar)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  {syncNFsRootLoading && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sincronizando arquivos do Drive...
                    </div>
                  )}
                  {syncNFsRootResult && !syncNFsRootLoading && (
                    <div className="mt-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-gray-700">
                      {syncNFsRootResult.erro ? (
                        <p className="text-red-700">❌ {syncNFsRootResult.erro}</p>
                      ) : (
                        <ul className="space-y-0.5">
                          <li>📂 Total no Drive (raiz + nível 1): {syncNFsRootResult.total_arquivos_drive ?? 0}</li>
                          <li>➕ Criados: {syncNFsRootResult.total_criados ?? 0}</li>
                          <li>⏭️ Pulados: {syncNFsRootResult.total_pulados ?? 0}</li>
                          <li>🎯 Cobertura: {typeof syncNFsRootResult.cobertura_percentual === 'number' ? syncNFsRootResult.cobertura_percentual.toFixed(1) : '0'}%</li>
                          {syncNFsRootResult.total_pendentes > 0 && (
                            <li className="text-amber-700">⚠️ Pendentes: {syncNFsRootResult.total_pendentes}</li>
                          )}
                          {syncNFsRootResult.email_enviado && (
                            <li className="text-blue-700">📧 E-mail enviado ao admin.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                  </div>
                  }
                  </div>
                  </div>
                  </div>

                  {(user?.role === 'admin' || isCoordenador(user)) && (
                    <div className="px-5 md:px-6 pb-2">
                      <MonitoramentoFila
                        intakes={intakes}
                        processados={processados}
                        onRefresh={loadIntakes}
                      />
                    </div>
                  )}

                  {(user?.role === 'admin' || isCoordenador(user)) && (
                    <div className="px-5 md:px-6 pb-2">
                      <PainelConciliacaoComprovantes currentUser={user} isCoordenador={user?.role === 'admin' || isCoordenador(user)} />
                    </div>
                  )}

                  <div className="p-4 md:p-6">
                  <DocumentUploadZone
              onFilesSelected={handleFilesSelected}
              uploading={uploading}
              disabled={!user} />
            
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

        <SectionErrorBoundary title="Importar pacote de relatórios">
          <ImportarPacoteRelatorios />
        </SectionErrorBoundary>

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black flex items-center gap-2">
                <InboxIcon className="w-4 h-4 text-black" />
                Documentos em análise
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

          {/* Abas */}
          <div className="flex border-b border-gray-100 px-5 md:px-6">
            <button
              onClick={() => setAbaAtiva('pendentes')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${abaAtiva === 'pendentes' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Pendentes
              {intakes.length > 0 && <span className="ml-1.5 text-xs bg-gray-100 rounded-full px-1.5 py-0.5">{intakes.length}</span>}
            </button>
            <button
              onClick={() => setAbaAtiva('processados')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${abaAtiva === 'processados' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Processados / Aprovados
              {processados.length > 0 && <span className="ml-1.5 text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">{processados.length}</span>}
            </button>

          </div>

          <div className="p-4 md:p-6">
            {intakesLoadError && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  Não foi possível carregar os documentos agora. Os itens já carregados continuam disponíveis.
                </p>
                <button
                  onClick={() => loadIntakes()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Aba processados */}
            {abaAtiva === 'processados' && (
              <div>
                {processados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <CheckCircle2 className="w-11 h-11 mb-3 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-600">Nenhum documento processado ainda</p>
                    <p className="text-xs mt-1 text-gray-400">Documentos enviados para aprovação aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {processados.map((intake) => (
                      <div key={intake.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${intake.status_processamento === 'APROVADO' ? 'bg-green-500' : 'bg-blue-500'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{intake.file_name_final || intake.file_name_original}</p>
                            <p className="text-xs text-gray-500">
                              {intake.fornecedor_nome || intake.nf_emitente_nome || '—'}
                              {intake.nf_valor_total ? ` · R$ ${Number(intake.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                              {intake.nf_numero ? ` · NF ${intake.nf_numero}` : ''}
                            </p>
                            {canSeeAll && intake.user_name && (
                              <p className="text-xs text-blue-600 font-medium mt-0.5">👤 {intake.user_name || intake.user_email}</p>
                            )}
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${intake.status_processamento === 'APROVADO' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {intake.status_processamento === 'APROVADO' ? 'Aprovado' : 'Enviado p/ aprovação'}
                        </span>
                        {intake.resultado_ia?.auto_aprovado_ia === true && (
                          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                            Auto-aprovado
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {abaAtiva === 'pendentes' && filaProcessando && progressoFila.total > 0 &&
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">
                    Analisando documentos com IA
                  </span>
                  <span className="text-xs text-amber-600">
                    {progressoFila.atual} de {progressoFila.total}
                  </span>
                </div>
                <div className="w-full bg-amber-200 rounded-full h-2">
                  <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressoFila.total > 0 ? progressoFila.atual / progressoFila.total * 100 : 0}%` }} />
                
                </div>
                <p className="text-xs text-amber-600">
                  Cada PDF está sendo lido integralmente via OCR + IA. Máximo de 20 por lote.
                </p>
              </div>
            }
            {abaAtiva === 'pendentes' && intakes.length === 0 ?
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <InboxIcon className="w-11 h-11 mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-600">Nenhum documento pendente</p>
                <p className="text-xs mt-1 text-gray-400">Faça o upload de arquivos acima para começar.</p>
              </div> :

            abaAtiva === 'pendentes' && <div className="space-y-3">
                {intakes.map((intake) =>
              <SectionErrorBoundary key={intake.id} title={intake.file_name_original || 'Documento'}>
                <DocumentIntakeCard
                  intake={intake}
                  allIntakes={intakes}
                  onReview={handleReview}
                  onDeleted={handleDeleted}
                  onSentToApproval={handleSentToApproval}
                  onReanalyse={handleReanalyse}
                  onLinkXml={handleLinkXml}
                  onAddXmlToPdf={handleAddXmlToPdf}
                  onLinkArquivo={handleLinkArquivo} />
              </SectionErrorBoundary>
              )}
              </div>
            }
          </div>
        </div>

        {reviewIntake &&
        <SectionErrorBoundary
          key={reviewIntake.id}
          title="Conferência do documento"
          onRetry={() => setReviewIntake(null)}
        >
          {isNF &&
          <ReviewModalNF
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved} />
          }

          {isFoto &&
          <ReviewModalFoto
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved} />
          }

          {isDocAdmin &&
          <ReviewModalDocAdmin
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved} />
          }

          {isContrato &&
          <ReviewModalContrato
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved} />
          }

          {!isNF && !isFoto && !isDocAdmin && !isContrato &&
          <ReviewModalOutro
            intake={reviewIntake}
            onClose={() => setReviewIntake(null)}
            onSaved={handleSaved} />
          }
        </SectionErrorBoundary>
        }

        {linkXmlIntake &&
        <LinkXmlModal
          xmlIntake={linkXmlIntake}
          pdfsDisponiveis={intakes.filter(
            (i) =>
            getTipoByFile(i) === 'NOTA_FISCAL_PDF' &&
            !i.nf_xml_intake_id &&
            i.grupo_status !== 'COMPLETO'
          )}
          onConfirm={(pdfIntake) => handleConfirmLinkXml(linkXmlIntake, pdfIntake)}
          onClose={() => setLinkXmlIntake(null)} />

        }

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
              onClose={() => setLinkArquivoIntake(null)} />);


        })()}

        <ReprocessarFilaModal
          open={reprocessarFilaOpen}
          intakes={intakes}
          onClose={() => setReprocessarFilaOpen(false)}
          onConcluir={loadIntakes}
        />
      </div>
    </div>);

}