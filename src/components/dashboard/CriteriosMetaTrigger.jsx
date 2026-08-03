import React, { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import CriteriosMetaDrawer from './CriteriosMetaDrawer';
import { CHAVES_DISPONIVEIS } from '@/hooks/useDashboardCriterios';

/**
 * Trigger (engrenagem) que abre o drawer de configuração de critérios.
 * Renderiza apenas para usuários com isCoordGeral=true.
 *
 * Props:
 *  - chave: string             (chave de config, ex: 'dashboard_criterios_meta_20')
 *  - atividades: array         (lista de atividades para preview de contagem)
 *  - isCoordGeral: boolean     (se o usuário pode ver/editar)
 *  - metaLabel?: string        (rótulo amigável opcional para o drawer)
 */
export default function CriteriosMetaTrigger({ chave, atividades = [], isCoordGeral, metaLabel }) {
  const [open, setOpen] = useState(false);

  if (!isCoordGeral) return null;
  if (!chave) return null;

  const meta = CHAVES_DISPONIVEIS.find(c => c.chave === chave);

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Configurar critérios de contagem"
        aria-label="Configurar critérios de contagem"
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
      </button>
      <CriteriosMetaDrawer
        open={open}
        onClose={() => setOpen(false)}
        chaveInicial={chave}
        atividades={atividades}
        metaLabel={metaLabel || meta?.label}
      />
    </>
  );
}