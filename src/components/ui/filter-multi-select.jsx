import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function FilterMultiSelect({
  options = [],
  values = [],
  onChange,
  disabled = false,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Filtrar...',
  emptyText = 'Nenhuma opção encontrada',
  className,
  triggerClassName,
  dropdownClassName,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selectedValues = useMemo(
    () => (Array.isArray(values) ? values.filter(Boolean) : []),
    [values]
  );

  const normalizedOptions = useMemo(() => {
    return Array.from(new Set((options || []).filter(Boolean)));
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((item) => item.toLowerCase().includes(q));
  }, [normalizedOptions, query]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function updateSelection(nextValues) {
    if (typeof onChange === 'function') {
      onChange(nextValues);
    }
  }

  function toggleValue(option) {
    if (disabled) return;

    if (selectedValues.includes(option)) {
      updateSelection(selectedValues.filter((item) => item !== option));
      return;
    }

    // Adiciona sem permitir duplicação (Set evita adicionar se já existe)
    const nextValues = Array.from(new Set([...selectedValues, option]));
    updateSelection(nextValues);
  }

  function removeValue(option, event) {
    event?.stopPropagation?.();
    if (disabled) return;
    updateSelection(selectedValues.filter((item) => item !== option));
  }

  function clearAll(event) {
    event?.stopPropagation?.();
    if (disabled) return;
    updateSelection([]);
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          'flex min-h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-60',
          triggerClassName
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selectedValues.length > 0 ? (
            selectedValues.map((item) => (
              <Badge
                key={item}
                variant="secondary"
                className="max-w-full gap-1 pr-1 text-xs"
              >
                <span className="truncate">{item}</span>
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => removeValue(item, event)}
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>

        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            'absolute z-50 mt-2 w-full rounded-md border bg-popover shadow-md',
            dropdownClassName
          )}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedValues.includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleValue(option)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border',
                        checked && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1">{option}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={selectedValues.length === 0}
            >
              Limpar
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}