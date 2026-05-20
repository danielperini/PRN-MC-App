import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const MUSEU_COLORS = {
  MIS: 'bg-blue-100 text-blue-800',
  MHAB: 'bg-emerald-100 text-emerald-800',
  MUMO: 'bg-purple-100 text-purple-800',
  Externo: 'bg-slate-100 text-slate-600',
};

export default function AgendaCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const data = await base44.entities.Programacao.list('-data_inicio', 100);
        const filtered = (data || []).filter((item) => {
          if (!item.data_inicio) return false;
          const itemMonth = item.data_inicio.substring(0, 7);
          return itemMonth === currentMonth;
        }).slice(0, 5);

        setItems(filtered);
      } catch (e) {
        console.warn('Agenda do card indisponível. Mantendo card vazio.', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Card className="border-2 border-black">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Próximas Atividades do Mês
          </CardTitle>
          <Link to="/Agenda">
            <Button size="sm" variant="outline" className="gap-1">
              Ver agenda <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-500 text-center py-4">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">Nenhuma atividade este mês</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-sm text-slate-800 line-clamp-1">
                    {item.titulo || item.nome_acao || '—'}
                  </h4>
                  {item.museu && (
                    <Badge className={`text-xs shrink-0 ${MUSEU_COLORS[item.museu] || MUSEU_COLORS.Externo}`}>
                      {item.museu}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  {item.data_inicio && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {new Date(item.data_inicio).toLocaleDateString('pt-BR')}
                      {item.horario && ` · ${item.horario}`}
                    </div>
                  )}
                  {item.local && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {item.local}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
