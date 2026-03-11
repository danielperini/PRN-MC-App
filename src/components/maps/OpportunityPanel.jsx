import React from 'react';
import { X, MapPin, Users, Zap, Tag, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function OpportunityPanel({ opportunity, onClose }) {
  if (!opportunity) return null;

  const priorityColors = {
    'Alta': 'bg-red-100 text-red-800',
    'Média': 'bg-yellow-100 text-yellow-800',
    'Baixa': 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="absolute top-6 right-6 w-96 max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-1">{opportunity.nome}</h3>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <MapPin className="w-4 h-4" />
            {opportunity.bairro}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Categoria */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Categoria
          </h4>
          <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-200">
            {opportunity.categoria}
          </Badge>
        </div>

        <Separator />

        {/* Informações básicas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Distância</p>
            <p className="text-sm font-semibold text-slate-900">
              {opportunity.distancia_estimada} km
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Aderência</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-full transition-all"
                  style={{ width: `${opportunity.nivel_aderencia}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700">
                {opportunity.nivel_aderencia}%
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Prioridade */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Prioridade
          </h4>
          <Badge className={priorityColors[opportunity.prioridade]}>
            {opportunity.prioridade}
          </Badge>
        </div>

        <Separator />

        {/* Públicos-alvo */}
        {opportunity.publicos_alvo?.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-600" />
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Públicos-alvo
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {opportunity.publicos_alvo.map((publico) => (
                <Badge key={publico} variant="outline" className="text-xs">
                  {publico}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {opportunity.publicos_alvo?.length > 0 && <Separator />}

        {/* Temas relacionados */}
        {opportunity.temas_relacionados?.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-slate-600" />
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Temas
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {opportunity.temas_relacionados.map((tema) => (
                <Badge key={tema} variant="secondary" className="text-xs">
                  {tema}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {opportunity.temas_relacionados?.length > 0 && <Separator />}

        {/* Potencial de Parceria */}
        {opportunity.potencial_parceria && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-slate-600" />
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Potencial de Parceria
              </h4>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {opportunity.potencial_parceria}
            </p>
          </div>
        )}

        {opportunity.potencial_parceria && <Separator />}

        {/* Observações de Curadoria */}
        {opportunity.observacoes_curadoria && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-slate-600" />
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Curadoria
              </h4>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-200">
              {opportunity.observacoes_curadoria}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-slate-50 p-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            // Ação futura: iniciar mobilização ou criar atividade
            console.log('Iniciar parceria com', opportunity.nome);
          }}
        >
          Mobilizar Parceria
        </Button>
      </div>
    </div>
  );
}