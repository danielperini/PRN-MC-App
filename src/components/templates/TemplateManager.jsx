import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { Copy, Trash2, Share2, Eye } from 'lucide-react';

export default function TemplateManager() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('meus');

  const { data: myTemplates = [] } = useQuery({
    queryKey: ['reportTemplates', 'mine'],
    queryFn: () => base44.entities.ReportTemplate.filter({ author_email: user?.email }),
    enabled: !!user?.email
  });

  const { data: publicTemplates = [] } = useQuery({
    queryKey: ['reportTemplates', 'public'],
    queryFn: () => base44.entities.ReportTemplate.filter({ eh_publico: true })
  });

  const togglePublicMutation = useMutation({
    mutationFn: ({ templateId, isPublic }) => 
      base44.entities.ReportTemplate.update(templateId, { eh_publico: !isPublic }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
    }
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

  const TemplateCard = ({ template, canManage = false }) => (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base">{template.nome}</CardTitle>
            {template.descricao && (
              <CardDescription className="mt-1">{template.descricao}</CardDescription>
            )}
          </div>
          {canManage && (
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => togglePublicMutation.mutate({ templateId: template.id, isPublic: template.eh_publico })}
                className="h-8 w-8"
                title={template.eh_publico ? 'Deixar privado' : 'Compartilhar'}
              >
                <Share2 className={`h-4 w-4 ${template.eh_publico ? 'fill-blue-500 text-blue-500' : 'text-gray-400'}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => deleteTemplateMutation.mutate(template.id)}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {template.museu && (
            <Badge variant="outline">{template.museu}</Badge>
          )}
          {template.equipe && (
            <Badge variant="outline">{template.equipe}</Badge>
          )}
          {template.eh_publico && (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              <Eye className="h-3 w-3 mr-1" />Público
            </Badge>
          )}
        </div>
        {template.usos_count > 0 && (
          <p className="text-xs text-gray-500">Usado {template.usos_count}x</p>
        )}
        <div className="flex gap-2 pt-2">
          <Button size="sm" className="flex-1 gap-2">
            <Copy className="h-4 w-4" />
            Usar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Gerenciador de Templates</h2>
          <p className="text-sm text-gray-600 mt-1">Crie e gerencie templates de relatórios reutilizáveis</p>
        </div>
      </div>

      <div>
        <Input
          placeholder="Buscar templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="meus">
            Meus Templates ({myTemplates.length})
          </TabsTrigger>
          <TabsTrigger value="publicos">
            Públicos ({publicTemplates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meus" className="space-y-4">
          {filteredTemplates(myTemplates).length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates(myTemplates).map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  canManage={true}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-500 text-center">
                  Você ainda não tem templates salvos.<br />
                  Crie seu primeiro template ao salvar um relatório!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="publicos" className="space-y-4">
          {filteredTemplates(publicTemplates).length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates(publicTemplates).map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  canManage={false}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-500 text-center">
                  Nenhum template público disponível
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}