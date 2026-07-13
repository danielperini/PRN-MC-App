import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Trash2, Image, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/**
 * Extrai data de nomes como IMG_20260626_213918.jpg ou WhatsApp Image 2026-06-26 at 20.33.15.jpeg
 */
function extrairDataDoNome(fileName) {
  // IMG_YYYYMMDD_...
  const m1 = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (m1) {
    return `${m1[3]}/${m1[2]}/${m1[1]}`;
  }
  // WhatsApp Image YYYY-MM-DD at HH.MM.SS
  const m2 = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    return `${m2[3]}/${m2[2]}/${m2[1]}`;
  }
  return null;
}

function gerarLegendaAutomatica(fileName, museu, mes, ano) {
  const data = extrairDataDoNome(fileName);
  const partes = [];
  if (museu) partes.push(museu);
  if (mes && ano) partes.push(`${mes} de ${ano}`);
  else if (mes) partes.push(mes);
  if (data) partes.push(`— ${data}`);
  if (partes.length === 0) return '';
  return partes.join(', ');
}

export default function AttachmentsSection({
  attachments = [],
  setAttachments,
  reportId,
  museu = '',
  mes = '',
  ano = '',
}) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editCaption, setEditCaption] = useState('');

  const handleUpload = async (files) => {
    try {
      setUploading(true);
      const novos = [];

      for (const file of files) {
        const uploaded = await base44.integrations.Core.UploadFile({ file });

        const legendaAuto = gerarLegendaAutomatica(file.name, museu, mes, ano);

        const item = {
          name: file.name,
          url: uploaded.file_url,
          type: file.type,
          size: file.size,
          created_at: new Date().toISOString(),
          caption: legendaAuto,
        };

        novos.push(item);
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
  };

  const handleSaveCaption = () => {
    const updated = attachments.map((f, i) =>
      i === editingIdx ? { ...f, caption: editCaption } : f
    );
    setAttachments(updated);
    setEditingIdx(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Image className="w-5 h-5" />
          Anexos — Evidências Fotográficas
        </h2>

        <Button
          onClick={() => inputRef.current.click()}
          disabled={uploading}
          className="gap-2"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Enviar
        </Button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 text-sm">
          Nenhuma evidência fotográfica adicionada
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="border rounded-lg overflow-hidden text-xs space-y-0 relative group bg-white"
            >
              {/* Imagem */}
              {file.type?.includes('image') ? (
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="h-32 flex items-center justify-center bg-gray-100 text-gray-400">
                  Documento
                </div>
              )}

              {/* Legenda */}
              <div className="p-2 space-y-1">
                <p className="font-medium text-gray-700 truncate" title={file.name}>{file.name}</p>

                {file.caption ? (
                  <p className="text-gray-500 italic leading-snug">{file.caption}</p>
                ) : (
                  <p className="text-gray-400 italic">Sem legenda</p>
                )}

                <div className="flex gap-1 pt-1">
                  <button
                    onClick={() => handleEditClick(idx)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar legenda
                  </button>

                  <button
                    onClick={() => handleRemove(idx)}
                    className="ml-auto text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edição de legenda */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Legenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingIdx !== null && attachments[editingIdx] && (
              <p className="text-xs text-gray-500 truncate">{attachments[editingIdx].name}</p>
            )}
            <div>
              <Label className="text-sm mb-1 block">Legenda</Label>
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder={`Ex: ${museu || 'Museu'}, ${mes || 'mês'} de ${ano || 'ano'} — atividade educativa`}
                className="resize-none h-24"
              />
              <p className="text-xs text-gray-400 mt-1">
                A legenda deve referenciar data, local/museu e atividade relacionada.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIdx(null)}>Cancelar</Button>
            <Button onClick={handleSaveCaption} className="bg-blue-600 hover:bg-blue-700 text-white">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}