import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Paperclip, FileText, Search, Download, Eye,
  Image, File, FileVideo, Music, Archive, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fileIcon(type = '') {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf')) return FileText;
  if (type.includes('zip') || type.includes('rar')) return Archive;
  return File;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GestorArquivosInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [filterMuseu, setFilterMuseu] = useState('all');
  const [filterMes, setFilterMes] = useState('all');

  // Fetch reports (for context / linking)
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['gestor-reports'],
    queryFn: () => isCoordenador
      ? base44.entities.Report.list('-created_date', 500)
      : base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date'),
    enabled: !!currentUser,
    staleTime: 30_000,
  });

  // Fetch all attachments
  const { data: attachments = [], isLoading: loadingAttachments } = useQuery({
    queryKey: ['gestor-attachments'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 500),
    enabled: !!currentUser,
    staleTime: 30_000,
  });

  // Build a report map for quick lookup
  const reportMap = Object.fromEntries(reports.map(r => [r.id, r]));

  // Filter attachments based on user role and filters
  const visible = attachments.filter(att => {
    const report = reportMap[att.report_id];
    // skip orphan attachments for non-coordinators
    if (!report) return isCoordenador;
    // professionals only see their own
    if (!isCoordenador && report?.created_by !== currentUser?.email) return false;
    // museu filter
    if (filterMuseu !== 'all' && report?.museu !== filterMuseu) return false;
    // mes filter
    if (filterMes !== 'all' && report?.mes_referencia !== filterMes) return false;
    // search
    if (search) {
      const q = search.toLowerCase();
      if (
        !att.file_name?.toLowerCase().includes(q) &&
        !report?.author_name?.toLowerCase().includes(q) &&
        !report?.museu?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const isLoading = loadingReports || loadingAttachments;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-3">
            <Paperclip className="w-7 h-7" />
            Gestor de Arquivos
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isCoordenador
              ? `${visible.length} arquivo(s) encontrado(s) em todos os relatórios`
              : `${visible.length} arquivo(s) dos seus relatórios`}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar arquivo, profissional ou museu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {isCoordenador && (
            <>
              <Select value={filterMuseu} onValueChange={setFilterMuseu}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue placeholder="Museu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">— Museu —</SelectItem>
                  {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMes} onValueChange={setFilterMes}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">— Mês —</SelectItem>
                  {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Files grid */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando arquivos...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
            <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum arquivo encontrado</p>
            <p className="text-xs text-gray-400 mt-1">Os arquivos são adicionados nos relatórios mensais</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(att => {
              const report = reportMap[att.report_id];
              const IconComp = fileIcon(att.file_type);
              return (
                <div
                  key={att.id}
                  className="p-4 border border-gray-100 rounded-xl hover:border-gray-300 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <IconComp className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-black text-sm truncate" title={att.file_name}>
                        {att.file_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatSize(att.file_size)}</p>
                    </div>
                  </div>

                  {report && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        {report.author_name} · {report.mes_referencia} {report.ano}
                      </p>
                      <p className="text-xs text-gray-400">{report.museu}</p>
                      {att.activity_id && (
                        <p className="text-xs text-blue-500 mt-0.5">
                          Atividade {att.activity_id.replace('activity_', '#')}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
                        <Eye className="w-3 h-3" />Ver
                      </Button>
                    </a>
                    <a href={att.file_url} download={att.file_name} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
                        <Download className="w-3 h-3" />Baixar
                      </Button>
                    </a>
                    {report && (
                      <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs px-2">
                          <FileText className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GestorArquivos() {
  return <RequireAuth><GestorArquivosInner /></RequireAuth>;
}