import React, { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';

const BANNER_KEY = 'banner_entrada_unica_v1_dismissed';

export default function GlobalAnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(BANNER_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 flex items-start gap-3 shadow-md z-50 relative">
      <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 opacity-90" />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        <span className="font-semibold">Nova funcionalidade: Entrada Única de Documentos.</span>{' '}
        Agora você pode enviar notas fiscais, XMLs, comprovantes, fotos de atividades e outros documentos pela opção{' '}
        <span className="font-medium underline underline-offset-2">"Entrada Única de Documentos"</span>{' '}
        no menu lateral. Os arquivos são analisados pela IA, classificados automaticamente e você revisa antes de enviar para aprovação.
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors mt-0.5"
        aria-label="Fechar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}