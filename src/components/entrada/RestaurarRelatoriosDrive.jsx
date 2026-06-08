import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, Eye, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp,
  Loader2, User, Calendar, Building2, Activity, Image, ClipboardCheck
} from 'lucide-react';

function ConfiancaBadge({ value }) {
  const color = value >= 70 ? 'bg-green-100 text-green-700' : value >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>{value}% confiança</span>;
}

function DuplicidadeBadge({ value }) {
  if (value === 'provavel') return <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 bg-orange-50">Possível duplicata</Badge>;
  return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">Novo</Badge>;
}

function ItemPreview({ item, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border ${item.selecionado ? 'border-black bg-white' : 'border-gray-200 bg-gray-50'} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <input
            type="checkbox"
            checked={!!item.selecionado}
            onChange={() => onToggle(item.arquivo_id)}
            className="mt-1 w-4 h-4 rounded accent-black shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-black truncate">{item.arquivo_nome}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <ConfiancaBadge value={item.confianca} />
              <DuplicidadeBadge value={item.duplicidade} />
              {item.usuario_status === 'localizado' && (
                <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">
                  <User className="w-3 h-3 mr-1" />Usuário encontrado
                </Badge>
              )}
              {item.usuario_status === 'nao_localizado' && (
                <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 bg-red-50">
                  <User className="w-3 h-3 mr-1" />Usuário não localizado
                </Badge>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-gray-400 hover:text-black mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600">
          <User className="w-3.5 h-3.5" />
          <span className="truncate">{item.profissional_nome || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600">
          <Building2 className="w-3.5 h-3.5" />
          <span>{item.museu || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600">
          <Calendar className="w-3.5 h-3.5" />
          <span>{item.mes ? `${item.mes}/${item.ano}` : item.ano || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600">
          <Activity className="w-3.5 h-3.5" />
          <span>{item.atividades_count} atividade{item.atividades_count !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-gray-500">
          <Image className="w-3.5 h-3.5" />{item.fotos_count} foto{item.fotos_count !== 1 ? 's' : ''}
        </span>
        {item.publico_total > 0 && (
          <span className="text-gray-500">👥 {item.publico_total.toLocaleString('pt-BR')} público</span>
        )}
        {item.campos_ausentes?.length > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            {item.campos_ausentes.length} campo{item.campos_ausentes.length > 1 ? 's' : ''} ausente{item.campos_ausentes.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {item.usuario_vinculado && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs">
              <p className="font-semibold text-blue-700">Usuário vinculado</p>
              <p className="text-blue-600">{item.usuario_vinculado.nome} — {item.usuario_vinculado.email}</p>
            </div>
          )}
          {item.campos_ausentes?.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs">
              <p className="font-semibold text-amber-700">Campos ausentes</p>
              <p className="text-amber-600">{item.campos_ausentes.join(', ')}</p>
            </div>
          )}
          {item.duplicidade === 'provavel' && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-orange-700">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Possível relatório duplicado para este profissional/mês/ano. Verifique antes de importar.
            </div>
          )}
          {item.dados_ia?.atividades?.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-gray-700">Atividades identificadas</p>
              {item.dados_ia.atividades.slice(0, 5).map((a, i) => (
                <p key={i} className="text-gray-600">• {a.titulo} {a.classificacao ? `(${a.classificacao})` : ''}</p>
              ))}
              {item.dados_ia.atividades.length > 5 && (
                <p className="text-gray-400">+ {item.dados_ia.atividades.length - 5} mais...</p>
              )}
            </div>
          )}
          {item.fotos_vinculadas?.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-gray-700">Fotos associadas</p>
              {item.fotos_vinculadas.slice(0, 3).map((f, i) => (
                <p key={i} className="text-gray-600 truncate">• {f.nome}</p>
              ))}
            </div>
          )}
          {item.erro_ia && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
              Erro na análise IA: {item.erro_ia}
            </div>
          )}
          {item.arquivo_url && (
            <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <FolderOpen className="w-3.5 h-3.5" /> Abrir PDF no Drive
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function RestaurarRelatoriosDrive() {
  const [collapsed, setCollapsed] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [preview, setPreview] = useState(null);
  const [resultadoImport, setResultadoImport] = useState(null);

  const FOLDER_ID = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';

  async function handlePreview() {
    setLoadingPreview(true);
    setPreview(null);
    setResultadoImport(null);
    try {
      const res = await base44.functions.invoke('previewImportarRelatoriosDrive', { folder_id: FOLDER_ID });
      setPreview(res.data);
      toast.success(`${res.data.total_pdfs} PDF(s) analisado(s) com sucesso.`);
    } catch (e) {
      toast.error('Erro ao analisar pasta do Drive: ' + (e?.message || e));
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleToggle(arquivoId) {
    setPreview(prev => ({
      ...prev,
      resultados: prev.resultados.map(r =>
        r.arquivo_id === arquivoId ? { ...r, selecionado: !r.selecionado } : r
      )
    }));
  }

  async function handleConfirmar() {
    if (!preview) return;
    const selecionados = preview.resultados.filter(r => r.selecionado);
    if (selecionados.length === 0) {
      toast.warning('Selecione ao menos um relatório para importar.');
      return;
    }
    setLoadingImport(true);
    try {
      const res = await base44.functions.invoke('confirmarImportacaoRelatoriosDrive', {
        itens_confirmados: selecionados
      });
      setResultadoImport(res.data);
      toast.success(`Importação concluída: ${res.data.total_sucesso} relatório(s) processado(s).`);
    } catch (e) {
      toast.error('Erro na importação: ' + (e?.message || e));
    } finally {
      setLoadingImport(false);
    }
  }

  const selecionadosCount = preview?.resultados?.filter(r => r.selecionado).length || 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-black" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Restaurar relatórios do Drive</p>
            <p className="text-xs text-gray-500">Reimportar PDFs de relatórios a partir do Google Drive com pré-visualização</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
            <p><strong>Pasta:</strong> Relatórios exportados em PDF</p>
            <a href={`https://drive.google.com/drive/folders/${FOLDER_ID}`} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1">
              <FolderOpen className="w-3 h-3" /> Abrir pasta no Drive
            </a>
            <p className="text-gray-400 mt-1">Nenhum dado é gravado no banco sem sua confirmação explícita.</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handlePreview}
              disabled={loadingPreview || loadingImport}
              variant="outline"
              className="gap-2 text-sm"
            >
              {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {loadingPreview ? 'Analisando PDFs...' : 'Pré-visualizar relatórios do Drive'}
            </Button>

            {preview && selecionadosCount > 0 && (
              <Button
                onClick={handleConfirmar}
                disabled={loadingImport || loadingPreview}
                className="gap-2 text-sm bg-black text-white hover:bg-gray-800"
              >
                {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                {loadingImport ? 'Importando...' : `Confirmar importação (${selecionadosCount})`}
              </Button>
            )}
          </div>

          {loadingPreview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">Analisando PDFs com IA...</p>
              <p className="text-xs text-gray-400 mt-1">Isso pode levar alguns minutos dependendo da quantidade de arquivos.</p>
            </div>
          )}

          {preview && !loadingPreview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-black">
                    {preview.total_pdfs} PDF{preview.total_pdfs !== 1 ? 's' : ''} encontrado{preview.total_pdfs !== 1 ? 's' : ''}
                  </p>
                  <span className="text-xs text-gray-500">{preview.total_imagens} imagem{preview.total_imagens !== 1 ? 'ns' : ''}</span>
                </div>
                {selecionadosCount > 0 && (
                  <span className="text-xs font-semibold text-black bg-gray-100 rounded-full px-3 py-1">
                    {selecionadosCount} selecionado{selecionadosCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {preview.resultados?.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Nenhum PDF de relatório encontrado na pasta.</div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {preview.resultados.map(item => (
                    <ItemPreview key={item.arquivo_id} item={item} onToggle={handleToggle} />
                  ))}
                </div>
              )}
            </div>
          )}

          {resultadoImport && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm font-semibold text-green-800">
                  Importação concluída — {resultadoImport.total_sucesso}/{resultadoImport.total_processados} processado{resultadoImport.total_sucesso !== 1 ? 's' : ''}
                </p>
              </div>
              {resultadoImport.resultados?.map((r, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-xs ${r.status === 'ok' ? 'bg-white border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className="font-semibold text-gray-700 truncate">{r.arquivo_nome}</p>
                  <p className="text-gray-500">
                    {r.atividades_criadas} atividade{r.atividades_criadas !== 1 ? 's' : ''} · {r.fotos_criadas} foto{r.fotos_criadas !== 1 ? 's' : ''}
                    {r.avisos?.length > 0 && ` · ${r.avisos.length} aviso${r.avisos.length > 1 ? 's' : ''}`}
                  </p>
                  {r.erros?.length > 0 && <p className="text-red-600 mt-1">{r.erros.join(', ')}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}