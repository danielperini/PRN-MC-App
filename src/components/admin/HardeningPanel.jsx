import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function HardeningPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('detect');

  async function detectDuplicates() {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('detectAndFixDuplicates', {
        entity_type: null,
        dry_run: true
      });

      const data = result?.data || result || {};
      setResults(data);

      if (data.summary?.total_duplicates > 0) {
        toast.warning(`⚠️ Encontradas ${data.summary.total_duplicates} duplicatas`);
      } else {
        toast.success('✅ Nenhuma duplicata encontrada');
      }
    } catch (e) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function fixDuplicates() {
    if (!window.confirm('⚠️ Isso vai REMOVER duplicatas. Tem certeza?')) return;

    setLoading(true);
    try {
      const result = await base44.functions.invoke('detectAndFixDuplicates', {
        entity_type: null,
        dry_run: false
      });

      const data = result?.data || result || {};
      setResults(data);

      if (data.summary?.total_fixed > 0) {
        toast.success(`✅ ${data.summary.total_fixed} duplicatas removidas`);
      } else {
        toast.info('Nenhuma duplicata para remover');
      }
    } catch (e) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function finalizeAIStatus() {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('finalizeAIStatus', {
        entity_type: 'DocumentIntake'
      });

      const data = result?.data || result || {};

      if (data.message?.includes('força')) {
        toast.success('✅ Status IA finalizado');
      } else {
        toast.info('Nenhum status IA travado');
      }

      setResults(data);
    } catch (e) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function validateBeforeCreate() {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('validateBeforeCreate', {
        entity_type: 'TeamPayment',
        data: {
          user_email: 'test@example.com',
          mes_referencia: 'janeiro',
          ano: 2026,
          valor_nf: 100.00
        }
      });

      const data = result?.data || result || {};

      if (data.ok) {
        toast.success('✅ Sistema de validação funcionando');
      } else {
        toast.warning(`⚠️ Validação bloqueou: ${data.error}`);
      }

      setResults(data);
    } catch (e) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="font-semibold text-blue-900">🔒 Hardening do Sistema</h3>
            <p className="text-sm text-blue-700">Valide e corrija inconsistências críticas</p>
          </div>
        </div>
      </Card>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('detect')}
          className={`px-4 py-2 font-medium text-sm transition ${
            activeTab === 'detect'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🔍 Detectar Duplicatas
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 font-medium text-sm transition ${
            activeTab === 'ai'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ⏱️ Finalizar IA
        </button>
        <button
          onClick={() => setActiveTab('validate')}
          className={`px-4 py-2 font-medium text-sm transition ${
            activeTab === 'validate'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ✅ Validação
        </button>
      </div>

      {/* CONTEÚDO */}
      {activeTab === 'detect' && (
        <Card className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-semibold text-amber-900 mb-2">⚠️ Detectar Duplicatas</h4>
            <p className="text-sm text-amber-800 mb-4">
              Procura duplicação de pagamentos, documentos e relatórios. Executa em modo "dry-run" (sem modificar).
            </p>

            <div className="flex gap-2">
              <Button
                onClick={detectDuplicates}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  '🔍 Analisar Duplicatas'
                )}
              </Button>

              {results?.summary?.total_duplicates > 0 && (
                <Button
                  onClick={fixDuplicates}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Removendo...
                    </>
                  ) : (
                    '🗑️ Remover Duplicatas'
                  )}
                </Button>
              )}
            </div>
          </div>

          {results?.results?.duplicates_found && results.results.duplicates_found.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.results.duplicates_found.map((dup, i) => (
                <div key={i} className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
                  <div className="font-semibold text-red-900">{dup.type}</div>
                  <div className="text-red-700">
                    {dup.count} cópias encontradas
                    {dup.ids && <div className="text-xs mt-1">IDs: {dup.ids.join(', ')}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {results?.summary?.total_duplicates === 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-green-900">✅ Nenhuma duplicata encontrada</span>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'ai' && (
        <Card className="p-6 space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-900 mb-2">⏱️ Finalizar Status IA</h4>
            <p className="text-sm text-purple-800 mb-4">
              Detecta documentos travados em "ANALISANDO_IA" por mais de 10 minutos e força finalização.
            </p>

            <Button
              onClick={finalizeAIStatus}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                '⏱️ Verificar Status IA'
              )}
            </Button>
          </div>

          {results && (
            <div className="rounded-lg bg-slate-100 p-4 text-sm font-mono text-slate-700 max-h-40 overflow-y-auto">
              {typeof results === 'string' ? results : JSON.stringify(results, null, 2)}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'validate' && (
        <Card className="p-6 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-2">✅ Validação Pré-Criação</h4>
            <p className="text-sm text-green-800 mb-4">
              Testa o sistema de validação que bloqueia duplicação antes de criar registros.
            </p>

            <Button
              onClick={validateBeforeCreate}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                '✅ Testar Validação'
              )}
            </Button>
          </div>

          {results?.ok && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 text-green-900 font-semibold mb-2">
                <CheckCircle2 className="w-5 h-5" />
                Sistema de validação está funcionando
              </div>
              <ul className="text-sm text-green-800 space-y-1">
                {Object.entries(results.validation_results || {}).map(([key, status]) => (
                  <li key={key}>
                    ✓ {key}: {status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results?.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-center gap-2 text-red-900 font-semibold">
                <AlertCircle className="w-5 h-5" />
                Erro na validação
              </div>
              <p className="text-sm text-red-800 mt-2">{results.error}</p>
            </div>
          )}
        </Card>
      )}

      {/* DICAS */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <h4 className="font-semibold text-slate-900 mb-2 text-sm">💡 Dicas</h4>
        <ul className="text-xs text-slate-700 space-y-1">
          <li>• Execute "Detectar Duplicatas" antes de "Remover"</li>
          <li>• Faça backup antes de executar correções</li>
          <li>• Revise os resultados no painel de auditoria</li>
          <li>• Execute regularmente (semanal) para manter sistema limpo</li>
        </ul>
      </Card>
    </div>
  );
}