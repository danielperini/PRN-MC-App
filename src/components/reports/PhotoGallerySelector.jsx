import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function extrairDataDoNome(fileName) {
  const m1 = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (m1) return `${m1[3]}/${m1[2]}/${m1[1]}`;
  const m2 = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
  return null;
}

function gerarLegendaAuto({ fileName, museu, mes, ano, atividadeNome, atividadeLocal, atividadeData }) {
  const partes = [];

  const nomeAtividade = atividadeNome?.trim();
  if (nomeAtividade) partes.push(nomeAtividade);

  const local = atividadeLocal?.trim() || museu?.trim();
  if (local) partes.push(local);

  // Data: preferência à data da atividade, depois extrai do nome do arquivo
  const dataAtividade = atividadeData?.trim();
  const dataArquivo = extrairDataDoNome(fileName || '');
  const data = dataAtividade || dataArquivo;
  if (data) partes.push(data);
  else if (mes && ano) partes.push(`${mes}/${ano}`);

  return partes.join(' — ');
}

export default function PhotoGallerySelector({ isOpen, onClose, onSelectPhoto, atividades = [], museu = '', mes = '', ano = '' }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [atividadeVinculadaId, setAtividadeVinculadaId] = useState('');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-selector', searchTerm],
    queryFn: async () => {
      try {
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set(approvedReports.map(r => r.id));
        const allAttachments = await base44.entities.Attachment.list();

        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const imageData = allAttachments
          .filter(att => {
            const ext = (att.file_name || '').split('.').pop().toLowerCase();
            return approvedReportIds.has(att.report_id) && imageExtensions.includes(ext);
          })
          .map(att => {
            const report = approvedReports.find(r => r.id === att.report_id);
            return {
              id: att.id,
              fileName: att.file_name,
              url: att.file_url,
              description: att.description || '',
              author: report?.author_name || 'Desconhecido',
              mes: report?.mes_referencia || '',
              ano: report?.ano || '',
              museu: report?.museu || '',
            };
          });

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          return imageData.filter(img =>
            img.fileName.toLowerCase().includes(term) ||
            img.description.toLowerCase().includes(term)
          );
        }
        return imageData.sort((a, b) => new Date(b.id) - new Date(a.id));
      } catch {
        toast.error('Erro ao carregar fotos');
        return [];
      }
    },
    enabled: isOpen
  });

  // Quando seleciona foto ou atividade, recalcula legenda automaticamente
  useEffect(() => {
    if (!selectedPhoto) return;
    const atividade = atividades.find(a => a.id === atividadeVinculadaId);
    const legenda = gerarLegendaAuto({
      fileName: selectedPhoto.fileName,
      museu: atividade ? (Array.isArray(atividade.museu_lista) ? atividade.museu_lista[0] : '') || museu : museu,
      mes,
      ano,
      atividadeNome: atividade?.nome || atividade?.titulo || '',
      atividadeLocal: Array.isArray(atividade?.museu_lista) ? atividade.museu_lista[0] : '',
      atividadeData: atividade?.data_realizacao || atividade?.data_inicio || '',
    });
    setCaption(legenda);
  }, [selectedPhoto, atividadeVinculadaId, atividades, museu, mes, ano]);

  const handleAddPhoto = () => {
    if (!selectedPhoto) {
      toast.error('Selecione uma foto');
      return;
    }
    onSelectPhoto({
      ...selectedPhoto,
      caption,
      activityId: atividadeVinculadaId || null,
    });
    setSelectedPhoto(null);
    setCaption('');
    setSearchTerm('');
    setAtividadeVinculadaId('');
    onClose();
    toast.success('Foto adicionada ao relatório');
  };

  const handleClose = () => {
    setSelectedPhoto(null);
    setCaption('');
    setSearchTerm('');
    setAtividadeVinculadaId('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Foto ao Relatório</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca */}
          <div>
            <Label className="text-sm font-medium mb-1 block">Buscar fotos</Label>
            <Input
              placeholder="Por nome ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Grid de Fotos */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">Nenhuma foto encontrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setSelectedPhoto(img)}
                  className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedPhoto?.id === img.id
                      ? 'border-blue-600 ring-2 ring-blue-300'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E'; }}
                    />
                  </div>
                  <p className="text-xs p-1.5 text-gray-600 truncate">{img.fileName}</p>
                </div>
              ))}
            </div>
          )}

          {selectedPhoto && (
            <>
              {/* Vincular atividade */}
              {atividades.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-1 block">Atividade vinculada</Label>
                  <Select value={atividadeVinculadaId} onValueChange={setAtividadeVinculadaId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione a atividade (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhuma</SelectItem>
                      {atividades.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome || a.titulo || a.id}
                          {a.data_realizacao ? ` — ${a.data_realizacao}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Legenda gerada automaticamente */}
              <div>
                <Label className="text-sm font-medium mb-1 flex items-center gap-1 block">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                  Legenda automática (editável)
                </Label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Atividade — Local/Museu — Data"
                  className="resize-none h-16 text-sm"
                />
                <p className="text-xs text-gray-400 mt-0.5">Gerada automaticamente. Edite se necessário.</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleAddPhoto} disabled={!selectedPhoto} className="bg-blue-600 hover:bg-blue-700">
            Adicionar Foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}