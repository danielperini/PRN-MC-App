import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Download,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  Search,
  HardDrive,
  Trash2,
  LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import RequireAuth from '@/components/auth/RequireAuth';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DriveBackupPanel from '@/components/backup/DriveBackupPanel';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isEntradaUnicaAttachment(att) {
  const description = normalizeText(att?.description);
  const fileName = normalizeText(att?.file_name);
  const nfCategoria = normalizeText(att?.nf_categoria);
  const nfTipo = normalizeText(att?.nf_tipo_documento);
  const categoria = normalizeText(att?.categoria);

  return (
    nfCategoria === 'nota_fiscal' ||
    nfTipo === 'pdf_nf' ||
    nfTipo === 'xml_nf' ||
    categoria === 'documento_administrativo' ||
    categoria === 'foto_atividade' ||
    categoria === 'outro' ||
    description.includes('entrada unica') ||
    description.includes('nota fiscal') ||
    fileName.includes('museus centro') ||
    !!att?.nf_numero ||
    !!att?.nf_emitente_nome ||
    !!att?.nf_valor_total
  );
}

function dedupById(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item?.id && !map.has(item.id)) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function getDocumentType(doc) {
  if (doc?.nf_categoria === 'nota_fiscal') return 'nota_fiscal';
  if (doc?.nf_tipo_documento === 'pdf_nf') return 'nota_fiscal';
  if (doc?.nf_tipo_documento === 'xml_nf') return 'nota_fiscal';

  const categoria = normalizeText(doc?.categoria);
  if (categoria === 'documento_administrativo') return 'outro';
  if (categoria === 'foto_atividade') return 'outro';

  return 'outro';
}

function getDocumentStatus(doc) {
  if (doc?.status_registro === 'DELETADO') return 'arquivado';
  if (doc?.nf_revisado === true) return 'aprovado';
  if (doc?.nf_status_leitura === 'lido_com_sucesso') return 'pendente_revisao';
  if (doc?.nf_status_leitura === 'lido_com_alertas') return 'pendente_revisao';
  if (doc?.nf_status_leitura === 'erro_leitura_parcial') return 'pendente_revisao';
  return 'pendente_revisao';
}

function getDocumentNumber(doc) {
  return doc?.nf_numero || doc?.numero_documento || '—';
}

function getDocumentName(doc) {
  return (
    doc?.file_name ||
    doc?.nf_nome_renomeado ||
    doc?.nf_nome_original ||
    'Documento sem nome'
  );
}

function getDocumentProvider(doc) {
  return doc?.nf_emitente_nome || doc?.fornecedor || doc?.description || '—';
}

function getDocumentValue(doc) {
  const value = doc?.nf_valor_total || doc?.valor_documento || 0;
  return Number(value) || 0;
}

