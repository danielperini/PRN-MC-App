import React, { useRef, useState } from 'react';
import { Upload, FileText, Image, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DocumentUploadZone({ onFileSelected, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);

  function handleFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    setPreview({ name: file.name, type: file.type, isImage, url: isImage ? URL.createObjectURL(file) : null });
    onFileSelected(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function clear() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="w-full">
      {!preview ? (
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
            Arraste o arquivo ou <span className="text-blue-600 underline">clique para selecionar</span>
          </p>
          <p className="text-xs text-slate-400 text-center">
            Suporta: PDF, XML, imagens (JPG, PNG, WEBP) e documentos administrativos
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="application/pdf,text/xml,application/xml,image/*,.xml"
            onChange={(e) => handleFile(e.target.files[0])}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-4 bg-white">
          {preview.isImage ? (
            <img src={preview.url} alt="preview" className="w-16 h-16 object-cover rounded-lg border" />
          ) : (
            <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center border">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{preview.name}</p>
            <p className="text-xs text-slate-400">{preview.type}</p>
          </div>
          <button
            onClick={clear}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}