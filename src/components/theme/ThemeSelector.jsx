import React from 'react';
import { useTheme, THEMES } from '@/context/ThemeContext';
import { Check, Palette } from 'lucide-react';
import { toast } from 'sonner';

export default function ThemeSelector() {
  const { themeId, setTheme } = useTheme();

  const handleSelect = (id) => {
    setTheme(id);
    toast.success(`${THEMES[id].nome} aplicado com sucesso!`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Palette className="w-5 h-5 text-gray-500" style={{ color: 'var(--cor-primaria)' }} />
        <h3 className="font-semibold text-base" style={{ color: 'var(--cor-texto)' }}>
          Tema Visual
        </h3>
      </div>
      <p className="text-sm text-gray-500 -mt-2">
        Escolha o esquema de cores do sistema. A preferência é salva automaticamente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        {Object.values(THEMES).map((theme) => {
          const isActive = themeId === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              className={`relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md focus:outline-none ${
                isActive
                  ? 'border-blue-500 shadow-md ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {isActive && (
                <span className="absolute top-3 right-3 bg-blue-500 text-white rounded-full p-0.5">
                  <Check className="w-3 h-3" />
                </span>
              )}

              {/* Paleta de cores */}
              <div className="flex gap-1.5 mb-3">
                {theme.preview.map((color, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <p className="font-semibold text-sm text-gray-900">{theme.nome}</p>
              <p className="text-xs text-gray-500 mt-0.5">{theme.descricao}</p>

              {isActive && (
                <span className="inline-block mt-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Ativo
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}