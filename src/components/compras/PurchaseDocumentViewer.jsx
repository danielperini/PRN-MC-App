import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Eye,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';

const DOCUMENT_TYPE_ICONS = {
  orcamento: '📊',
  contrato: '📜',
  nota_fiscal: '🧾',
  recibo: '✅',
  outro: '📎',
};

const DOCUMENT_TYPE_NAMES = {
  orcamento: 'Orçamento',
  contrato: 'Contrato',
  nota_fiscal: 'Nota Fiscal',
  recibo: 'Recibo',
  outro: 'Outro',
};

const STATUS_CONFIG = {
  pendente_revisao: { label: 'Pendente', icon: Clock, color: 'bg-yellow-50 border-yellow-200' },
  aprovado: { label: 'Aprovado', icon: CheckCircle, color: 'bg-green-50 border-green-200' },
  rejeitado: { label: 'Rejeitado', icon: AlertCircle, color: 'bg-red-50 border-red-200' },
  arquivado: { label: 'Arquivado', icon: FileText, color: 'bg-gray-50 border-gray-200' },
};

export default function PurchaseDocumentViewer({ purchaseId }) {
  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase-documents', purchaseId],
    queryFn: () => base44.entities.PurchaseDocument.filter({ purchase_id: purchaseId }, '-created_date', 100),
    enabled: !!purchaseId,
  });

  const handleDelete = async (docId) => {
    if (!window.confirm('Deseja remover este documento?')) return;

    try {
      await base44.entities.PurchaseDocument.delete(docId);
      toast.success('✅ Documento removido');
      refetch();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-400">Carregando documentos...</div>;
  }

  if (documents.length === 0) {
    return <div className="text-sm text-gray-400">Nenhum documento anexado</div>;
  }

  return (
    <div className="space-y-3">
      {documents.map(doc => {
        const StatusIcon = STATUS_CONFIG[doc.status]?.icon || Clock;
        return (
          <div key={doc.id} className={`border rounded-lg p-4 ${STATUS_CONFIG[doc.status]?.color}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{DOCUMENT_TYPE_ICONS[doc.tipo_documento]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-black text-sm">{doc.nome_arquivo}</p>
                    <p className="text-xs text-gray-600">{DOCUMENT_TYPE_NAMES[doc.tipo_documento]}</p>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <StatusIcon className="w-3 h-3" />
                    {STATUS_CONFIG[doc.status]?.label}
                  </Badge>
                </div>

                {/* Metadados */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                  {doc.numero_documento && (
                    <div>
                      <span className="text-gray-600">Número</span>
                      <p className="font-semibold text-black">{doc.numero_documento}</p>
                    </div>
                  )}
                  {doc.data_documento && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-gray-600" />
                      <span>{new Date(doc.data_documento).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {doc.fornecedor && (
                    <div>
                      <span className="text-gray-600">Fornecedor</span>
                      <p className="font-semibold text-black">{doc.fornecedor}</p>
                    </div>
                  )}
                  {doc.valor_documento && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-gray-600" />
                      <span className="font-semibold">
                        R$ {doc.valor_documento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Descrição */}
                {doc.descricao && (
                  <p className="text-xs text-gray-700 mt-2 p-2 bg-white/50 rounded italic">
                    📝 {doc.descricao}
                  </p>
                )}

                {/* Informações de Revisão */}
                {doc.revisado_por && (
                  <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-current/20">
                    <span className="font-semibold">Revisado por:</span> {doc.revisado_por}
                    {doc.comentario_revisao && <p className="italic mt-1">💬 {doc.comentario_revisao}</p>}
                  </div>
                )}

                {/* Uploader info */}
                <div className="text-xs text-gray-500 mt-2">
                  <User className="w-3 h-3 inline mr-1" />
                  {doc.uploadado_por} • {doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(2)} MB` : ''}
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-1 flex-col">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-black/5 rounded transition"
                  title="Visualizar"
                >
                  <Eye className="w-4 h-4" />
                </a>
                <a
                  href={doc.file_url}
                  download={doc.nome_arquivo}
                  className="p-2 hover:bg-black/5 rounded transition"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 hover:bg-red-100 text-red-600 rounded transition"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}