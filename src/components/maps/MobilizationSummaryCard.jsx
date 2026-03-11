import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ContactsAndProgramCard from './ContactsAndProgramCard';

export default function MobilizationSummaryCard({ museu_sigla, title }) {
  const [summary, setSummary] = useState('');
  const [contacts, setContacts] = useState([]);
  const [programmingSuggestion, setProgrammingSuggestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);

  useEffect(() => {
    // Tentar carregar resumo do localStorage primeiro
    const cached = localStorage.getItem(`mobilization_${museu_sigla}`);
    const cachedContacts = localStorage.getItem(`mobilization_${museu_sigla}_contacts`);
    const cachedProgram = localStorage.getItem(`mobilization_${museu_sigla}_program`);
    const cachedDate = localStorage.getItem(`mobilization_${museu_sigla}_date`);
    
    if (cached && cachedDate) {
      setSummary(cached);
      setContacts(cachedContacts ? JSON.parse(cachedContacts) : []);
      setProgrammingSuggestion(cachedProgram || '');
      setLastGenerated(new Date(cachedDate));
    } else {
      generateSummary();
    }
  }, [museu_sigla]);

  const generateSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('generateMobilizationSummary', {
        museu_sigla,
      });

      if (response.data?.summary) {
        setSummary(response.data.summary);
        setContacts(response.data.topContacts || []);
        setProgrammingSuggestion(response.data.programmingSuggestion || '');
        setLastGenerated(new Date(response.data.generated_at));
        localStorage.setItem(`mobilization_${museu_sigla}`, response.data.summary);
        localStorage.setItem(`mobilization_${museu_sigla}_date`, response.data.generated_at);
        localStorage.setItem(`mobilization_${museu_sigla}_contacts`, JSON.stringify(response.data.topContacts));
        localStorage.setItem(`mobilization_${museu_sigla}_program`, response.data.programmingSuggestion);
      }
    } catch (err) {
      setError('Erro ao gerar resumo de mobilização');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-indigo-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="font-bold text-gray-900">Oportunidades de Mobilização</h3>
            <p className="text-xs text-gray-600">Resumo de públicos e atividades do entorno</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateSummary}
          disabled={loading}
          className="h-8"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {summary}
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-indigo-200 mt-3">
              <span className="text-xs text-gray-500">
                {summary.length} / 800 caracteres
              </span>
              {lastGenerated && (
                <span className="text-xs text-gray-500">
                  Atualizado: {lastGenerated.toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
          </div>

          {/* Contatos e Programação */}
          <ContactsAndProgramCard 
            contacts={contacts} 
            programmingSuggestion={programmingSuggestion}
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span className="text-sm text-gray-600">Gerando análise de oportunidades...</span>
        </div>
      )}
    </Card>
  );
}