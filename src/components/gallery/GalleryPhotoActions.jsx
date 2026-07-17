import React, { useState } from 'react';
import { Trash2, Pencil, Mail, Link2, CheckSquare, Square, X, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

// Botões de ação individuais por card
export function PhotoActionBar({ image, selected, onToggleSelect, onDelete, onEditCaption, selectionMode }) {
  return (
    <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-10">
      {/* Checkbox de seleção */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(image); }}
        className={`flex items-center justify-center w-7 h-7 rounded-full shadow-md border-2 transition-all
          ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/90 border-gray-300 text-gray-400 hover:border-blue-400'}`}
        title={selected ? 'Desmarcar' : 'Selecionar'}
      >
        {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
      </button>

      {/* Ações rápidas (visíveis no hover ou quando não está em modo seleção) */}
      <div className={`flex gap-1 ${selectionMode ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditCaption(image); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 transition-all"
          title="Editar legenda"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(image); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition-all"
          title="Excluir foto"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Barra de ações em bloco (aparece quando há fotos selecionadas)
export function BulkActionBar({ selectedPhotos, onDeselectAll, onDeleteSelected, onEmailSelected, onCopyLinks }) {
  const count = selectedPhotos.length;
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-300 bg-blue-600 px-4 py-3 shadow-lg">
      <span className="text-sm font-semibold text-white">
        {count} {count === 1 ? 'foto selecionada' : 'fotos selecionadas'}
      </span>

      <div className="flex flex-wrap gap-2 ml-auto">
        <button
          type="button"
          onClick={onCopyLinks}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Copiar links
        </button>
        <button
          type="button"
          onClick={onEmailSelected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
        >
          <Mail className="w-3.5 h-3.5" />
          Enviar por e-mail
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300/50 bg-red-500/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500/50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir selecionadas
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Limpar seleção
        </button>
      </div>
    </div>
  );
}

// Modal para editar legenda de uma foto
export function EditCaptionDialog({ photo, open, onClose, onSave }) {
  const [legenda, setLegenda] = useState(photo?.legenda || photo?.caption || '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (photo) setLegenda(photo.legenda || photo.caption || '');
  }, [photo]);

  async function handleSave() {
    if (!photo) return;
    setSaving(true);
    try {
      if (photo.sourceEntity === 'ReportPhoto') {
        await base44.entities.ReportPhoto.update(photo.sourceId, { legenda, caption: legenda });
      } else if (photo.sourceEntity === 'Attachment') {
        await base44.entities.Attachment.update(photo.sourceId, { description: legenda });
      }
      onSave({ ...photo, legenda, caption: legenda });
      onClose();
    } catch (e) {
      console.error('Erro ao salvar legenda', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-amber-500" />
            Editar legenda
          </DialogTitle>
        </DialogHeader>
        {photo && (
          <div className="space-y-4 py-2">
            <img
              src={photo.fileUrl}
              alt="preview"
              className="w-full h-40 object-cover rounded-xl border border-gray-200"
            />
            <div>
              <Label className="mb-2 block text-sm font-medium">Legenda</Label>
              <Input
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                placeholder="Digite a legenda da foto..."
                className="text-sm"
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-500">
              Arquivo: {photo.fileName || '—'} · {photo.sourceEntity}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando...' : 'Salvar legenda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Modal para confirmar exclusão
export function DeleteConfirmDialog({ photos, open, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [erros, setErros] = useState([]);

  async function handleDelete() {
    setDeleting(true);
    const errosList = [];
    for (const photo of photos) {
      try {
        if (photo.sourceEntity === 'ReportPhoto') {
          await base44.entities.ReportPhoto.delete(photo.sourceId);
        } else if (photo.sourceEntity === 'Attachment') {
          await base44.entities.Attachment.delete(photo.sourceId);
        }
      } catch (e) {
        errosList.push(photo.fileName || photo.sourceId);
      }
    }
    setErros(errosList);
    setDeleting(false);
    setDone(true);
    onConfirm(photos.filter(p => !errosList.includes(p.fileName || p.sourceId)));
  }

  function handleClose() {
    setDone(false);
    setErros([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-4 h-4" />
            Excluir {photos?.length === 1 ? 'foto' : `${photos?.length} fotos`}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          {!done ? (
            <>
              <p className="text-sm text-gray-700">
                {photos?.length === 1
                  ? `Tem certeza que deseja excluir "${photos[0]?.fileName || 'esta foto'}"? Esta ação não pode ser desfeita.`
                  : `Tem certeza que deseja excluir ${photos?.length} fotos? Esta ação não pode ser desfeita.`}
              </p>
              {photos?.length > 1 && (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {photos.slice(0, 8).map((p, i) => (
                    <span key={i} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-0.5 text-red-700 truncate max-w-[140px]">
                      {p.fileName || p.sourceId}
                    </span>
                  ))}
                  {photos.length > 8 && <span className="text-xs text-gray-400">+{photos.length - 8} mais</span>}
                </div>
              )}
            </>
          ) : (
            <div className={`rounded-lg p-3 text-sm ${erros.length > 0 ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                {erros.length > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {erros.length > 0 ? `${photos.length - erros.length} excluídas, ${erros.length} com erro` : 'Fotos excluídas com sucesso!'}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={handleClose}>
            {done ? 'Fechar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Modal para enviar fotos por e-mail
export function EmailPhotosDialog({ photos, open, onClose }) {
  const [emailTo, setEmailTo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('links'); // 'links' ou 'email'

  function buildLinksText() {
    return photos.map((p, i) =>
      `${i + 1}. ${p.legenda || p.activityTitulo || p.fileName || 'Foto'}\n   ${p.fileUrl}`
    ).join('\n\n');
  }

  function handleCopyLinks() {
    const text = buildLinksText();
    navigator.clipboard.writeText(text).then(() => {
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    });
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) { setError('Informe o e-mail do destinatário.'); return; }
    setSending(true);
    setError('');
    try {
      const linksHtml = photos.map((p, i) =>
        `<li style="margin-bottom:8px"><strong>${p.legenda || p.activityTitulo || p.fileName || 'Foto ' + (i+1)}</strong><br>
        <a href="${p.fileUrl}">${p.fileUrl}</a></li>`
      ).join('');

      const body = `
        <p>${mensagem ? mensagem + '<br><br>' : ''}Segue a seleção de ${photos.length} foto(s) da Galeria Museus Centro:</p>
        <ol>${linksHtml}</ol>
        <p style="color:#888;font-size:12px">Enviado via Sistema Museus Centro</p>
      `;

      await base44.integrations.Core.SendEmail({
        to: emailTo.trim(),
        subject: `Fotos da Galeria — ${photos.length} imagem(ns) selecionada(s)`,
        body,
      });
      setSent(true);
    } catch (e) {
      setError('Erro ao enviar e-mail: ' + (e.message || 'verifique o destinatário.'));
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setSent(false);
    setError('');
    setEmailTo('');
    setMensagem('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            Compartilhar {photos.length} foto(s)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Miniaturas */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {photos.slice(0, 12).map((p, i) => (
              <img key={i} src={p.fileUrl} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
            ))}
            {photos.length > 12 && (
              <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                +{photos.length - 12}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button type="button" onClick={() => setMode('email')}
              className={`flex-1 py-2 font-medium transition-colors ${mode === 'email' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Mail className="w-3.5 h-3.5 inline mr-1" /> Enviar por e-mail
            </button>
            <button type="button" onClick={() => setMode('links')}
              className={`flex-1 py-2 font-medium transition-colors ${mode === 'links' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Link2 className="w-3.5 h-3.5 inline mr-1" /> Copiar links
            </button>
          </div>

          {mode === 'email' && (
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-sm">Destinatário (e-mail registrado no sistema)</Label>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email@exemplo.com"
                  type="email"
                />
                <p className="mt-1 text-xs text-gray-400">Apenas usuários registrados no sistema podem receber e-mails.</p>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">Mensagem (opcional)</Label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Adicione uma mensagem ao envio..."
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm resize-none h-20"
                />
              </div>
            </div>
          )}

          {mode === 'links' && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500 mb-2">Links das {photos.length} fotos selecionadas:</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-36 overflow-y-auto font-mono">
                {buildLinksText()}
              </pre>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {sent && mode === 'email' && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              E-mail enviado com sucesso!
            </div>
          )}
          {sent && mode === 'links' && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Links copiados para a área de transferência!
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
          {mode === 'email' ? (
            <Button onClick={handleSendEmail} disabled={sending || !emailTo.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Send className="w-4 h-4 mr-1.5" />
              {sending ? 'Enviando...' : 'Enviar e-mail'}
            </Button>
          ) : (
            <Button onClick={handleCopyLinks} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link2 className="w-4 h-4 mr-1.5" />
              Copiar todos os links
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}