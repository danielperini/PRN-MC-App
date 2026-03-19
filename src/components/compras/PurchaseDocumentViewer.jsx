import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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
  xml_nf: '🧾',
  recibo: '✅',
  comprovante_pagamento: '💸',
  outro: '📎',
};

const DOCUMENT_TYPE_NAMES = {
  orcamento: 'Orçamento',
  contrato: 'Contrato',
  nota_fiscal: 'Nota Fiscal',
  xml_nf: 'XML da Nota Fiscal',
  recibo: 'Recibo',
  comprovante_pagamento: 'Comprovante de Pagamento',
  outro: 'Outro',
};

const STATUS_CONFIG = {
  pendente_revisao: {
    label: 'Pendente',
    icon: Clock,
    color: 'bg-yellow-50 border-yellow-200',
    badge: 'text-yellow-700 border-yellow-300 bg-yellow-50'
  },
  aprovado: {
    label: 'Aprovado',
    icon: CheckCircle,
    color: 'bg-green-50 border-green-200',
    badge: 'text-green-700 border-green-300 bg-green-50'
  },
  recusado: {
    label: 'Recusado',
    icon: AlertCircle,
    color: 'bg-red-50 border-red-200',
    badge: 'text-red-700 border-red-300 bg-red-50'
  },
  rejeitado: {
    label: 'Rejeitado',
    icon: AlertCircle,
    color: 'bg-red-50 border-red-200',
    badge: 'text-red-700 border-red-300 bg-red-50'
  },
  arquivado: {
    label: 'Arquivado',
    icon: FileText,
    color: 'bg-gray-50 border-gray-200',
    badge: 'text-gray-700 border-gray-300 bg-gray-50'
  },
};

export default function PurchaseDocumentViewer({ purchaseId }) {
  const {
    data: documents = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['purchase-documents', purchaseId],
    queryFn: () =>
      base44.entities.PurchaseDocument.filter(
        { purchase_id: purchaseId },
        '-data_upload',
        200
      ),
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

  if (!purchaseId) {
    return <div className="text-sm text-gray-400">Compra não identificada</div>;
  }

  if (isLoading) {
    return <div className="text-sm text-gray-400">Carregando documentos...</div>;
  }

  if (documents.length === 0) {
    return <div className="text-sm text-gray-400">Nenhum documento anexado</div>;
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => {
        const statusInfo = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pendente_revisao;
        const StatusIcon = statusInfo.icon;

        return (
          <div
            key={doc.id}
            className={`border rounded-lg p-4 ${statusInfo.color}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">
                    {DOCUMENT_TYPE_ICONS[doc.tipo_documento] || '📎'}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-black text-sm truncate">
                      {doc.nome_arquivo || 'Documento sem nome'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {DOCUMENT_TYPE_NAMES[doc.tipo_documento] || doc.tipo_documento || 'Documento'}
                    </p>
                  </div>

                  <Badge variant="outline" className={`gap-1 ${statusInfo.badge}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                  {doc.numero_documento && (
                    <div>
                      <span className="text-gray-600">Número</span>
                      <p className="font-semibold text-black break-words">{doc.numero_documento}</p>
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
                      <p className="font-semibold text-black break-words">{doc.fornecedor}</p>
                    </div>
                  )}

                  {doc.valor_documento !== null && doc.valor_documento !== undefined && doc.valor_documento !== '' && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-gray-600" />
                      <span className="font-semibold">
                        R$ {Number(doc.valor_documento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {doc.descricao && (
                  <p className="text-xs text-gray-700 mt-2 p-2 bg-white/50 rounded italic">
                    📝 {doc.descricao}
                  </p>
                )}

                {(doc.revisado_por || doc.comentario_revisao || doc.data_revisao) && (
                  <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-current/20 space-y-1">
                    {doc.revisado_por && (
                      <p>
                        <span className="font-semibold">Revisado por:</span> {doc.revisado_por}
                      </p>
                    )}
                    {doc.data_revisao && (
                      <p>
                        <span className="font-semibold">Data da revisão:</span>{' '}
                        {new Date(doc.data_revisao).toLocaleString('pt-BR')}
                      </p>
                    )}
                    {doc.comentario_revisao && (
                      <p className="italic">💬 {doc.comentario_revisao}</p>
                    )}
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {doc.uploadado_por && (
                    <span>
                      <User className="w-3 h-3 inline mr-1" />
                      {doc.uploadado_por}
                    </span>
                  )}
                  {doc.file_size ? (
                    <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                  ) : null}
                  {doc.mime_type ? <span>{doc.mime_type}</span> : null}
                </div>
              </div>

              <div className="flex gap-1 flex-col flex-shrink-0">
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-black/5 rounded transition"
                    title="Visualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                )}

                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    download={doc.nome_arquivo}
                    className="p-2 hover:bg-black/5 rounded transition"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}

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