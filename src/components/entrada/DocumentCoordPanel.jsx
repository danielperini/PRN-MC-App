import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import CoordReviewModalNF from './CoordReviewModalNF';
import { Badge } from '@/components/ui/badge';

const STATUS_COLORS = {
  'ENVIADO_APROVACAO': 'bg-blue-100 text-blue-800',
  'AGUARDANDO_REVISAO': 'bg-yellow-100 text-yellow-800',
  'DEVOLVIDO': 'bg-orange-100 text-orange-800',
  'APROVADO': 'bg-green-100 text-green-800',
  'DELETADO': 'bg-red-100 text-red-800',
};

export default function DocumentCoordPanel() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      setLoading(true);
      // Busca documentos aguardando revisão
      const intakes = await base44.entities.DocumentIntake.filter({
        status_processamento: 'ENVIADO_APROVACAO'
      }, '-updated_date', 100);

      const withPurchases = await Promise.all(
        (intakes || []).map(async (intake) => {
          let purchase = null;
          if (intake.entidade_destino_id) {
            try {
              purchase = await base44.entities.PurchaseRequest.get(intake.entidade_destino_id);
            } catch (e) {
              console.warn('Compra não encontrada:', intake.entidade_destino_id);
            }
          }
          return { intake, purchase };
        })
      );

      setDocuments(withPurchases);
    } catch (e) {
      console.error('Erro ao carregar documentos:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleReload() {
    await loadDocuments();
  }

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-slate-600">Carregando documentos...</p>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-slate-600">Nenhum documento aguardando revisão.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            Documentos Aguardando Revisão ({documents.length})
          </h3>
          <Button variant="outline" size="sm" onClick={handleReload}>
            🔄 Recarregar
          </Button>
        </div>

        {documents.map(({ intake, purchase }) => (
          <Card key={intake.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-slate-900">
                    NF {intake.nf_numero} - {intake.nf_emitente_nome}
                  </span>
                  <Badge className={STATUS_COLORS[intake.status_processamento]}>
                    {intake.status_processamento === 'ENVIADO_APROVACAO' ? 'Aguardando Revisão' : intake.status_processamento}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 mb-3">
                  <div>
                    <span className="font-medium">Valor:</span> R$ {parseFloat(intake.nf_valor_total || 0).toFixed(2)}
                  </div>
                  <div>
                    <span className="font-medium">Data:</span> {intake.nf_data_emissao}
                  </div>
                  <div>
                    <span className="font-medium">Enviado por:</span> {intake.user_name}
                  </div>
                  <div>
                    <span className="font-medium">Meta:</span> {intake.resultado_ia?.meta_id || 'N/A'}
                  </div>
                </div>

                {/* Problemas */}
                {(intake.erros_validacao || []).length > 0 && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-800 space-y-1">
                    <p className="font-medium flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {intake.erros_validacao.length} inconsistência(s):
                    </p>
                    <ul className="list-disc list-inside">
                      {intake.erros_validacao.slice(0, 3).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {intake.erros_validacao.length > 3 && (
                        <li>... e mais {intake.erros_validacao.length - 3}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <Button
                onClick={() => {
                  setSelectedDoc({ intake, purchase });
                  setShowReviewModal(true);
                }}
                className="ml-4 flex-shrink-0"
              >
                <Eye className="w-4 h-4 mr-2" />
                Revisar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal de revisão */}
      {showReviewModal && selectedDoc && (
        <CoordReviewModalNF
          intake={selectedDoc.intake}
          purchase={selectedDoc.purchase}
          onClose={() => {
            setShowReviewModal(false);
            setSelectedDoc(null);
          }}
          onSaved={() => {
            setShowReviewModal(false);
            setSelectedDoc(null);
            handleReload();
          }}
        />
      )}
    </>
  );
}