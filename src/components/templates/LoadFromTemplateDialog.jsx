import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { Copy, Trash2 } from 'lucide-react';

export default function LoadFromTemplateDialog({ isOpen, onClose, onSelectTemplate }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('meus');

  const { data: myTemplates = [] } = useQuery({
    queryKey: ['reportTemplates', 'mine'],
    queryFn: () => base44.entities.ReportTemplate.filter({ author_email: user?.email }),
    enabled: isOpen && user?.email
  });

  const { data: publicTemplates = [] } = useQuery({
    queryKey: ['reportTemplates', 'public'],
    queryFn: () => base44.entities.ReportTemplate.filter({ eh_publico: true }),
    enabled: isOpen
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId) => base44.entities.ReportTemplate.delete(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
    }
  });

  const filteredTemplates = (templates) => {
    if (!searchTerm) return templates;
    return templates.filter(t => 
      t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const TemplateCard = ({ template, canDelete = false }) => (
    <div className="border rounded-lg p-4 space-y-3 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{template.nome}</h3>
          {template.descricao && (
            <p className="text-xs text-gray-600 mt-1">{template.descricao}</p>
          )}
        </div>
        {canDelete && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteTemplateMutation.mutate(template.id)}
            className="h-8 w-8"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>

      <div className="flex gap-2 text-xs text-gray-600">
        {template.museu && <span className="bg-gray-100 px-2 py-1 rounded">{template.museu}</span>}
        {template.equipe && <span className="bg-gray-100 px-2 py-1 rounded">{template.equipe}</span>}
      </div>

      <Button
        size="sm"
        className="w-full gap-2"
        onClick={() => {
          onSelectTemplate(template);
          onClose();
        }}
      >
        <Copy className="h-4 w-4" />
        Usar Este Template
      </Button>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Carregar Relatório de Template</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="mb-4">
            <Input
              placeholder="Buscar templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>

          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="meus">Meus Templates ({myTemplates.length})</TabsTrigger>
              <TabsTrigger value="publicos">Públicos ({publicTemplates.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="meus" className="space-y-3 mt-4">
              {filteredTemplates(myTemplates).length > 0 ? (
                filteredTemplates(myTemplates).map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    canDelete={true}
                  />
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  Você ainda não tem templates salvos
                </p>
              )}
            </TabsContent>

            <TabsContent value="publicos" className="space-y-3 mt-4">
              {filteredTemplates(publicTemplates).length > 0 ? (
                filteredTemplates(publicTemplates).map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    canDelete={false}
                  />
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nenhum template público disponível
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}