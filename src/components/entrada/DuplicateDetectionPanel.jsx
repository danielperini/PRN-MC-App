import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileCheck, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function DuplicateDetectionPanel({ intake, onDuplicatesFound }) {
  const [duplicates, setDuplicates] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  async function analyzeForDuplicates() {
    if (!intake?.id) return;
    setAnalyzing(true);
    setError(null);

    try {
      const result = await base44.functions.invoke('detectDocumentDuplicates', {
        intake_id: intake.id,
      });

      if (result.data?.duplicates && result.data.duplicates.length > 0) {
        setDuplicates(result.data.duplicates);
        onDuplicatesFound?.(result.data.duplicates);
      } else {
        setDuplicates([]);
      }
    } catch (err) {
      setError(err.message || 'Erro ao analisar duplicados');
      console.error('Erro na detecção de duplicados:', err);
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (intake?.tipo_detectado === 'NOTA_FISCAL_PDF' || 
        intake?.tipo_detectado === 'NOTA_FISCAL_XML') {
      analyzeForDuplicates();
    }
  }, [intake?.id]);

  if (duplicates.length === 0) {
    return null;
  }

  return (
    <Alert className="border-orange-200 bg-orange-50">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-900">
        <div className="font-semibold mb-2">⚠️ Possíveis duplicados detectados</div>
        <div className="space-y-2 text-sm">
          {duplicates.map((dup, idx) => (
            <div key={idx} className="bg-white p-2 rounded border border-orange-100">
              <div className="font-medium">{dup.file_name || `Documento ${idx + 1}`}</div>
              {dup.nf_numero && <div>NF: {dup.nf_numero}</div>}
              {dup.match_reason && <div className="text-xs text-gray-600">Motivo: {dup.match_reason}</div>}
              {dup.similarity_score && <div className="text-xs text-gray-600">Similaridade: {Math.round(dup.similarity_score * 100)}%</div>}
            </div>
          ))}
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="mt-3 text-orange-700 border-orange-300" 
          onClick={analyzeForDuplicates}
          disabled={analyzing}
        >
          {analyzing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileCheck className="w-3 h-3 mr-1" />}
          {analyzing ? 'Analisando...' : 'Revalidar'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}