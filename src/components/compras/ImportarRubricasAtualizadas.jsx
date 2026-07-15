import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { importarRubricasOficiais } from '@/lib/importarRubricasOficiais';
import { getRubricasOficiais3Aditivo, TOTAL_OFICIAL_3_ADITIVO, TOTAL_RUBRICAS_OFICIAIS } from '@/lib/rubricasOficiais3Aditivo';

const moeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

export default function ImportarRubricasAtualizadas({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState('');
  const rubricas = useMemo(() => getRubricasOficiais3Aditivo(), []);

  async function handleImport() {
    try {
      setLoading(true);
      setResult(null);
      const resultado = await importarRubricasOficiais({ onProgress: ({ msg }) => setProgress(msg || '') });
      setResult({
        success: true,
        message: `${resultado.totalRubricas} rubricas sincronizadas: ${resultado.criadas} criadas, ${resultado.atualizadas} atualizadas e ${resultado.inativadas} legadas inativadas.`,
      });
      await onSuccess?.();
    } catch (error) {
      setResult({ success: false, message: error?.message || 'Falha ao importar rubricas.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sincronizar rubricas do 3º Aditivo</DialogTitle>
          <DialogDescription>Atualiza a lista oficial sem apagar solicitações, pagamentos ou valores já utilizados.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900">Fonte oficial validada</p>
            <ul className="text-sm text-blue-800 mt-2 space-y-1 ml-4">
              <li>✓ {TOTAL_RUBRICAS_OFICIAIS} rubricas do 3º Aditivo</li>
              <li>✓ Total previsto: {moeda(TOTAL_OFICIAL_3_ADITIVO)}</li>
              <li>✓ Sincronização idempotente, sem duplicar rubricas</li>
            </ul>
          </div>

          <div className="max-h-72 overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-100">
                <tr><th className="p-2 text-left">Rubrica</th><th className="p-2 text-left">Museu</th><th className="p-2 text-right">Valor atualizado</th></tr>
              </thead>
              <tbody>
                {rubricas.map((rubrica) => (
                  <tr key={rubrica._chave_oficial} className="border-t">
                    <td className="p-2">{rubrica.rubrica}</td>
                    <td className="p-2">{rubrica.museu_codigo}</td>
                    <td className="p-2 text-right">{moeda(rubrica.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && progress && <p className="text-sm text-gray-600">{progress}</p>}
          {result && (
            <div className={`rounded-lg p-4 flex gap-3 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {result.success ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
              <p className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>{result.message}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>Fechar</Button>
          <Button onClick={handleImport} disabled={loading} className="bg-black hover:bg-gray-800 text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {loading ? 'Sincronizando...' : 'Sincronizar 72 rubricas'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
