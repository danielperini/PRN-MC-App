import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileJson, Archive, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, User, Calendar, Building2,
  Activity, Image, ClipboardCheck, X, Info
} from 'lucide-react';

// ── SHA-256 helper (browser WebCrypto) ──
async function calcSha256(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Detect media files ──
function isMedia(name) {
  return /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|pdf)$/i.test(name || '');
}

// ── Parse ZIP using basic central directory reading ──
// We use JSZip-free approach: upload each file individually via UploadFile
// The ZIP is extracted client-side using the browser's DecompressionStream if available,
// or we guide the user to upload files individually.
// For robustness, we accept either a ZIP (extract in-browser) or a folder of loose files.

async function extractFilesFromZip(zipFile) {
  // Use fflate via dynamic import from a CDN — only if available
  // If not, return null so the UI can show instructions
  try {
    const fflate = await import('https://esm.sh/fflate@0.8.2');
    const ab = await zipFile.arrayBuffer();
    const uint8 = new Uint8Array(ab);
    const files = [];

    await new Promise((resolve, reject) => {
      fflate.unzip(uint8, (err, unzipped) => {
        if (err) { reject(err); return; }
        for (const [path, data] of Object.entries(unzipped)) {
          // Skip directories and __MACOSX
          if (path.endsWith('/') || path.includes('__MACOSX') || path.includes('.DS_Store')) continue;
          const fileName = path.split('/').pop();
          if (!fileName || !isMedia(fileName)) continue;
          const blob = new Blob([data]);
          const file = new File([blob], fileName, { type: getMimeType(fileName) });
          files.push(file);
        }
        resolve();
      });
    });

    return files;
  } catch (e) {
    console.error('Erro ao extrair ZIP:', e);
    return null;
  }
}

function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', pdf: 'application/pdf' };
  return map[ext] || 'application/octet-stream';
}

function normalizarNome(nome) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