function formatBRL(value) {
  const n = Number(value) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function GestaoDocumental() {
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('documentos');
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['all-documents-attachments', filtroTipo, filtroStatus, search],
    queryFn: async () => {
      const all = await base44.entities.Attachment.list('-created_date', 500);

      const normalized = dedupById((all || []).filter(isEntradaUnicaAttachment)).map((doc) => ({
        ...doc,
        _tipo_documento: getDocumentType(doc),
        _status: getDocumentStatus(doc),
        _nome_arquivo: getDocumentName(doc),
        _fornecedor: getDocumentProvider(doc),
        _numero_documento: getDocumentNumber(doc),
        _valor_documento: getDocumentValue(doc),
      }));

      return normalized.filter((d) => {
        const busca = normalizeText(search);

        const matchSearch =
          !busca ||
          normalizeText(d._nome_arquivo).includes(busca) ||
          normalizeText(d._numero_documento).includes(busca) ||
          normalizeText(d._fornecedor).includes(busca);

        const matchTipo = filtroTipo === 'all' || d._tipo_documento === filtroTipo;
        const matchStatus = filtroStatus === 'all' || d._status === filtroStatus;

        return matchSearch && matchTipo && matchStatus;
      });
    },
  });

  const totalValor = documents.reduce((sum, d) => sum + (d._valor_documento || 0), 0);

  const stats = {
    total: documents.length,
    pendentes: documents.filter((d) => d._status === 'pendente_revisao').length,
    aprovados: documents.filter((d) => d._status === 'aprovado').length,
    rejeitados: documents.filter((d) => d._status === 'rejeitado').length,
  };

  const getTypeIcon = (tipo) => {
    const icons = {
      orcamento: '📊',
      contrato: '📜',
      nota_fiscal: '🧾',
      recibo: '✅',
      outro: '📎',
    };
    return icons[tipo] || '📎';
  };

  const getTypeLabel = (tipo) => {
    const labels = {
      orcamento: 'Orçamento',
      contrato: 'Contrato',
      nota_fiscal: 'Nota Fiscal',
      recibo: 'Recibo',
      outro: 'Outro',
    };
    return labels[tipo] || tipo;
  };

  const getStatusConfig = (status) => {
    const config = {
      pendente_revisao: {
        label: 'Pendente',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: Clock,
      },
      aprovado: {
        label: 'Aprovado',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: CheckCircle,
      },
      rejeitado: {
        label: 'Rejeitado',
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: AlertCircle,
      },
      arquivado: {
        label: 'Arquivado',
        color: 'bg-gray-50 text-gray-700 border-gray-200',
        icon: FileText,
      },
    };
    return config[status] || config.pendente_revisao;
  };

  const canDelete = ['COORDENADOR_GERAL', 'COORDENADOR', 'ADMIN', 'admin'].includes(
    currentUser?.role
  );

  return (
    <RequireAuth>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-black mb-2">Gestão Documental</h1>
            <p className="text-gray-600">
              Documentos vinculados a compras e rubricas para auditoria e controle
            </p>
          </div>

          <div className="flex border-b border-gray-200 mb-6 gap-1">
            <button
              onClick={() => setActiveTab('documentos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'documentos'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-black'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1.5" />
              Documentos
            </button>

            {['admin', 'ADMIN', 'COORDENADOR'].includes(currentUser?.role) && (
              <button
                onClick={() => setActiveTab('backup')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'backup'
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-black'
                }`}
              >
                <HardDrive className="w-4 h-4 inline mr-1.5" />
                Backup no Drive
              </button>
            )}
          </div>

          {activeTab === 'backup' && <DriveBackupPanel currentUser={currentUser} />}

          {activeTab === 'documentos' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-900">
                  <strong>📋 Centralização de Documentos:</strong> Todos os documentos
                  enviados pela Entrada Única são centralizados em Attachment e aparecem
                  aqui, em Compras e na Gestão Documental.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="border border-gray-200 rounded-lg p-4">
                  <span className="text-xs text-gray-600 font-semibold">
                    Total de Documentos
                  </span>
                  <p className="text-2xl font-bold text-black mt-2">{stats.total}</p>
                </div>

                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                  <span className="text-xs text-gray-600 font-semibold">Pendentes</span>
                  <p className="text-2xl font-bold text-yellow-700 mt-2">
                    {stats.pendentes}
                  </p>
                </div>

                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <span className="text-xs text-gray-600 font-semibold">Aprovados</span>
                  <p className="text-2xl font-bold text-green-700 mt-2">
                    {stats.aprovados}
                  </p>
                </div>

                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <span className="text-xs text-gray-600 font-semibold">Valor Total</span>
                  <p className="text-lg font-bold text-black mt-2">
                    {formatBRL(totalValor)}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 flex-wrap mb-6">
                <div className="flex-1 min-w-48">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por nome, NF, fornecedor..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Tipo de documento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="orcamento">📊 Orçamento</SelectItem>
                    <SelectItem value="contrato">📜 Contrato</SelectItem>
                    <SelectItem value="nota_fiscal">🧾 Nota Fiscal</SelectItem>
                    <SelectItem value="recibo">✅ Recibo</SelectItem>
                    <SelectItem value="outro">📎 Outro</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pendente_revisao">⏳ Pendente</SelectItem>
                    <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                    <SelectItem value="rejeitado">❌ Rejeitado</SelectItem>
                    <SelectItem value="arquivado">📁 Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="text-center py-16 text-gray-400">
                  Carregando documentos...
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  Nenhum documento encontrado
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Documento
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Tipo
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Fornecedor
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Número
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Valor
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Vínculo
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Data
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-black text-sm">
                          Ações
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {documents.map((doc) => {
                        const statusConfig = getStatusConfig(doc._status);
                        const StatusIcon = statusConfig.icon;
                        const linked = !!doc.nf_pdf_attachment_id || !!doc.nf_xml_attachment_id;

                        return (
                          <tr
                            key={doc.id}
                            className="border-b border-gray-100 hover:bg-gray-50 transition"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {getTypeIcon(doc._tipo_documento)}
                                </span>
                                <div>
                                  <p className="font-semibold text-black text-sm truncate max-w-xs">
                                    {doc._nome_arquivo}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {doc.created_by || doc.uploadado_por || 'Entrada Única'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-sm text-black">
                              {getTypeLabel(doc._tipo_documento)}
                            </td>

                            <td className="py-3 px-4 text-sm text-black">
                              {doc._fornecedor}
                            </td>

                            <td className="py-3 px-4 text-sm font-semibold text-black">
                              {doc._numero_documento}
                            </td>

                            <td className="py-3 px-4 text-sm text-black">
                              {doc._valor_documento ? formatBRL(doc._valor_documento) : '—'}
                            </td>

                            <td className="py-3 px-4">
                              <div
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${statusConfig.color}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {linked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                  <LinkIcon className="w-3 h-3" />
                                  PDF/XML
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                                  Sem vínculo
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-sm text-gray-600">
                              {doc.nf_data_emissao
                                ? new Date(doc.nf_data_emissao).toLocaleDateString('pt-BR')
                                : new Date(doc.created_date).toLocaleDateString('pt-BR')}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex gap-1">
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 hover:bg-black/5 rounded transition"
                                  title="Visualizar"
                                >
                                  <Eye className="w-4 h-4 text-gray-600" />
                                </a>

                                <a
                                  href={doc.file_url}
                                  download={doc._nome_arquivo}
                                  className="p-2 hover:bg-black/5 rounded transition"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4 text-gray-600" />
                                </a>

                                {canDelete && (
                                  <button
                                    onClick={() => setDeleteTarget(doc)}
                                    className="p-2 hover:bg-red-50 rounded transition"
                                    title="Deletar"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(o) => !o && setDeleteTarget(null)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Arquivar documento?</AlertDialogTitle>
                  </AlertDialogHeader>

                  <p className="text-sm text-gray-600">
                    Tem certeza que deseja arquivar{' '}
                    <strong>{deleteTarget?._nome_arquivo}</strong>? O arquivo não será
                    apagado permanentemente.
                  </p>

                  <div className="flex gap-3 justify-end mt-6">
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>

                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={async () => {
                        try {
                          await base44.entities.Attachment.update(deleteTarget.id, {
                            status_registro: 'DELETADO',
                            deleted_at: new Date().toISOString(),
                            deleted_by: currentUser?.email || '',
                          });

                          toast.success('Documento arquivado.', { duration: 3000 });
                          queryClient.invalidateQueries({ queryKey: ['all-documents-attachments'] });
                          queryClient.invalidateQueries({ queryKey: ['attachments-compras'] });
                          setDeleteTarget(null);
                        } catch (e) {
                          toast.error(e?.message || 'Erro ao arquivar.', {
                            duration: 3000,
                          });
                        }
                      }}
                    >
                      Arquivar
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
