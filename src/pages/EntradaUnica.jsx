import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import DocumentUploadZone from '@/components/entrada/DocumentUploadZone';
import DocumentIntakeCard from '@/components/entrada/DocumentIntakeCard';
import DocumentMonitoringDashboard from '@/components/entrada/DocumentMonitoringDashboard';
import ReviewModalNF from '@/components/entrada/ReviewModalNF';
import ReviewModalFoto from '@/components/entrada/ReviewModalFoto';
import ReviewModalDocAdmin from '@/components/entrada/ReviewModalDocAdmin';
import ReviewModalOutro from '@/components/entrada/ReviewModalOutro';

export default function EntradaUnica() {
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [reviewIntake, setReviewIntake] = useState(null);
  const pollingRef = useRef(null);

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

      // Filtra documentos já aprovados ou ocultados
      const filtrados = (list || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();
        if (status === 'APROVADO') return false;
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

  // Polling para atualizar status de documentos em processamento
  useEffect(() => {
    const hasProcessing = intakes.some(i =>
      ['ENVIADO', 'ANALISANDO_IA'].includes(i.status_processamento)
    );

    if (hasProcessing) {
      pollingRef.current = setInterval(() => {
        loadIntakes();
      }, 5000);
    } else {
      clearInterval(pollingRef.current);
    }

    return () => clearInterval(pollingRef.current);
  }, [intakes, loadIntakes]);

  const handleFilesSelected = async (files) => {
    if (!user || files.length === 0) return;
    setUploading(true);

    const grupoId = `grupo_${Date.now()}`;

    try {
      for (const file of files) {
        // Upload do arquivo
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // Cria registro de intake
        const intake = await base44.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name,
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: file.type,
          status_processamento: 'ENVIADO',
          status_registro: 'ATIVO',
          grupo_upload_id: grupoId,
        });

        // Dispara processamento assíncrono
        base44.functions.invoke('classifyAndRouteDocument', { intake_id: intake.id }).catch(console.error);
      }

      toast.success(`${files.length} arquivo(s) enviado(s) para análise.`);
      await loadIntakes();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar arquivo(s).');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (intake) => {
    await base44.entities.DocumentIntake.update(intake.id, { status_registro: 'REMOVIDO' });
    toast.success('Documento removido.');
    loadIntakes();
  };

  const handleReview = (intake) => {
    setReviewIntake(intake);
  };

  const handleCloseReview = () => {
    setReviewIntake(null);
    loadIntakes();
  };

  const getReviewModal = () => {
    if (!reviewIntake) return null;
    const tipo = reviewIntake.tipo_detectado;

    if (tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML') {
      return (
        <ReviewModalNF
          intake={reviewIntake}
          onClose={handleCloseReview}
          currentUser={user}
        />
      );
    }
    if (tipo === 'FOTO_ATIVIDADE') {
      return (
        <ReviewModalFoto
          intake={reviewIntake}
          onClose={handleCloseReview}
          currentUser={user}
        />
      );
    }
    if (tipo === 'DOCUMENTO_ADMINISTRATIVO') {
      return (
        <ReviewModalDocAdmin
          intake={reviewIntake}
          onClose={handleCloseReview}
          currentUser={user}
        />
      );
    }
    return (
      <ReviewModalOutro
        intake={reviewIntake}
        onClose={handleCloseReview}
        currentUser={user}
      />
    );
  };

  return (
    <div className="w-full py-8 px-4 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entrada Única de Documentos</h1>
        <p className="text-gray-500 mt-1">
          Envie notas fiscais, fotos de atividades e documentos administrativos em um só lugar.
        </p>
      </div>

      <DocumentUploadZone
        onFilesSelected={handleFilesSelected}
        uploading={uploading}
        currentUser={user}
      />

      <div className="space-y-3">
        {loadingIntakes ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : intakes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Nenhum documento pendente. Envie um arquivo acima.
          </div>
        ) : (
          intakes.map((intake) => (
            <DocumentIntakeCard
              key={intake.id}
              intake={intake}
              onReview={handleReview}
              onDelete={handleDelete}
              currentUser={user}
            />
          ))
        )}
      </div>

      <DocumentMonitoringDashboard currentUser={user} />

      {getReviewModal()}
    </div>
  );
}