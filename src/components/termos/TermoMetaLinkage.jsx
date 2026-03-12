import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Target, Link2 } from 'lucide-react';

export default function TermoMetaLinkage({ formData, onChange }) {
  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => base44.entities.Activity.list()
  });

  const { data: metas = [] } = useQuery({
    queryKey: ['metas'],
    queryFn: () => base44.entities.MetaActivity?.list() || Promise.resolve([])
  });

  // Filtrar atividades por museu se disponível
  const relatedActivities = activities.filter(a => 
    !formData.museu || (a.titulo?.toLowerCase()?.includes(formData.museu?.toLowerCase() || '') ?? false)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="w-5 h-5 text-purple-600" />
          Vinculações & Prestação de Contas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Vinculação com Atividade */}
        <div>
          <label className="text-sm font-semibold text-slate-700 mb-2 block">
            <Target className="w-4 h-4 inline mr-2" />
            Atividade relacionada (opcional)
          </label>
          <Select 
            value={formData.cria_vinculado_activity || ''} 
            onValueChange={(value) => onChange('cria_vinculado_activity', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma atividade..." />
            </SelectTrigger>
            <SelectContent>
              {relatedActivities.map(act => (
                <SelectItem key={act.id} value={act.id}>
                  {act.titulo}{act.data_realizacao ? ` (${new Date(act.data_realizacao).toLocaleDateString('pt-BR')})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-1">
            Se vinculado, os dados da atividade serão compartilhados na prestação de contas
          </p>
        </div>

        {/* Campos de Catalogação */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Catalogação para Prestação de Contas</h4>
          
          <div className="space-y-3">
            {/* Descrição para relatório */}
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                Descrição para relatório mensal
              </label>
              <Input
                placeholder="Ex: Mediação especializada em fotografia para exposição..."
                value={formData.descricao_relatorio || ''}
                onChange={(e) => onChange('descricao_relatorio', e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Produtos/entregas */}
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-2">
                Produtos/entregas gerados
              </label>
              <div className="space-y-2 text-sm">
                {[
                  'Cobertura Fotográfica',
                  'Cobertura de Vídeo',
                  'Texto/Descrição',
                  'Monitoria/Mediação',
                  'Oficina realizada',
                  'Apresentação',
                  'Consultoria',
                  'Expografia'
                ].map(produto => (
                  <label key={produto} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.produtos_termo?.includes(produto) || false}
                      onCheckedChange={(checked) => {
                        const arr = formData.produtos_termo || [];
                        if (checked) {
                          onChange('produtos_termo', [...arr, produto]);
                        } else {
                          onChange('produtos_termo', arr.filter(p => p !== produto));
                        }
                      }}
                    />
                    <span className="text-slate-700">{produto}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Público estimado */}
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                Público estimado (se aplicável)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={formData.publico_estimado || ''}
                onChange={(e) => onChange('publico_estimado', parseInt(e.target.value) || 0)}
                className="text-sm"
              />
            </div>

            {/* Acessibilidade */}
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-2">
                Acessibilidade
              </label>
              <Select 
                value={formData.acessibilidade || 'Não'} 
                onValueChange={(value) => onChange('acessibilidade', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Não">Não</SelectItem>
                  <SelectItem value="Parcial">Parcial</SelectItem>
                  <SelectItem value="Total">Total</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Marcador: mobilização */}
            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <Checkbox
                checked={formData.eh_mobilizacao || false}
                onCheckedChange={(checked) => onChange('eh_mobilizacao', !!checked)}
              />
              <span className="text-sm text-slate-700">
                Será reportado como atividade de mobilização/divulgação?
              </span>
            </label>

            {/* Marcador: contratação de profissionais */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.envolve_cadeia_cultura || false}
                onCheckedChange={(checked) => onChange('envolve_cadeia_cultura', !!checked)}
              />
              <span className="text-sm text-slate-700">
                Envolve profissionais da cadeia da cultura?
              </span>
            </label>
          </div>
        </div>

        {/* Info */}
        <div className="bg-purple-50 border border-purple-200 rounded p-3 text-xs text-purple-800">
          <p className="font-semibold mb-1">💡 Dica:</p>
          <p>Preenchendo esses campos, o termo será automaticamente integrado aos relatórios mensais e consolidados do projeto.</p>
        </div>
      </CardContent>
    </Card>
  );
}