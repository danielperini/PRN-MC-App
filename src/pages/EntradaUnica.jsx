import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';
import { Loader2, InboxIcon } from 'lucide-react';

export default function EntradaUnica() {
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [reviewIntake, setReviewIntake] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;
    setLoadingIntakes(true);
    try {
      const list = await base44.entities.DocumentIntake.filter(
        { user_email: user.email, status_registro: 'ATIVO' },
        '-created_date',
        50
      );
      const filtrados = (list || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();
        if (status === 'APROVADO') return false;
        if (status === 'ENVIADO_APROVACAO') return false;
        if (i.ocultar_entrada_unica === true) return false;
        return true;
      });
      setIntakes(filtrados);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIntakes(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadIntakes();
  }, [user, loadIntakes]);

  // Analisa documento por IA após upload (não bloqueia salvamento)
  async function analisarComIA(intakeId, fileUrl, mimeType, orientacoes) {
    try {
      const isPDF = mimeType?.includes('pdf') || fileUrl?.toLowerCase().endsWith('.pdf');
      const isXML = mimeType?.includes('xml') || fileUrl?.toLowerCase().endsWith('.xml');

      if (!isPDF && !isXML) return; // só analisa NF/PDF/XML

      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ANALISANDO_IA'
      });

      const prompt = `Você é um especialista em notas fiscais e documentos fiscais brasileiros.
Analise o documento e extraia os seguintes campos em JSON:
{
  "tipo_documento": "NOTA_FISCAL_PDF | NOTA_FISCAL_XML | DOCUMENTO_ADMINISTRATIVO | OUTRO",
  "nf_numero": "número da NF ou serie-numero",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_valor_total": número,
  "nf_emitente_nome": "razão social do emitente",
  "nf_emitente_cpf_cnpj": "somente dígitos",
  "nf_destinatario_nome": "razão social do destinatário/tomador",
  "descricao_servico": "descrição do serviço ou produto",
  "centro_custo_sugerido": "MIS | MHAB | MUMO | Geral"
}
${orientacoes ? `\nOrientações do usuário: ${orientacoes}` : ''}
Retorne apenas o JSON, sem explicações.`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [fileUrl],
        response_json_schema: {
          type: 'object',
          properties: {
            tipo_documento:         { type: 'string' },
            nf_numero:              { type: 'string' },
            nf_data_emissao:        { type: 'string' },
            nf_valor_total:         { type: 'number' },
            nf_emitente_nome:       { type: 'string' },
            nf_emitente_cpf_cnpj:   { type: 'string' },
            nf_destinatario_nome:   { type: 'string' },
            descricao_servico:      { type: 'string' },
            centro_custo_sugerido:  { type: 'string' },
          }
        }
      });

      const tipoDetectado =
        resultado?.tipo_documento === 'NOTA_FISCAL_XML' ? 'NOTA_FISCAL_XML' :
        resultado?.tipo_documento === 'NOTA_FISCAL_PDF' ? 'NOTA_FISCAL_PDF' :
        resultado?.tipo_documento === 'DOCUMENTO_ADMINISTRATIVO' ? 'DOCUMENTO_ADMINISTRATIVO' :
        'OUTRO';

      await base44.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: tipoDetectado,
        resultado_ia: resultado || {},
        centro_custo: resultado?.centro_custo_sugerido || '',
      });
    } catch (err) {
      console.error('Erro na análise por IA:', err);
      // Não bloqueia — apenas marca erro para reprocessamento manual
      try {
        await base44.entities.DocumentIntake.update(intakeId, {
          status_processamento: 'ERRO_PROCESSAMENTO',
          erros_validacao: [String(err?.message || 'Falha na análise por IA')]
        });
      } catch (_) {}
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
        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: file.type,
          status_processamento: 'ENVIADO',
          status_registro: 'ATIVO',
          tipo_detectado: 'PENDENTE',
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

    // Dispara análise por IA em background (não bloqueia UI)
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
      {/* Upload */}
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

      {/* Lista de documentos */}
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Modais de revisão */}
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
    </div>
  );
}