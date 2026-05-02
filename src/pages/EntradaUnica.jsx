import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';
import LinkXmlModal from '@/components/entrada/LinkXmlModal';
import { Loader2, InboxIcon } from 'lucide-react';

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
  if (fornA && fornB && (fornA.includes(fornB.slice(0, 12)) || fornB.includes(fornA.slice(0, 12)))) {
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
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [reviewIntake, setReviewIntake] = useState(null);
  const [linkXmlIntake, setLinkXmlIntake] = useState(null); // XML aguardando vínculo manual

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

      const tipoFallback = getTipoByFile(item);

      await base44.entities.DocumentIntake.update(item.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoFallback,
        erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.'],
      }).catch(() => {});
    }
  }, []);

  const tentarVincularLista = useCallback(async (lista) => {
    const ativos = (lista || []).filter((i) => !i.ocultar_entrada_unica);

    const pdfs = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF');
    const xmls = ativos.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_XML');

    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') continue;

      let melhorPdf = null;
      let melhorScore = 0;

      for (const pdf of pdfs) {
        if (pdf.nf_xml_intake_id || pdf.grupo_status === 'COMPLETO') continue;

        const score = calcularScoreVinculo(xml, pdf);
        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }

      if (melhorPdf && melhorScore >= 2) {
        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          grupo_status: 'COMPLETO',
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
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;

    setLoadingIntakes(true);

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
        // XMLs já vinculados a um PDF somem da lista
        const isXML = getTipoByFile(i) === 'NOTA_FISCAL_XML';
        if (isXML && i.nf_pdf_intake_id) return false;
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

    // XMLs não são suportados pela IA — marcar direto como aguardando revisão
    if (isXML) {
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: 'NOTA_FISCAL_XML',
      }).catch(() => {});
      return;
    }

    const tipoFallback = 'NOTA_FISCAL_PDF';

    const aplicarFallback = async () => {
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoFallback,
        erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.'],
      }).catch(() => {});
    };

    try {
      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ANALISANDO_IA',
      });

      const prompt = `Você é um especialista em notas fiscais e documentos fiscais brasileiros.
Analise o documento e extraia os seguintes campos em JSON.
Seja muito preciso e extraia o máximo de informações possível.

{
  "tipo_documento": "NOTA_FISCAL_PDF | NOTA_FISCAL_XML | DOCUMENTO_ADMINISTRATIVO | OUTRO",
  "nf_numero": "número da NF (somente dígitos ou alfanumérico exato)",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_valor_total": número (apenas o valor total líquido da nota),
  "nf_emitente_nome": "razão social completa do emitente/prestador",
  "nf_emitente_cpf_cnpj": "somente dígitos do CPF ou CNPJ do emitente",
  "nf_destinatario_nome": "razão social do destinatário/tomador",
  "descricao_servico": "descrição completa do serviço ou produto fornecido",
  "municipio": "município do emitente/prestação",
  "estado": "UF (2 letras)",
  "competencia": "Mês/Ano de referência (ex: Março/2026)",
  "centro_custo_sugerido": "MIS | MHAB | MUMO | Geral (identifique pelo nome do museu no documento ou destinatário)",
  "banco": "nome do banco do emitente se informado no documento",
  "agencia": "número da agência bancária se informado",
  "conta": "número da conta bancária se informado",
  "tipo_conta": "Corrente | Poupança se informado",
  "pix": "chave pix se informada (CPF, email, telefone ou chave aleatória)",
  "meta_sugerida": "identifique a meta mais provável: MC3A-20 (Coordenação/Equipe), MC3A-21 (Comunicação), MC3A-22 (Produção/infraestrutura), MC3A-23 (Eventos/atrações), MC3A-24 (Segurança/limpeza), MC3A-25 (Logística/transportes), MC3A-EXTRA (outro). Baseie-se na descrição do serviço.",
  "tipo_gasto": "Produto | Serviço (identifique pelo documento)",
  "categoria_sugerida": "Serviços (equipe/coordenação) | Serviços (comunicação: designer, foto, vídeo, imprensa, redes) | Serviços (produção/infraestrutura/expografia) | Serviços (eventos/atrações/artistas) | Serviços (segurança/limpeza) | Logística (transporte/vans) | Alimentação (lanche/café/coffeebreak) | Consultoria / Formação / Acessibilidade | Materiais de consumo | Outros",
  "rubrica_nome_sugerida": "sugira o nome mais provável da rubrica orçamentária que este gasto pertence. Exemplos: Coordenação Geral, Designer Gráfico, Produção Cultural, Educador, Comunicação, Produção, Logística, Manutenção. Use a descrição do serviço para decidir.",
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
              nf_destinatario_nome: { type: 'string' },
              descricao_servico: { type: 'string' },
              municipio: { type: 'string' },
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
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 30000)
        ),
      ]);

      const tipoDetectado =
        resultado?.tipo_documento === 'NOTA_FISCAL_XML'
          ? 'NOTA_FISCAL_XML'
          : resultado?.tipo_documento === 'NOTA_FISCAL_PDF'
            ? 'NOTA_FISCAL_PDF'
            : tipoFallback;

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
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ANALISANDO_IA',
        erros_validacao: [],
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
    // Abre modal para o usuário escolher o PDF
    setLinkXmlIntake(xmlIntake);
  }

  async function handleConfirmLinkXml(xmlIntake, pdfIntake) {
    try {
      await base44.entities.DocumentIntake.update(pdfIntake.id, {
        grupo_status: 'COMPLETO',
        nf_xml_intake_id: xmlIntake.id,
        nf_xml_url: xmlIntake.arquivo_original_url,
      });

      await base44.entities.DocumentIntake.update(xmlIntake.id, {
        grupo_status: 'COMPLETO',
        nf_pdf_intake_id: pdfIntake.id,
        nf_pdf_url: pdfIntake.arquivo_original_url,
        ocultar_entrada_unica: true,
      });

      toast.success('XML vinculado à nota fiscal com sucesso.');
      setLinkXmlIntake(null);
      await loadIntakes();
    } catch (e) {
      console.error('Erro ao vincular XML:', e);
      toast.error('Erro ao vincular XML: ' + (e?.message || e));
    }
  }

  async function handleFilesSelected(files, orientacoes) {
    if (!user || !files || files.length === 0) return;
    setUploading(true);

    let successCount = 0;
    let errorCount = 0;
    const intakesCriados = [];

    for (const file of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        const ext = file.name.toLowerCase().endsWith('.xml')
          ? 'NOTA_FISCAL_XML'
          : file.name.toLowerCase().endsWith('.pdf')
            ? 'NOTA_FISCAL_PDF'
            : 'PENDENTE';

        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: file.type,
          status_processamento: 'ENVIADO',
          status_registro: 'ATIVO',
          tipo_detectado: ext,
          revisado_pelo_usuario: false,
          resultado_ia: orientacoes ? { orientacoes_usuario: orientacoes } : {},
        });

        intakesCriados.push({ intake, file_url, mime_type: file.type });
        successCount++;
      } catch (e) {
        console.error('Erro ao enviar arquivo:', e);
        errorCount++;
      }
    }

    setUploading(false);

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) enviado(s). Analisando com IA...`);
    }

    if (errorCount > 0) {
      toast.error(`${errorCount} arquivo(s) falharam ao enviar.`);
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

  return (
    <div className="w-full max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Entrada Única de Documentos</h1>
        <p className="text-sm text-slate-500 mb-6">
          Envie notas fiscais, fotos de atividades ou documentos administrativos. A IA irá classificar e extrair os dados automaticamente.
        </p>

        <DocumentUploadZone
          onFilesSelected={handleFilesSelected}
          uploading={uploading}
          disabled={!user}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">
          Documentos em análise
          {!loadingIntakes && intakes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">({intakes.length})</span>
          )}
        </h2>

        {loadingIntakes ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando documentos...
          </div>
        ) : intakes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <InboxIcon className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Nenhum documento pendente</p>
            <p className="text-xs mt-1">Faça o upload de arquivos acima para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {intakes.map((intake) => (
              <DocumentIntakeCard
                key={intake.id}
                intake={intake}
                onReview={handleReview}
                onDeleted={handleDeleted}
                onSentToApproval={handleSentToApproval}
                onReanalyse={handleReanalyse}
                onLinkXml={handleLinkXml}
              />
            ))}
          </div>
        )}
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

      {reviewIntake && !isNF && !isFoto && !isDocAdmin && (
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
            (i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF' && !i.nf_xml_intake_id && i.grupo_status !== 'COMPLETO'
          )}
          onConfirm={(pdfIntake) => handleConfirmLinkXml(linkXmlIntake, pdfIntake)}
          onClose={() => setLinkXmlIntake(null)}
        />
      )}
    </div>
  );
}