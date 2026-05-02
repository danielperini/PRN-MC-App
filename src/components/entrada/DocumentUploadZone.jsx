import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileText, Image, X, AlertCircle, Loader2, FileType } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { validateFiles, formatFileSize, UPLOAD_CONFIG } from '@/lib/uploadConfig';

export default function DocumentUploadZone({ onFilesSelected, disabled, uploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [orientacoes, setOrientacoes] = useState('');
  const [fileErrors, setFileErrors] = useState([]);

  const isDisabled = disabled || uploading;

  useEffect(() => {
    if (fileErrors.length === 0) return;
    const timer = setTimeout(() => setFileErrors([]), 3000);
    return () => clearTimeout(timer);
  }, [fileErrors]);

  function dedupFiles(files) {
    const map = new Map();

    files.forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!map.has(key)) map.set(key, file);
    });

    return Array.from(map.values());
  }

  function handleFiles(files) {
    if (!files || files.length === 0 || isDisabled) return;

    const { valid, invalid } = validateFiles(files);

    if (invalid.length > 0) {
      setFileErrors(invalid.map((f) => `${f.name}: ${f.errors[0]}`));
    }

    if (valid.length === 0) return;

    setSelectedFiles((prev) => dedupFiles([...prev, ...valid]));

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(idx) {
    if (isDisabled) return;
    const updated = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(updated);
  }

  function clear() {
    if (isDisabled) return;
    setSelectedFiles([]);
    setOrientacoes('');
    setFileErrors([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleSubmit() {
    if (isDisabled || selectedFiles.length === 0) return;

    onFilesSelected(selectedFiles, orientacoes);

    setSelectedFiles([]);
    setOrientacoes('');
    setFileErrors([]);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function getFileIcon(file) {
    if (file.type.startsWith('image/')) {
      return <Image className="w-5 h-5 text-purple-400" />;
    }
    if (file.name.toLowerCase().endsWith('.xml')) {
      return <FileText className="w-5 h-5 text-green-500" />;
    }
    if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
      return <FileType className="w-5 h-5 text-blue-500" />;
    }
    return <FileText className="w-5 h-5 text-slate-400" />;
  }

  const hasFiles = selectedFiles.length > 0;

  return (
    <div className="w-full space-y-4">
      {!hasFiles ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDisabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !isDisabled && inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
            dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100',
            isDisabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Upload className="w-10 h-10 text-slate-400" />

          <p className="text-slate-600 font-medium text-center">
            Arraste os arquivos ou{' '}
            <span className="text-blue-600 underline">clique para selecionar</span>
          </p>

          <p className="text-xs text-slate-400 text-center">
            Suporta PDF, XML, Word (.docx) e imagens (JPG, PNG).
          </p>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="application/pdf,text/xml,application/xml,image/*,.xml,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isDisabled}
          />
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">
              {selectedFiles.length} arquivo(s) selecionado(s)
            </span>

            <button
              type="button"
              onClick={clear}
              disabled={isDisabled}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Limpar tudo
            </button>
          </div>

          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${idx}`}
              className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2"
            >
              {getFileIcon(file)}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-400">
                  {file.type || 'desconhecido'} · {formatFileSize(file.size)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeFile(idx)}
                disabled={isDisabled}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-blue-600 hover:underline mt-1 disabled:opacity-50"
            disabled={isDisabled}
          >
            + Adicionar mais arquivos
          </button>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="application/pdf,text/xml,application/xml,image/*,.xml,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isDisabled}
          />
        </div>
      )}

      {fileErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
          {fileErrors.map((error, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ))}

          <p className="text-xs text-red-600 mt-2">
            O limite máximo é {UPLOAD_CONFIG.MAX_SIZE_MB} MB por arquivo. Os arquivos válidos foram mantidos na seleção.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600 font-medium">
          Orientações para a IA{' '}
          <span className="text-slate-400 font-normal">(opcional)</span>
        </Label>

        <Textarea
          value={orientacoes}
          onChange={(e) => setOrientacoes(e.target.value)}
          placeholder="Escreva aqui alguma orientação para a análise. Exemplo: solicitar aprovação urgente ao coordenador, destacar que é pagamento retroativo, verificar gasto por rubrica, conferir vínculo com atividade ou observar centro de custo."
          className="resize-none text-sm min-h-[80px]"
          disabled={isDisabled}
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isDisabled || selectedFiles.length === 0}
          className="bg-black text-white hover:bg-gray-800"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Enviar {selectedFiles.length > 0 ? `${selectedFiles.length} arquivo(s)` : 'arquivo(s)'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}