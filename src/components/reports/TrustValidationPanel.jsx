import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Info, Loader2, Shield, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TrustValidationPanel({ reportId, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [validacoes, setValidacoes] = useState([]);
  const [revisao, setRevisao] = useState(null);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const loadValidacoes = async () => {
    setLoading(true);
    try {
      const resultado = await base44.entities.TrustValidation.filter({
        report_id: reportId
      });
      setValidacoes(resultado || []);
    } catch (error) {
      console.error('Erro ao carregar validações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevisarAntes = async () => {
    setRevisando(true);
    try {
      const response = await base44.functions.invoke('revisarRelatorioAntesExportPDF', {
        reportId
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Erro ao revisar');
      }

      setRevisao(response.data);
      if (onStatusChange) {
        onStatusChange(response.data);
      }
    } catch (error) {
      console.error('Erro ao revisar:', error);
    } finally {
      setRevisando(false);
    }
  };

  useEffect(() => {
    loadValidacoes();
  }, [reportId]);

  // Contar validações por nível
  const altasConfianca = validacoes.filter(v => v.nivel_confianca === 'ALTA').length;
  const mediasConfianca = validacoes.filter(v => v.nivel_confianca === 'MEDIA').length;
  const baixasConfianca = validacoes.filter(v => v.nivel_confianca === 'BAIXA').length;
  const totalValidacoes = validacoes.length;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">Protocolo de Verificação de Confiança</h3>
        </div>

        {totalValidacoes > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white p-3 rounded border border-green-200">
              <p className="text-xs text-gray-600">Alta Confiança</p>
              <p className="text-2xl font-bold text-green-600">{altasConfianca}</p>
              <p className="text-xs text-gray-500">{totalValidacoes > 0 ? ((altasConfianca / totalValidacoes) * 100).toFixed(0) : 0}%</p>
            </div>
            <div className="bg-white p-3 rounded border border-yellow-200">
              <p className="text-xs text-gray-600">Média Confiança</p>
              <p className="text-2xl font-bold text-yellow-600">{mediasConfianca}</p>
              <p className="text-xs text-gray-500">{totalValidacoes > 0 ? ((mediasConfianca / totalValidacoes) * 100).toFixed(0) : 0}%</p>
            </div>
            <div className="bg-white p-3 rounded border border-red-200">
              <p className="text-xs text-gray-600">Baixa Confiança</p>
              <p className="text-2xl font-bold text-red-600">{baixasConfianca}</p>
              <p className="text-xs text-gray-500">{totalValidacoes > 0 ? ((baixasConfianca / totalValidacoes) * 100).toFixed(0) : 0}%</p>
            </div>
          </div>
        )}

        <Button 
          onClick={handleRevisarAntes}
          disabled={revisando}
          className="w-full"
          variant="default"
        >
          {revisando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {revisando ? 'Analisando relatório...' : 'Revisar Antes de Exportar PDF'}
        </Button>
      </Card>

      {revisao && (
        <Card className={`p-4 border-l-4 ${revisao.podeExportar ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <div className="flex items-start gap-3">
            {revisao.podeExportar ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-semibold ${revisao.podeExportar ? 'text-green-900' : 'text-red-900'}`}>
                {revisao.mensagem}
              </p>
              
              {revisao.recomendacoes && revisao.recomendacoes.length > 0 && (
                <div className="mt-3 space-y-1">
                  {revisao.recomendacoes.map((rec, i) => (
                    <p key={i} className={`text-sm ${revisao.podeExportar ? 'text-green-800' : 'text-red-800'}`}>
                      {rec}
                    </p>
                  ))}
                </div>
              )}

              {!revisao.podeExportar && (
                <Button 
                  onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
                  variant="outline"
                  size="sm"
                  className="mt-3"
                >
                  {mostrarDetalhes ? 'Ocultar' : 'Ver'} Detalhes
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {mostrarDetalhes && revisao && (revisao.issues.length > 0 || revisao.alertas.length > 0) && (
        <Card className="p-4 space-y-4">
          {revisao.issues.length > 0 && (
            <div>
              <h4 className="font-semibold text-red-900 mb-2">Problemas Críticos:</h4>
              <ul className="space-y-1">
                {revisao.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-red-800 flex gap-2">
                    <span className="text-red-500 font-bold">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {revisao.alertas.length > 0 && (
            <div>
              <h4 className="font-semibold text-yellow-900 mb-2">Atenções:</h4>
              <ul className="space-y-1">
                {revisao.alertas.map((alerta, i) => (
                  <li key={i} className="text-sm text-yellow-800 flex gap-2">
                    <span className="text-yellow-500 font-bold">•</span>
                    {alerta}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {validacoes.length > 0 && (
        <Card className="p-4">
          <Button 
            onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
            variant="outline"
            size="sm"
            className="w-full justify-center"
          >
            <Info className="w-4 h-4 mr-2" />
            {mostrarDetalhes ? 'Ocultar' : 'Ver'} Validações Registradas ({validacoes.length})
          </Button>

          {mostrarDetalhes && (
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              {validacoes.map((v, i) => (
                <div key={i} className="text-xs p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">{v.tipo_dado}</span>
                    <Badge variant={
                      v.nivel_confianca === 'ALTA' ? 'default' : 
                      v.nivel_confianca === 'MEDIA' ? 'outline' : 
                      'destructive'
                    }>
                      {v.score_confianca.toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-gray-600">{String(v.conteudo_validado).substring(0, 60)}...</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}