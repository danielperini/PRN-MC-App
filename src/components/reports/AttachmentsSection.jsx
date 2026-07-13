import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Trash2, Image, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gerarLegendaFoto, gerarLegendaDaAtividade } from '@/utils/captionUtils';

export default function AttachmentsSection({
  attachments = [],
  setAttachments,
  reportId,
  museu = '',
  mes = '',
  ano = '',
  atividades = [],
}) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [editAtivId, setEditAtivId] = useState('');

  const handleUpload = async (files) => {
    try {
      setUploading(true);
      const novos = [];
      // Usa a primeira atividade do relatório como contexto padrão para a legenda
      const primeiraAtividade = atividades[0];

      for (const file of files) {
        const uploaded = await base44.integrations.Core.UploadFile({ file });
        const createdAt = new Date().toISOString();
        const legenda = gerarLegendaDaAtividade(primeiraAtividade, { museu, mes, ano, fileName: file.name, createdAt });

        novos.push({
          name: file.name,
          url: uploaded.file_url,
          type: file.type,
          size: file.size,
          created_at: createdAt,
          caption: legenda,
          atividadeId: '',
        });
      }

      setAttachments([...attachments, ...novos]);
      toast.success('Arquivo enviado com sucesso');
    } catch (e) {
      console.error(e);
      toast.error('Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index) => {
    const updated = [...attachments];
    updated.splice(index, 1);
    setAttachments(updated);
  };

  const handleEditClick = (idx) => {
    setEditingIdx(idx);
    setEditCaption(attachments[idx]?.caption || '');
    setEditAtivId(attachments[idx]?.atividadeId || '');
  };

  const handleSaveCaption = () => {
    const atividade = atividades.find(a => a.id === editAtivId);
    const legenda = editCaption || gerarLegendaDaAtividade(atividade, {
      museu,
      fileName: attachments[editingIdx]?.name || '',
      createdAt: attachments[editingIdx]?.created_at,
    });
    const updated = attachments.map((f, i) =>
      i === editingIdx ? { ...f, caption: legenda, atividadeId: editAtivId } : f
    );
    setAttachments(updated);
    setEditingIdx(null);
  };

  // Quando muda a atividade no modal, recalcula legenda
  const handleAtivChange = (atividadeId) => {
    setEditAtivId(atividadeId);
    const atividade = atividades.find(a => a.id === atividadeId);
    const legenda = gerarLegendaDaAtividade(atividade, {
      museu,
      fileName: attachments[editingIdx]?.name || '',
      createdAt: attachments[editingIdx]?.created_at,
    });
    setEditCaption(legenda);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Image className="w-5 h-5" />
          Anexos — Evidências Fotográficas
        </h2>

        <Button onClick={() => inputRef.current.click()} disabled={uploading} className="gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Enviar
        </Button>

        <input ref={inputRef} type="file" multiple accept="image/*,.pdf" hidden onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {attachments.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 text-sm">
          Nenhuma evidência fotográfica adicionada
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {attachments.map((file, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden text-xs bg-white">
              {file.type?.includes('image') ? (
                <img src={file.url} alt={file.name} className="w-full h-32 object-cover" />
              ) : (
                <div className="h-32 flex items-center justify-center bg-gray-100 text-gray-400">Documento</div>
              )}

              <div className="p-2 space-y-1">
                <p className="font-medium text-gray-700 truncate" title={file.name}>{file.name}</p>
                {file.caption ? (
                  <p className="text-blue-600 italic leading-snug text-xs">{file.caption}</p>
                ) : (
                  <p className="text-gray-400 italic">Sem legenda</p>
                )}
                <div className="flex gap-1 pt-1">
                  <button onClick={() => handleEditClick(idx)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                    <Edit2 className="w-3 h-3" /> Editar legenda
                  </button>
                  <button onClick={() => handleRemove(idx)} className="ml-auto text-red-500 hover:text-red-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edição */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Legenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingIdx !== null && <p className="text-xs text-gray-500 truncate">{attachments[editingIdx]?.name}</p>}

            {atividades.length > 0 && (
              <div>
                <Label className="text-sm mb-1 block">Atividade vinculada</Label>
                <Select value={editAtivId} onValueChange={handleAtivChange}>
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

            <div>
              <Label className="text-sm mb-1 block">Legenda</Label>
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder="Atividade — Local/Museu — Data"
                className="resize-none h-20"
              />
              <p className="text-xs text-gray-400 mt-1">Formato: Atividade — Local — Data</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIdx(null)}>Cancelar</Button>
            <Button onClick={handleSaveCaption} className="bg-blue-600 hover:bg-blue-700 text-white">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}