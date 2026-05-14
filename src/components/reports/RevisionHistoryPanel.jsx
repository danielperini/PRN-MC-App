import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Clock, User, Edit3 } from 'lucide-react';
import { toast } from 'sonner';

const TIPO_ALTERACAO_LABELS = {
  TEXTO_EDITADO: '✏️ Texto Editado',
  IMAGEM_SUBSTITUIDA: '🖼️ Imagem Substituída',
  LEGENDA_EDITADA: '📝 Legenda Editada',
  SECAO_REGENERADA: '🔄 Seção Regenerada',
  TEXTO_RESTAURADO: '↩️ Texto Restaurado',
  STATUS_ALTERADO: '📊 Status Alterado',
};

export default function RevisionHistoryPanel({ revisionId, onClose }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroSecao, setFiltroSecao] = useState('todas');
  const [secoes, setSecoes] = useState([]);

  useEffect(() => {
    carregarHistorico();
  }, [revisionId]);

  async function carregarHistorico() {
    try {
      setLoading(true);
      const registros = await base44.entities.ReportRevisionHistory.filter({
        revision_id: revisionId,
      });

      // Ordenar por data descendente
      registros.sort(
        (a, b) =>
          new Date(b.data_alteracao) - new Date(a.data_alteracao)
      );

      setHistorico(registros);

      // Extrair seções únicas
      const secoesUnicas = [
        ...new Set(registros.map(r => r.secao)),
      ];
      setSecoes(secoesUnicas);
    } catch (err) {
      toast.error('Erro ao carregar histórico: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const registrosFiltrados = historico.filter(reg =>
    filtroSecao === 'todas' ? true : reg.secao === filtroSecao
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Histórico de Alterações
          </CardTitle>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        {/* FILTROS */}
        <div className="px-6 pb-4 space-y-3">
          <label className="text-sm font-medium text-slate-700">Filtrar por seção:</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFiltroSecao('todas')}
              className={`px-3 py-1 rounded text-sm transition-all ${
                filtroSecao === 'todas'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              }`}
            >
              Todas ({historico.length})
            </button>
            {secoes.map(sec => (
              <button
                key={sec}
                onClick={() => setFiltroSecao(sec)}
                className={`px-3 py-1 rounded text-sm transition-all ${
                  filtroSecao === sec
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                }`}
              >
                {sec} ({historico.filter(r => r.secao === sec).length})
              </button>
            ))}
          </div>
        </div>

        {/* CONTEÚDO */}
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-center py-8">Carregando histórico...</div>
          ) : registrosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhuma alteração registrada nesta seção.
            </div>
          ) : (
            registrosFiltrados.map((reg, idx) => (
              <HistoricoCard key={idx} registro={reg} />
            ))
          )}
        </CardContent>

        {/* FOOTER */}
        <div className="border-t p-4 bg-slate-50">
          <Button onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function HistoricoCard({ registro }) {
  const [expandido, setExpandido] = useState(false);

  const tipoLabel = TIPO_ALTERACAO_LABELS[registro.tipo_alteracao] || registro.tipo_alteracao;
  const dataFormatada = new Date(registro.data_alteracao).toLocaleString('pt-BR');

  return (
    <div className="border rounded-lg p-3 space-y-2 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{tipoLabel}</span>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
              {registro.secao}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <User className="w-3.5 h-3.5" />
            <span>{registro.usuario_email}</span>
            <span>•</span>
            <Clock className="w-3.5 h-3.5" />
            <span>{dataFormatada}</span>
          </div>
        </div>
        <button
          onClick={() => setExpandido(!expandido)}
          className="p-1 hover:bg-slate-200 rounded"
        >
          <Edit3 className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {expandido && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {registro.conteudo_original && (
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1">Antes:</p>
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-slate-800 max-h-32 overflow-y-auto">
                {registro.conteudo_original.slice(0, 200)}
                {registro.conteudo_original.length > 200 && '...'}
              </div>
            </div>
          )}
          {registro.conteudo_novo && (
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1">Depois:</p>
              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-slate-800 max-h-32 overflow-y-auto">
                {registro.conteudo_novo.slice(0, 200)}
                {registro.conteudo_novo.length > 200 && '...'}
              </div>
            </div>
          )}
          {registro.justificativa && (
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1">Justificativa:</p>
              <p className="text-xs text-slate-600">{registro.justificativa}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}