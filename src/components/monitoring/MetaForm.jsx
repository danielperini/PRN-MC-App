import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Lightbulb, Check, X as XIcon } from 'lucide-react';

export default function MetaForm({ metas, onActivityAdded }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [formData, setFormData] = useState({
    meta_id: '',
    titulo: '',
    tipo_atividade: '',
    data_realizacao: '',
    museu: '',
    coordenacao_responsavel: '',
    descricao: '',
    status: 'realizada'
  });

  // ✅ CORREÇÃO: remover dependência do Builder+
  const handleAnalyzeDescription = async () => {
    if (formData.descricao.trim().length < 10) return;

    // 🔴 NÃO CHAMA MAIS IA
    // mantém apenas feedback leve
    setLoading(true);

    setTimeout(() => {
      setLoading(false);

      // opcional: aviso para usuário
      console.info('IA desativada: analyzeActivityDescription não disponível neste plano.');
    }, 500);
  };

  const handleAcceptSuggestion = () => {
    if (suggestion) {
      setFormData(prev => ({
        ...prev,
        tipo_atividade: suggestion.tipo_atividade,
        meta_id: suggestion.meta_id
      }));
      setSuggestion(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await base44.entities.MetaActivity.create(formData);

      setFormData({
        meta_id: '',
        titulo: '',
        tipo_atividade: '',
        data_realizacao: '',
        museu: '',
        coordenacao_responsavel: '',
        descricao: '',
        status: 'realizada'
      });

      setSuggestion(null);
      setOpen(false);
      onActivityAdded?.();
    } catch (error) {
      console.error('Erro ao registrar atividade:', error);
    }
  };

  if (!open) {
    return (
      <Card className="p-4 bg-white border-gray-200">
        <Button onClick={() => setOpen(true)} className="w-full bg-black hover:bg-gray-800 text-white gap-2">
          <Plus className="w-4 h-4" /> Registrar Nova Atividade
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-white border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Registrar Atividade</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Meta *</label>
            <Select value={formData.meta_id} onValueChange={(val) => setFormData({ ...formData, meta_id: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a meta" />
              </SelectTrigger>
              <SelectContent>
                {metas.map(meta => (
                  <SelectItem key={meta.id} value={meta.id}>{meta.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Título *</label>
            <Input
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              placeholder="Título da atividade"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Tipo *</label>
            <Select value={formData.tipo_atividade} onValueChange={(val) => setFormData({ ...formData, tipo_atividade: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de atividade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="educativo">Educativo</SelectItem>
                <SelectItem value="oficina">Oficina</SelectItem>
                <SelectItem value="atividade cultural">Atividade Cultural</SelectItem>
                <SelectItem value="exposicao">Exposição</SelectItem>
                <SelectItem value="mostra">Mostra</SelectItem>
                <SelectItem value="evento">Evento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Data</label>
            <Input
              type="date"
              value={formData.data_realizacao}
              onChange={(e) => setFormData({ ...formData, data_realizacao: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Museu *</label>
            <Select value={formData.museu} onValueChange={(val) => setFormData({ ...formData, museu: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o museu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Museu da Moda">Museu da Moda</SelectItem>
                <SelectItem value="Museu da Imagem e do Som">Museu da Imagem e do Som</SelectItem>
                <SelectItem value="Museu Histórico Abílio Barreto">Museu Histórico Abílio Barreto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Coordenação *</label>
            <Select value={formData.coordenacao_responsavel} onValueChange={(val) => setFormData({ ...formData, coordenacao_responsavel: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a coordenação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Coordenador Geral">Coordenador Geral</SelectItem>
                <SelectItem value="Programação">Programação</SelectItem>
                <SelectItem value="Comunicação">Comunicação</SelectItem>
                <SelectItem value="Produção">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Descrição</label>

          {/* 🔴 AVISO IA DESATIVADA */}
          <div className="mb-2 text-xs text-amber-600">
            Sugestão automática de IA indisponível neste plano.
          </div>

          <div className="relative">
            <Input
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição da atividade"
              onBlur={() => formData.descricao.trim().length >= 10 && handleAnalyzeDescription()}
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                ...
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="bg-black hover:bg-gray-800 text-white">
            Registrar
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
