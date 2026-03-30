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
  Filter,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import RequireAuth from '@/components/auth/RequireAuth';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function GestaoDocumental() {
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['all-documents', filtroTipo, filtroStatus],
    queryFn: async () => {
      const all = await base44.entities.PurchaseDocument.list('-created_date', 500);
      
      return all.filter(d => {
        const matchSearch = !search || 
          d.nome_arquivo?.toLowerCase().includes(search.toLowerCase()) ||
          d.numero_documento?.toLowerCase().includes(search.toLowerCase()) ||
          d.fornecedor?.toLowerCase().includes(search.toLowerCase());
        
        const matchTipo = filtroTipo === 'all' || d.tipo_documento === filtroTipo;
        const matchStatus = filtroStatus === 'all' || d.status === filtroStatus;
        
        return matchSearch && matchTipo && matchStatus;
      });
    },
  });

  const totalValor = documents.reduce((sum, d) => sum + (d.valor_documento || 0), 0);

  const stats = {
    total: documents.length,
    pendentes: documents.filter(d => d.status === 'pendente_revisao').length,
    aprovados: documents.filter(d => d.status === 'aprovado').length,
    rejeitados: documents.filter(d => d.status === 'rejeitado').length,
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
      pendente_revisao: { label: 'Pendente', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
      aprovado: { label: 'Aprovado', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      rejeitado: { label: 'Rejeitado', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
      arquivado: { label: 'Arquivado', color: 'bg-gray-50 text-gray-700 border-gray-200', icon: FileText },
    };
    return config[status] || config.pendente_revisao;
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Gestão Documental</h1>
            <p className="text-gray-600">Documentos vinculados a compras e rubricas para auditoria e controle</p>
          </div>

          {/* Texto de apoio */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-blue-900">
              <strong>📋 Centralização de Documentos:</strong> Todos os orçamentos, contratos assinados, notas fiscais e recibos são centralizados aqui para fácil acesso, auditoria e controle de execução financeira do projeto.
            </p>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="border border-gray-200 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Total de Documentos</span>
              <p className="text-2xl font-bold text-black mt-2">{stats.total}</p>
            </div>
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Pendentes</span>
              <p className="text-2xl font-bold text-yellow-700 mt-2">{stats.pendentes}</p>
            </div>
            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Aprovados</span>
              <p className="text-2xl font-bold text-green-700 mt-2">{stats.aprovados}</p>
            </div>
            <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
              <span className="text-xs text-gray-600 font-semibold">Valor Total</span>
              <p className="text-lg font-bold text-black mt-2">
                R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-4 flex-wrap mb-6">
            <div className="flex-1 min-w-48">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nome, NF, fornecedor..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
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

          {/* Tabela */}
          {isLoading ? (
            <div className="text-center py-16 text-gray-400">Carregando documentos...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16 text-gray-400">Nenhum documento encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Documento</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Tipo</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Fornecedor</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Número</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Valor</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Data</th>
                    <th className="text-left py-3 px-4 font-semibold text-black text-sm">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => {
                    const statusConfig = getStatusConfig(doc.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getTypeIcon(doc.tipo_documento)}</span>
                            <div>
                              <p className="font-semibold text-black text-sm truncate max-w-xs">{doc.nome_arquivo}</p>
                              <p className="text-xs text-gray-500">{doc.uploadado_por}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-black">{getTypeLabel(doc.tipo_documento)}</td>
                        <td className="py-3 px-4 text-sm text-black">{doc.fornecedor || '—'}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-black">{doc.numero_documento || '—'}</td>
                        <td className="py-3 px-4 text-sm text-black">
                          {doc.valor_documento ? `R$ ${doc.valor_documento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${statusConfig.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {doc.data_documento ? new Date(doc.data_documento).toLocaleDateString('pt-BR') : new Date(doc.created_date).toLocaleDateString('pt-BR')}
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
                              download={doc.nome_arquivo}
                              className="p-2 hover:bg-black/5 rounded transition"
                              title="Download"
                            >
                              <Download className="w-4 h-4 text-gray-600" />
                            </a>
                            {currentUser?.role === 'COORDENADOR_GERAL' && (
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

          {/* Delete Dialog */}
          <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deletar documento?</AlertDialogTitle>
              </AlertDialogHeader>
              <p className="text-sm text-gray-600">
                Tem certeza que deseja deletar <strong>{deleteTarget?.nome_arquivo}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end mt-6">
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={async () => {
                    try {
                      await base44.entities.PurchaseDocument.delete(deleteTarget.id);
                      toast.success('Documento deletado.');
                      queryClient.invalidateQueries();
                      setDeleteTarget(null);
                    } catch (e) {
                      toast.error(e?.message || 'Erro ao deletar.');
                    }
                  }}
                >
                  Deletar
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
          </div>
          </div>
          </RequireAuth>
  );
}