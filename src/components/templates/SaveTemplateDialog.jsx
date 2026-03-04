import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

export default function SaveTemplateDialog({ isOpen, onClose, formData }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedSections, setSelectedSections] = useState({
    identificacao: true,
    atividades: true,
    oportunidades: true,
    avaliacao: true
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (templateData) => {
      return base44.entities.ReportTemplate.create(templateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      setTemplateName('');
      setTemplateDescription('');
      setIsPublic(false);
      onClose();
    }
  });

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Por favor, insira um nome para o template');
      return;
    }

    const templateData = {
      nome: templateName,
      descricao: templateDescription,
      author_email: user?.email,
      author_name: user?.full_name,
      museu: formData?.museu,
      equipe: formData?.equipe,
      template_data: formData,
      secoes_incluidas: Object.keys(selectedSections).filter(k => selectedSections[k]),
      eh_publico: isPublic,
      tags: []
    };

    saveTemplateMutation.mutate(templateData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar como Template</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="template-name">Nome do Template</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ex: Relatório Educativo MHAB"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="template-desc">Descrição (opcional)</Label>
            <Textarea
              id="template-desc"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Descreva o propósito deste template..."
              className="mt-1 h-20"
            />
          </div>

          <div>
            <Label>Seções a Incluir</Label>
            <div className="space-y-2 mt-2">
              {['identificacao', 'atividades', 'oportunidades', 'avaliacao'].map((section) => (
                <div key={section} className="flex items-center gap-2">
                  <Checkbox
                    id={`section-${section}`}
                    checked={selectedSections[section]}
                    onCheckedChange={(checked) =>
                      setSelectedSections(prev => ({ ...prev, [section]: checked }))
                    }
                  />
                  <label htmlFor={`section-${section}`} className="text-sm capitalize cursor-pointer">
                    {section === 'identificacao' && 'Identificação'}
                    {section === 'atividades' && 'Atividades'}
                    {section === 'oportunidades' && 'Oportunidades'}
                    {section === 'avaliacao' && 'Avaliação'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="public-template"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <label htmlFor="public-template" className="text-sm cursor-pointer">
              Compartilhar com todos os coordenadores
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saveTemplateMutation.isPending}>
            {saveTemplateMutation.isPending ? 'Salvando...' : 'Salvar Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}