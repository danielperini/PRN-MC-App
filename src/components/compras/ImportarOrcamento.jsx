import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportarOrcamento({ onSuccess }) {
  const inputRef = useRef();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = await base44.auth.getToken?.() || '';
      const appId = import.meta.env.VITE_APP_ID || '';

      const res = await fetch(`/api/functions/importBudgetLines`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-app-id': appId,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao importar');

      setResult({ success: true, count: data.imported });
      toast.success(`${data.imported} rubricas importadas com sucesso!`);
      onSuccess?.();
    } catch (err) {
      setResult({ success: false, error: err.message });
      toast.error('Erro na importação: ' + err.message);
    }
    setLoading(false);
    e.target.value = '';
  };

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center space-y-4">
      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
        <FileSpreadsheet className="w-6 h-6 text-gray-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-700">Importar Orçamento do XLSX</p>
        <p className="text-xs text-gray-400 mt-1">Selecione o arquivo com a aba <strong>ORCAMENTO_3A</strong></p>
      </div>

      {result && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.success
            ? <><CheckCircle className="w-4 h-4 flex-shrink-0" />{result.count} rubricas importadas!</>
            : <><AlertCircle className="w-4 h-4 flex-shrink-0" />{result.error}</>
          }
        </div>
      )}

      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {loading ? 'Importando...' : 'Selecionar arquivo XLSX'}
      </Button>
    </div>
  );
}