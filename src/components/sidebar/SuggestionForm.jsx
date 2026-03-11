import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function SuggestionForm({ currentUser, collapsed }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [categoria, setCategoria] = useState('Plataforma');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!titulo.trim() || !conteudo.trim()) {
      toast.error('Preencha título e descrição');
      return;
    }

    setLoading(true);
    try {
      await base44.entities.Suggestion.create({
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        categoria,
        usuario_email: currentUser.email,
        usuario_nome: currentUser.full_name,
        status: 'RECEBIDA'
      });

      toast.success('Sugestão enviada com sucesso!');
      setTitulo('');
      setConteudo('');
      setCategoria('Plataforma');
      setOpen(false);
    } catch (error) {
      toast.error('Erro ao enviar sugestão');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="ghost"
        className={`w-full h-9 text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/8 transition-all ${
          collapsed ? 'justify-center px-0' : 'justify-start px-3 gap-2.5'
        }`}
        title={collapsed ? 'Sugestões' : ''}
      >
        <MessageSquare className={collapsed ? 'w-5 h-5' : 'w-4 h-4'} />
        {!collapsed && <span>Sugestões</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Enviar Sugestão
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Título */}
            <div>
              <label className="text-xs font-medium text-gray-700">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Melhorar busca de relatórios"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="text-xs font-medium text-gray-700">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                <option>Plataforma</option>
                <option>Fluxo de Trabalho</option>
                <option>Interface</option>
                <option>Projeto</option>
                <option>Relatórios</option>
                <option>Outro</option>
              </select>
            </div>

            {/* Descrição */}
            <div>
              <label className="text-xs font-medium text-gray-700">Descrição</label>
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Descreva sua sugestão em detalhes..."
                rows={4}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                disabled={loading}
              >
                {loading ? 'Enviando...' : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}