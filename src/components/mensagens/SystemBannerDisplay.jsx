import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Megaphone } from 'lucide-react';

export default function SystemBannerDisplay() {
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const u = await base44.auth.me();
        setUser(u);
        const msgs = await base44.entities.SystemMessage.filter({ status: 'enviado', exibir_banner: true });
        const hoje = new Date().toISOString().slice(0, 10);
        const ativos = (msgs || []).filter((m) => {
          if (m.data_expiracao && m.data_expiracao < hoje) return false;
          if ((m.banner_dispensado_por || []).includes(u?.email)) return false;
          if (!m.destinatarios || m.destinatarios.length === 0) return true;
          return m.destinatarios.includes(u?.email);
        });
        setBanners(ativos);
      } catch {
        // silencioso
      }
    }
    load();
  }, []);

  async function dismiss(msg) {
    setDismissed((prev) => [...prev, msg.id]);
    try {
      await base44.functions.invoke('dismissSystemBanner', { messageId: msg.id });
    } catch {
      // silencioso
    }
  }

  const visible = banners.filter((b) => !dismissed.includes(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-0">
      {visible.map((msg) => (
        <div
          key={msg.id}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 flex items-start gap-3 shadow-sm z-50 relative"
        >
          <Megaphone className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-90" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm">{msg.titulo}.</span>{' '}
            <span className="text-sm opacity-90 leading-relaxed">{msg.corpo}</span>
          </div>
          <button
            onClick={() => dismiss(msg)}
            className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}