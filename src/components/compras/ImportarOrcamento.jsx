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

      const token = (await base44.auth.getToken?.()) || '';
      const appId = import.meta.env.VITE_APP_ID || '';

      const res = await fetch(`/api/functions/importBudgetLines`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-app-id': appId
        },
        body: formData
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

  return null;






























}