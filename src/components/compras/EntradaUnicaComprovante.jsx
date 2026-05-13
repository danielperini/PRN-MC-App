import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, FileText, X, Loader2, CheckCircle, AlertTriangle, Link } from 'lucide-react';
import { toast } from 'sonner';

function fmtBRL(v) {
  const n = Number(String(v ?? '').replace(/\D/g, '').replace(',', '.'));
  return `R$ ${(isNaN(n) ? 0 : n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function EntradaUnicaComprovante({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [candidatoSelecionado, setCandidatoSelecionado] = useState(null);
  const [vinculando, setVinculando] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Apenas PDF aceito.');
      return;
    }
    setUploading(true);
    setResultado(null);
    try {
      const res = await base44.integrations.Core.UploadFile({ file: f });
      const url = res?.file_url || res?.data?.file_url || '';
      if (!url) throw new Error('Upload sem URL');
      setFile({ name: f.name, url });
    } catch (e) {
      toast.error('Erro no upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleProcessar() {
    if (!file?.url) return;
    setProcessando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('vincularComprovantePagamento', {
        comprovanteUrl: file.url,
      });
      setResultado(res.data);
      if (res.data?.success) {
        toast.success(`Vinculado automaticamente! Confiança: ${res.data.confianca}%`);
        onSuccess?.();
      } else if (res.data?.revisao_manual) {
        toast.warning('Confiança baixa. Selecione manualmente a solicitação correspondente.');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setProcessando(false);
    }
  }

  async function handleVincularManual() {
    if (!candidatoSelecionado || !file?.url) return;
    setVinculando(true);
    try {
      const res = await base44.functions.invoke('vincularComprovantePagamento', {
        comprovanteUrl: file.url,
        purchaseId: candidatoSelecionado,
      });
      if (res.data?.success) {
        toast.success('Comprovante vinculado manualmente.');
        setResultado(null);
        setFile(null);
        onSuccess?.();
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setVinculando(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-white">
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-black">Entrada Única de Comprovante</h3>
      </div>
      <p className="text-xs text-gray-500">
        Envie um PDF de comprovante de pagamento. A IA tentará vincular automaticamente à solicitação correspondente.
      </p>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-black transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Enviando...</span>
          </div>
        ) : file ? (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <FileText className="w-4 h-4" />
              <span className="truncate max-w-[200px]">{file.name}</span>
            </div>
            <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setResultado(null); }}
              className="text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <Upload className="w-5 h-5" />
            <span className="text-xs">Clique para selecionar PDF</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />

      {file && !resultado && (
        <Button size="sm" className="w-full bg-black text-white hover:bg-gray-800 gap-2" onClick={handleProcessar} disabled={processando}>
          {processando ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...</> : <>Analisar e Vincular Automaticamente</>}
        </Button>
      )}

      {resultado?.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2 text-sm text-green-800">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Vinculado automaticamente!</p>
            <p className="text-xs mt-0.5">Confiança: {resultado.confianca}% · {resultado.purchase?.descricao_item}</p>
          </div>
        </div>
      )}

      {resultado?.revisao_manual && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{resultado.mensagem}</span>
          </div>

          {resultado.candidatos?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-black">Selecione a solicitação correta:</p>
              {resultado.candidatos.map(c => (
                <label key={c.id} className={`flex items-start gap-2 p-2 border rounded-lg cursor-pointer text-xs transition-colors ${candidatoSelecionado === c.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                  <input type="radio" name="candidato" value={c.id} checked={candidatoSelecionado === c.id}
                    onChange={() => setCandidatoSelecionado(c.id)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-black truncate">{c.descricao_item}</p>
                    <p className="text-gray-500">{c.fornecedor_nome} · {fmtBRL(c.valor_solicitado)}</p>
                    <p className="text-gray-400">Score: {c._score}%</p>
                  </div>
                </label>
              ))}
              <Button size="sm" className="w-full bg-black text-white hover:bg-gray-800 gap-2"
                onClick={handleVincularManual} disabled={!candidatoSelecionado || vinculando}>
                {vinculando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
                {vinculando ? 'Vinculando...' : 'Vincular à solicitação selecionada'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}