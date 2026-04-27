import React, { useRef, useState } from 'react';
import { Upload, FileText, Image, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function DocumentUploadZone({ onFilesSelected, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [orientacoes, setOrientacoes] = useState('');

  function handleFiles(files) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setSelectedFiles(fileArray);
    onFilesSelected(fileArray, orientacoes);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(idx) {
    const updated = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(updated);
  }

  function clear() {
    setSelectedFiles([]);
    setOrientacoes('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function getFileIcon(file) {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5 text-purple-400" />;
    if (file.name.endsWith('.xml')) return <FileText className="w-5 h-5 text-green-500" />;
    return <FileText className="w-5 h-5 text-slate-400" />;
  }

  const hasFiles = selectedFiles.length > 0;

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      {!hasFiles ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Upload className="w-10 h-10 text-slate-400" />
          <p className="text-slate-600 font-medium text-center">
            Arraste os arquivos ou <span className="text-blue-600 underline">clique para selecionar</span>
          </p>
          <p className="text-xs text-slate-400 text-center">
            Suporta múltiplos arquivos: PDF, XML, imagens (JPG, PNG, WEBP) e documentos administrativos
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="application/pdf,text/xml,application/xml,image/*,.xml"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">{selectedFiles.length} arquivo(s) selecionado(s)</span>
            <button
              onClick={clear}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition"
            >
              <X className="w-3.5 h-3.5" /> Limpar tudo
            </button>
          </div>
          {selectedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
              {getFileIcon(file)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{file.type || 'desconhecido'} · {(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                onClick={() => removeFile(idx)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {/* Adicionar mais arquivos */}
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-blue-600 hover:underline mt-1"
            disabled={disabled}
          >
            + Adicionar mais arquivos
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="application/pdf,text/xml,application/xml,image/*,.xml"
            multiple
            onChange={(e) => {
              const added = Array.from(e.target.files || []);
              setSelectedFiles(prev => [...prev, ...added]);
            }}
            disabled={disabled}
          />
        </div>
      )}

      {/* Orientações para IA */}
      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600 font-medium">Orientações para a IA <span className="text-slate-400 font-normal">(opcional)</span></Label>
        <Textarea
          value={orientacoes}
          onChange={(e) => setOrientacoes(e.target.value)}
          placeholder="Escreva aqui alguma orientação para a análise. Exemplo: solicitar aprovação urgente ao coordenador, destacar que é pagamento retroativo, verificar gasto por rubrica, conferir vínculo com atividade ou observar centro de custo."
          className="resize-none text-sm min-h-[80px]"
          disabled={disabled}
        />
      </div>
    </div>
  );
}