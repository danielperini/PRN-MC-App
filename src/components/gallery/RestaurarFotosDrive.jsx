import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, Eye, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Image, ClipboardCheck, Camera
} from 'lucide-react';

const PASTAS_SUGERIDAS = [
  { label: 'Relatórios Mensais (pasta padrão)', id: '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ' },
];

function FotoPreviewCard({ foto }) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${foto.ja_importada ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-black bg-white'}`}>
      <div className="flex gap-3 items-start">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
          {foto.thumbnail_url ? (
            <img src={foto.thumbnail_url} alt={foto.file_name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Camera className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs font-semibold text-black truncate">{foto.drive_nome_original}</p>
          {foto.legenda && (
            <p className="text-xs text-blue-600 italic leading-snug">{foto.legenda}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {foto.museu && (
              <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">{foto.museu}</span>
            )}
            {foto.mes && (
              <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{foto.mes}/{foto.ano}</span>
            )}
            {foto.atividade_titulo && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded truncate max-w-[160px]">{foto.atividade_titulo}</span>
            )}
            {foto.report_autor && (
              <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded truncate max-w-[120px]">{foto.report_autor}</span>
            )}
            {foto.ja_importada && (
              <Badge variant="outline" className="text-[10px] border-gray-300 text-gray-500">Já importada</Badge>
            )}
          </div>
        </div>
      </div>
      {foto.drive_url && (
        <a href={foto.drive_url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
          <FolderOpen className="w-3 h-3" /> Ver no Drive
        </a>
      )}
    </div>
  );
}

export default function RestaurarFotosDrive({ onImportConcluida }) {
  const [collapsed, setCollapsed] = useState(true);
  const [folderId, setFolderId] = useState(PASTAS_SUGERIDAS[0].id);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);

  async function handlePreview() {
    if (!folderId.trim()) { toast.warning('Informe o ID da pasta do Drive.'); return; }
    setLoadingPreview(true);
    setPreview(null);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('restaurarGaleriaDrive', { folder_id: folderId.trim(), modo: 'preview' });
      setPreview(res.data);
      toast.success(`${res.data.total_imagens} imagem(ns) encontrada(s). ${res.data.total_novas} nova(s).`);
    } catch (e) {
      toast.error('Erro ao analisar pasta: ' + (e?.message || e));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirmar() {
    if (!preview) return;
    const novas = preview.resultados?.filter(r => !r.ja_importada) || [];
    if (novas.length === 0) { toast.warning('Nenhuma foto nova para importar.'); return; }
    setLoadingImport(true);
    try {
      const res = await base44.functions.invoke('restaurarGaleriaDrive', { folder_id: folderId.trim(), modo: 'confirmar' });
      setResultado(res.data);
      toast.success(`${res.data.total_criadas} foto(s) importada(s) com legendas automáticas!`);
      if (onImportConcluida) onImportConcluida();
    } catch (e) {
      toast.error('Erro na importação: ' + (e?.message || e));
    } finally {
      setLoadingImport(false);
    }
  }

  const novas = preview?.resultados?.filter(r => !r.ja_importada) || [];
  const jaImportadas = preview?.resultados?.filter(r => r.ja_importada) || [];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Image className="w-4 h-4 text-black" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Restaurar fotos do Drive</p>
            <p className="text-xs text-gray-500">Importar imagens do Google Drive com nomeação, vínculo a atividades e legendas automáticas</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          {/* Pasta */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">ID da pasta do Google Drive</label>
            <div className="flex gap-2">
              <input
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
                placeholder="Cole o ID da pasta do Drive..."
                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {PASTAS_SUGERIDAS.map(p => (
                <button key={p.id} type="button"
                  onClick={() => setFolderId(p.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${folderId === p.id ? 'border-black bg-black text-white' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-0.5">
            <p>✅ Detecta automaticamente museu, mês e ano pelo nome do arquivo</p>
            <p>🔗 Vincula cada foto à atividade correspondente no relatório</p>
            <p>📝 Gera legenda no formato: Atividade — Local — Data</p>
            <p>🔁 Não duplica fotos já importadas anteriormente</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handlePreview} disabled={loadingPreview || loadingImport} variant="outline" className="gap-2 text-sm">
              {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {loadingPreview ? 'Analisando...' : 'Pré-visualizar fotos'}
            </Button>

            {preview && novas.length > 0 && (
              <Button onClick={handleConfirmar} disabled={loadingImport || loadingPreview} className="gap-2 text-sm bg-black text-white hover:bg-gray-800">
                {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                {loadingImport ? 'Importando...' : `Importar ${novas.length} foto(s)`}
              </Button>
            )}
          </div>

          {loadingPreview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">Escaneando pasta e vinculando atividades...</p>
            </div>
          )}

          {preview && !loadingPreview && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-black">{preview.total_imagens} imagens encontradas</span>
                {novas.length > 0 && (
                  <Badge className="bg-green-100 text-green-700 border-green-200">{novas.length} novas</Badge>
                )}
                {jaImportadas.length > 0 && (
                  <Badge variant="outline" className="text-gray-500">{jaImportadas.length} já importadas</Badge>
                )}
              </div>

              {novas.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Todas as fotos desta pasta já foram importadas anteriormente.
                </div>
              )}

              {novas.length > 0 && (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Fotos novas para importar</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {novas.map((foto, i) => (
                      <FotoPreviewCard key={foto.drive_file_id || i} foto={foto} />
                    ))}
                  </div>
                </div>
              )}

              {jaImportadas.length > 0 && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Ver {jaImportadas.length} já importadas</summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {jaImportadas.map((foto, i) => (
                      <FotoPreviewCard key={foto.drive_file_id || i} foto={foto} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {resultado && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm font-semibold text-green-800">
                  {resultado.total_criadas} foto(s) importada(s) com legendas automáticas
                </p>
              </div>
              {resultado.total_erros > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {resultado.total_erros} com erro ao salvar
                </p>
              )}
              <p className="text-xs text-green-600">
                As fotos agora aparecem na galeria com museu, período e atividade vinculados.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}