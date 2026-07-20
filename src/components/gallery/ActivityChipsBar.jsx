import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

const SESSION_KEY = 'galeria_atividade_labels';

function loadLabels() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistLabels(obj) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch {
    // noop
  }
}

// Extrai nome de atividade do nome do arquivo
export function extrairNomeAtividade(fileName = '') {
  if (!fileName) return null;
  const m = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  if (m) return m[1].replace(/_/g, ' ').trim();
  return null;
}

// Calcula a chave de agrupamento (interna, imutável) para uma foto
export function getAtividadeKey(image) {
  const fromTitle = image.activityTitulo && String(image.activityTitulo).trim();
  if (fromTitle) return fromTitle;
  if (image.activity_id) return String(image.activity_id);
  const fromName = extrairNomeAtividade(image.fileName);
  if (fromName) return fromName;
  return 'sem_atividade';
}

// Calcula o rótulo de exibição para um chip (considerando edição manual)
function resolveLabel(key, labels) {
  return labels[key] || key;
}

function ChipInput({ initialValue, onSave, onCancel }) {
  const [value, setValue] = React.useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        className="w-44 rounded-full border border-black bg-white px-3 py-1 text-xs font-medium text-black focus:outline-none focus:ring-2 focus:ring-black/20"
      />
      <button
        type="button"
        onClick={() => onSave(value.trim())}
        className="rounded-full bg-black p-1 text-white hover:bg-gray-800"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-gray-300 bg-white p-1 text-gray-500 hover:bg-gray-50"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ActivityChipsBar({ sectionKey, items, selectedKey, onSelect, labels, onRename }) {
  // Atualiza o estado quando um item é editado
  const [editingKey, setEditingKey] = useState(null);

  // Reset de edição ao trocar de seção
  useEffect(() => {
    setEditingKey(null);
  }, [sectionKey]);

  // Conta fotos por atividade — sobre os itens já filtrados da seção
  const atividades = useMemo(() => {
    const map = new Map();
    items.forEach((entry) => {
      const key = getAtividadeKey(entry.image);
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + 1);
    });
    // Ordena: sem_atividade por último
    const entries = Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'sem_atividade') return 1;
      if (b[0] === 'sem_atividade') return -1;
      return a[0].localeCompare(b[0], 'pt-BR');
    });
    return entries;
  }, [items]);

  if (atividades.length <= 1) return null;

  const totalCount = items.length;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 pt-1">
      {/* Chip Todas */}
      {editingKey === '__todas__' ? null : (
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
            ${selectedKey === '' || !selectedKey
              ? 'border-black bg-black text-white shadow'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'}`}
        >
          Todas
          <span className={`text-[10px] ${selectedKey === '' || !selectedKey ? 'opacity-70' : 'text-gray-400'}`}>
            ({totalCount})
          </span>
        </button>
      )}

      {atividades.map(([key, count]) => {
        if (editingKey === key) {
          return (
            <ChipInput
              key={`edit-${key}`}
              initialValue={resolveLabel(key, labels)}
              onSave={(newLabel) => {
                onRename(key, newLabel);
                setEditingKey(null);
              }}
              onCancel={() => setEditingKey(null)}
            />
          );
        }

        const displayLabel = resolveLabel(key, labels);
        const isActive = selectedKey === key;

        return (
          <div key={key} className="group relative inline-flex shrink-0">
            <button
              type="button"
              onClick={() => onSelect(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
                ${isActive
                  ? 'border-black bg-black text-white shadow'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'}`}
            >
              {displayLabel}
              <span className={`text-[10px] ${isActive ? 'opacity-70' : 'text-gray-400'}`}>
                ({count})
              </span>
            </button>
            <button
              type="button"
              title="Renomear atividade"
              onClick={() => setEditingKey(key)}
              className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-gray-400 shadow-sm border border-gray-200 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-700"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}