// ── ItemPreview card ──
function ItemCard({ item, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const d = item.dados_ia || item;
  const atividades = d.atividades || item.atividades || [];
  const confianca = item.confianca || 0;
  const colorConf = confianca >= 70 ? 'bg-green-100 text-green-700' : confianca >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

  return (
    <div className={`rounded-xl border p-4 space-y-2 transition-colors ${item.selecionado ? 'border-black bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={!!item.selecionado} onChange={() => onToggle(item)}
          className="mt-1 w-4 h-4 rounded accent-black shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-black truncate">{item.arquivo_nome || item.titulo || 'Sem nome'}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorConf}`}>{confianca}% confiança</span>
            {item.duplicidade === 'provavel' && (
              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 bg-orange-50">Possível duplicata</Badge>
            )}
            {item.usuario_status === 'localizado' && (
              <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50"><User className="w-3 h-3 mr-1" />Usuário ok</Badge>
            )}
            {item.usuario_status === 'nao_localizado' && (
              <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50"><User className="w-3 h-3 mr-1" />Usuário não localizado</Badge>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-gray-400 hover:text-black">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pl-7">
        <span className="flex items-center gap-1 text-gray-600"><User className="w-3 h-3" />{item.profissional_nome || d.nome_profissional || '—'}</span>
        <span className="flex items-center gap-1 text-gray-600"><Building2 className="w-3 h-3" />{item.museu || d.museu || '—'}</span>
        <span className="flex items-center gap-1 text-gray-600"><Calendar className="w-3 h-3" />{item.mes || d.mes_referencia || '—'}/{item.ano || d.ano || '—'}</span>
        <span className="flex items-center gap-1 text-gray-600"><Activity className="w-3 h-3" />{atividades.length} atividade{atividades.length !== 1 ? 's' : ''}</span>
      </div>

      {expanded && (
        <div className="pl-7 border-t border-gray-100 pt-2 space-y-2">
          {item.usuario_vinculado && (
            <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              Usuário: {item.usuario_vinculado.nome} — {item.usuario_vinculado.email}
            </div>
          )}
          {item.duplicidade === 'provavel' && (
            <div className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              Possível duplicata — confira antes de importar.
            </div>
          )}
          {atividades.slice(0, 5).map((a, i) => (
            <p key={i} className="text-xs text-gray-600">• {a.titulo} {a.classificacao ? `(${a.classificacao})` : ''}</p>
          ))}
          {atividades.length > 5 && <p className="text-xs text-gray-400">+ {atividades.length - 5} mais...</p>}
          {item.campos_ausentes?.length > 0 && (
            <p className="text-xs text-amber-600"><AlertTriangle className="w-3 h-3 inline mr-1" />Campos ausentes: {item.campos_ausentes.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──
export default function ImportarPacoteRelatorios() {
  const [collapsed, setCollapsed] = useState(true);
  const [jsonData, setJsonData] = useState(null);  // parsed preview JSON
  const [jsonFile, setJsonFile] = useState(null);
  const [zipFile, setZipFile] = useState(null);
  const [midias, setMidias] = useState([]);         // { nome_arquivo, file_url, sha256, legenda }
  const [processandoZip, setProcessandoZip] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [resultadoImport, setResultadoImport] = useState(null);
  const jsonInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const midiaInputRef = useRef(null);

  // ── Load JSON ──
  async function handleJsonChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFile(file);
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      setJsonData(parsed);
      toast.success('JSON carregado com sucesso.');
    } catch {
      toast.error('Arquivo JSON inválido.');
      setJsonFile(null);
    }
    e.target.value = '';
  }

  // ── Load ZIP ──
  async function handleZipChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipFile(file);
    setProcessandoZip(true);
    setProgresso('Extraindo arquivos do ZIP...');
    try {
      const extraidos = await extractFilesFromZip(file);
      if (!extraidos) {
        toast.warning('Não foi possível extrair o ZIP automaticamente. Use o campo de "mídias avulsas".');
        setProcessandoZip(false);
        setProgresso('');
        return;
      }
      await uploadMidias(extraidos);
    } catch (err) {
      toast.error('Erro ao processar ZIP: ' + err.message);
    } finally {
      setProcessandoZip(false);
      setProgresso('');
    }
    e.target.value = '';
  }

  // ── Load loose media files ──
  async function handleMidiaChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setProcessandoZip(true);
    setProgresso(`Subindo ${files.length} arquivo(s)...`);
    try {
      await uploadMidias(files);
    } finally {
      setProcessandoZip(false);
      setProgresso('');
    }
    e.target.value = '';
  }

  async function uploadMidias(files) {
    const novasMidias = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgresso(`Subindo ${i + 1}/${files.length}: ${file.name}`);
      try {
        const ab = await file.arrayBuffer();
        const sha256 = await calcSha256(ab);

        // Skip duplicates already uploaded this session
        const jaExiste = midias.find(m => m.sha256 === sha256);
        if (jaExiste) continue;

        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) { console.warn('Upload sem URL:', file.name); continue; }

        novasMidias.push({ nome_arquivo: file.name, file_url, sha256, legenda: '' });
      } catch (err) {
        console.error('Erro ao subir mídia:', file.name, err);
      }
    }
    setMidias(prev => [...prev, ...novasMidias]);
    if (novasMidias.length > 0) toast.success(`${novasMidias.length} mídia(s) prontas para vinculação.`);
  }

  // ── Toggle item ──
  function handleToggle(item) {
    setJsonData(prev => {
      const lista = Array.isArray(prev) ? prev : (prev?.resultados || []);
      const atualizada = lista.map(i =>
        (i.arquivo_id || i.arquivo_nome) === (item.arquivo_id || item.arquivo_nome)
          ? { ...i, selecionado: !i.selecionado }
          : i
      );
      return Array.isArray(prev) ? atualizada : { ...prev, resultados: atualizada };
    });
  }

  function getItens() {
    if (!jsonData) return [];
    return Array.isArray(jsonData) ? jsonData : (jsonData.resultados || []);
  }

  function getSelecionados() {
    return getItens().filter(i => i.selecionado !== false);
  }

  // ── Confirmar importação ──
  async function handleConfirmar() {
    const selecionados = getSelecionados();
    if (selecionados.length === 0) {
      toast.warning('Selecione ao menos um relatório.'); return;
    }
    setLoadingImport(true);
    setProgresso('Importando relatórios...');
    try {
      const res = await base44.functions.invoke('restaurarRelatoriosPrevisualizados', {
        preview_json: selecionados,
        midias,
      });
      setResultadoImport(res.data);
      toast.success(`Importação concluída: ${res.data.total_sucesso}/${res.data.total_processados} relatório(s).`);
    } catch (e) {
      toast.error('Erro na importação: ' + (e?.message || e));
    } finally {
      setLoadingImport(false);
      setProgresso('');
    }
  }

  const itens = getItens();
  const selecionadosCount = getSelecionados().length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Archive className="w-4 h-4 text-black" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Importar pacote de relatórios</p>
            <p className="text-xs text-gray-500">JSON de pré-visualização + ZIP de mídias — importação controlada com pré-confirmação</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">

          {/* Info box */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-600 flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
            <div className="space-y-1">
              <p>1. Carregue o <strong>JSON</strong> de pré-visualização gerado pelo sistema.</p>
              <p>2. Carregue o <strong>ZIP</strong> com os PDFs e mídias (fotos/vídeos) <em>ou</em> selecione os arquivos avulsos.</p>
              <p>3. Revise a lista e desmarque o que não deve ser importado.</p>
              <p>4. Clique em <strong>Confirmar importação</strong>. Nenhum dado é gravado antes disso.</p>
            </div>
          </div>

          {/* File inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* JSON */}
            <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 cursor-pointer transition-colors ${jsonFile ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-400'}`}>
              <FileJson className={`w-7 h-7 ${jsonFile ? 'text-green-600' : 'text-gray-400'}`} />
              <span className="text-xs font-semibold text-gray-700 text-center">
                {jsonFile ? jsonFile.name : 'Selecionar JSON de pré-visualização'}
              </span>
              {jsonFile && <span className="text-[10px] text-green-600">{itens.length} relatório{itens.length !== 1 ? 's' : ''} detectado{itens.length !== 1 ? 's' : ''}</span>}
              <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonChange} />
            </label>

            {/* ZIP */}
            <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 cursor-pointer transition-colors ${zipFile ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-400'}`}>
              <Archive className={`w-7 h-7 ${zipFile ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="text-xs font-semibold text-gray-700 text-center">
                {zipFile ? zipFile.name : 'Selecionar ZIP de mídias'}
              </span>
              {midias.length > 0 && <span className="text-[10px] text-blue-600">{midias.length} mídia{midias.length !== 1 ? 's' : ''} pronta{midias.length !== 1 ? 's' : ''}</span>}
              <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleZipChange} />
            </label>

            {/* Loose files */}
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-5 cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="w-7 h-7 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700 text-center">Ou enviar mídias avulsas</span>
              <span className="text-[10px] text-gray-400">JPG, PNG, MP4, PDF...</span>
              <input ref={midiaInputRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden" onChange={handleMidiaChange} />
            </label>
          </div>

          {/* Progress */}
          {(processandoZip || loadingImport) && progresso && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500 shrink-0" />
              <p className="text-xs text-gray-600">{progresso}</p>
            </div>
          )}

          {/* Mídias subidas */}
          {midias.length > 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                <Image className="w-3.5 h-3.5" />{midias.length} mídia{midias.length !== 1 ? 's' : ''} pronta{midias.length !== 1 ? 's' : ''} para vinculação
              </p>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {midias.map((m, i) => (
                  <span key={i} className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 flex items-center gap-1">
                    {m.nome_arquivo}
                    <button onClick={() => setMidias(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preview list */}
          {itens.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-black">
                  {itens.length} relatório{itens.length !== 1 ? 's' : ''} no pacote
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setJsonData(prev => {
                    const lista = Array.isArray(prev) ? prev : (prev?.resultados || []);
                    const todos = lista.map(i => ({ ...i, selecionado: true }));
                    return Array.isArray(prev) ? todos : { ...prev, resultados: todos };
                  })} className="text-xs text-blue-600 hover:underline">Selecionar todos</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setJsonData(prev => {
                    const lista = Array.isArray(prev) ? prev : (prev?.resultados || []);
                    const nenhum = lista.map(i => ({ ...i, selecionado: false }));
                    return Array.isArray(prev) ? nenhum : { ...prev, resultados: nenhum };
                  })} className="text-xs text-gray-500 hover:underline">Desmarcar todos</button>
                  {selecionadosCount > 0 && (
                    <span className="text-xs font-semibold bg-black text-white rounded-full px-2.5 py-0.5">{selecionadosCount} selecionado{selecionadosCount > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {itens.map((item, i) => (
                  <ItemCard key={item.arquivo_id || item.arquivo_nome || i} item={item} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          )}

          {/* Confirm button */}
          {itens.length > 0 && (
            <Button
              onClick={handleConfirmar}
              disabled={loadingImport || processandoZip || selecionadosCount === 0}
              className="w-full gap-2 bg-black text-white hover:bg-gray-800"
            >
              {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
              {loadingImport ? 'Importando...' : `Confirmar importação (${selecionadosCount} relatório${selecionadosCount !== 1 ? 's' : ''})`}
            </Button>
          )}

          {/* Result */}
          {resultadoImport && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm font-semibold text-green-800">
                  Importação concluída — {resultadoImport.total_sucesso}/{resultadoImport.total_processados} processado{resultadoImport.total_sucesso !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {resultadoImport.resultados?.map((r, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs ${r.status === 'ok' ? 'bg-white border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className="font-semibold text-gray-700 truncate">{r.arquivo_nome}</p>
                    <p className="text-gray-500">{r.atividades_criadas} atividade{r.atividades_criadas !== 1 ? 's' : ''} · {r.fotos_criadas} foto{r.fotos_criadas !== 1 ? 's' : ''} · {r.fotos_puladas} pulada{r.fotos_puladas !== 1 ? 's' : ''}</p>
                    {r.avisos?.length > 0 && <p className="text-amber-600 mt-0.5">{r.avisos.slice(0, 3).join(' · ')}{r.avisos.length > 3 ? ` +${r.avisos.length - 3}` : ''}</p>}
                    {r.erros?.length > 0 && <p className="text-red-600 mt-0.5">{r.erros.join(', ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}