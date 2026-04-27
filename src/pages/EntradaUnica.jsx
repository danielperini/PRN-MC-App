import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Inbox, RefreshCw, Activity } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';
import ReviewModalNFXML from '@/components/entrada/ReviewModalNFXML';
import CoordBulkImportPanel from '@/components/entrada/CoordBulkImportPanel';
import DocumentMonitoringDashboard from '@/components/entrada/DocumentMonitoringDashboard';
import DuplicateDetectionPanel from '@/components/entrada/DuplicateDetectionPanel';

const COORD_EMAILS = [
'danielperini.mc@viadutodasartes.org.br',
'danie@periniprojetos.com.br'];


export default function EntradaUnica() {
  const { toast } = useToast();
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
      setIntakes(list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIntakes(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadIntakes();
  }, [user, loadIntakes]);

  // Polling para atualizar cards em processamento
  useEffect(() => {
    const hasProcessing = intakes.some((i) =>
    i.status_processamento === 'ANALISANDO_IA' || i.status_processamento === 'ENVIADO'
    );
    if (!hasProcessing) return;
    const timer = setInterval(loadIntakes, 4000);
    return () => clearInterval(timer);
  }, [intakes, loadIntakes]);

  // Suporte a múltiplos arquivos com orientações para IA
  async function handleFilesSelected(files, orientacoes) {
    if (!user || !files || files.length === 0) return;
    setUploading(true);

    const createdIntakes = [];
    const grupoUploadId = `grupo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      for (const file of files) {
        // PASSO 1: Upload do arquivo — nunca perde o arquivo
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // PASSO 2: Salva imediatamente no banco (Attachment de segurança + DocumentIntake)
        // O Attachment garante que o arquivo aparece na área de Arquivos/Documentos mesmo se IA falhar
        const attachmentGuarda = await base44.entities.Attachment.create({
          report_id: '',
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url: file_url,
          description: `Enviado via Entrada Única — aguardando classificação`,
          backup_done: false
        });

        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: file.type,
          status_processamento: 'ENVIADO',
          tipo_detectado: 'PENDENTE',
          entidade_destino: 'Attachment',
          entidade_destino_id: attachmentGuarda.id,
          resultado_ia: orientacoes ? { orientacoes_usuario: orientacoes } : undefined,
          grupo_upload_id: grupoUploadId,
          grupo_status: files.length > 1 ? 'INCOMPLETO' : 'COMPLETO',
          status_registro: 'ATIVO'
        });

        createdIntakes.push({ intake, attachmentId: attachmentGuarda.id });
        setIntakes((prev) => [intake, ...prev]);
      }

      // PASSO 3: Confirma ao usuário que está salvo
      toast({
        title: `${files.length > 1 ? `${files.length} documentos recebidos` : 'Documento recebido'} e salvo com sucesso.`,
        description: 'Iniciando análise pela IA. O arquivo está seguro mesmo que a análise falhe.',
        duration: 3000
      });

      // PASSO 4: Dispara análise da IA em background (não bloqueia, não perde dados)
      for (const { intake, attachmentId } of createdIntakes) {
        base44.functions.invoke('classifyAndRouteDocument', {
          intake_id: intake.id,
          orientacoes_usuario: intake.resultado_ia?.orientacoes_usuario || ''
        }).
        then(() => loadIntakes()).
        catch((e) => {
          console.error('Erro na análise IA:', e);
          // Arquivo já está salvo — apenas marca erro de processamento para classificação manual
          base44.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'ERRO_PROCESSAMENTO',
            erros_validacao: ['Erro na análise automática. Você pode classificar manualmente.']
          });
          loadIntakes();
        });
      }

    } catch (e) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  function handleReview(intake) {
    setReviewIntake(intake);
  }

  function handleModalClose() {
    setReviewIntake(null);
  }

  function handleSaved() {
    setReviewIntake(null);
    loadIntakes();
    toast({ 
      title: 'Salvo com sucesso.',
      duration: 10000
    });
  }

  function handleReclassified(novoTipo) {
    loadIntakes().then(() => {
      setReviewIntake((prev) =>
      prev ? { ...prev, tipo_detectado: novoTipo, status_processamento: 'AGUARDANDO_REVISAO' } : null
      );
    });
  }

  function handleIntakeDeleted(intakeId) {
    setIntakes((prev) => prev.filter((i) => i.id !== intakeId));
  }

  const modalTipo = reviewIntake?.tipo_detectado;
  const isNF = modalTipo === 'NOTA_FISCAL_PDF' || modalTipo === 'NOTA_FISCAL_XML';
  const isFoto = modalTipo === 'FOTO_ATIVIDADE';
  const isDocAdmin = modalTipo === 'DOCUMENTO_ADMINISTRATIVO';
  const isOutro = modalTipo === 'OUTRO' || modalTipo === 'PENDENTE';

  return (
    <div className="w-full py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900">Entrada Única de Documentos</h1>
        <p className="text-slate-500 text-sm mt-1">
          Envie qualquer documento. A IA identifica o tipo e direciona automaticamente para o banco correto.
        </p>
      </div>

      {/* Abas */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">📤 Envio & Lista</TabsTrigger>
            <TabsTrigger value="monitoring">
              <Activity className="w-4 h-4 mr-2" />
              Monitoramento
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Upload e Lista */}
          <TabsContent value="upload" className="space-y-6 max-w-3xl mx-auto">
            {/* Painel coordenador — visível apenas para e-mails autorizados */}
            {user && COORD_EMAILS.includes((user.email || '').toLowerCase().trim()) &&
            <CoordBulkImportPanel />
            }

            {/* Zona de upload */}
            <DocumentUploadZone onFilesSelected={handleFilesSelected} uploading={uploading} />



            

            {/* Lista de documentos enviados */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-700">Documentos Enviados</h2>
                <Button variant="ghost" size="sm" onClick={loadIntakes} disabled={loadingIntakes}>
                  <RefreshCw className={`w-4 h-4 ${loadingIntakes ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {loadingIntakes && intakes.length === 0 ?
              <div className="text-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Carregando...
                </div> :
              intakes.length === 0 ?
              <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum documento enviado ainda.</p>
                </div> :

              <div className="space-y-2">
                   {intakes.map((intake) =>
                 <DocumentIntakeCard
                   key={intake.id}
                   intake={intake}
                   onReview={handleReview}
                   onDeleted={handleIntakeDeleted} />

                 )}
                 </div>
              }
            </div>
          </TabsContent>

          {/* Aba 2: Monitoramento */}
          <TabsContent value="monitoring" className="w-full">
            <DocumentMonitoringDashboard />
          </TabsContent>
        </Tabs>
      </div>

      {/* Painel de detecção de duplicados */}
      {reviewIntake && (
        <DuplicateDetectionPanel 
          intake={reviewIntake}
          onDuplicatesFound={(dups) => console.log('Duplicados encontrados:', dups)}
        />
      )}

      {/* Modais de revisão */}
      {reviewIntake && modalTipo === 'NOTA_FISCAL_PDF' &&
      <ReviewModalNF intake={reviewIntake} onClose={handleModalClose} onSaved={handleSaved} />
      }
      {reviewIntake && modalTipo === 'NOTA_FISCAL_XML' &&
      <ReviewModalNFXML intake={reviewIntake} onClose={handleModalClose} onSaved={handleSaved} />
      }
      {reviewIntake && isFoto &&
      <ReviewModalFoto intake={reviewIntake} onClose={handleModalClose} onSaved={handleSaved} />
      }
      {reviewIntake && isDocAdmin &&
      <ReviewModalDocAdmin intake={reviewIntake} onClose={handleModalClose} onSaved={handleSaved} />
      }
      {reviewIntake && isOutro &&
      <ReviewModalOutro intake={reviewIntake} onClose={handleModalClose} onReclassified={handleReclassified} />
      }
    </div>);

}