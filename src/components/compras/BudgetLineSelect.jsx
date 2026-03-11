import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useBudgetLines } from './useBudgetLines';

/**
 * Componente reutilizável para selecionar rubrica orçamentária
 * Sincronizado automaticamente com a tabela centralizada de rubricas
 */
export default function BudgetLineSelect({ 
  value, 
  onChange, 
  label = 'Rubrica orçamentária',
  placeholder = 'Selecione a rubrica...',
  required = false,
  disabled = false,
  className = '',
  showCodigo = true,
}) {
  const { budgetLines, isLoading } = useBudgetLines();

  return (
    <div className={className}>
      {label && (
        <Label className="text-xs text-gray-600 mb-1 block">
          {label} {required && '*'}
        </Label>
      )}
      <Select value={value || ''} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger className={isLoading ? 'opacity-50' : ''}>
          <SelectValue placeholder={isLoading ? 'Carregando rubricas...' : placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {budgetLines.map(line => (
            <SelectItem key={line.id} value={line.id}>
              {showCodigo ? `[${line.codigo}] ${line.nome}` : line.nome}
            </SelectItem>
          ))}
          {budgetLines.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-500">
              Nenhuma rubrica disponível
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}