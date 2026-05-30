import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useBudgetLines } from './useBudgetLines';

/**
 * Componente reutilizável para selecionar rubrica orçamentária oficial.
 * Lista rubricas ativas da entidade Rubrica (via useBudgetLines).
 */
export default function BudgetLineSelect({ 
  value, 
  onChange, 
  label = 'Rubrica orçamentária',
  placeholder = 'Selecione a rubrica...',
  required = false,
  disabled = false,
  className = '',
  showCodigo = false,
  museuFiltro = null,
  metaFiltro = null,
}) {
  const { budgetLines, isLoading } = useBudgetLines();

  const rubricas = React.useMemo(() => {
    let lista = budgetLines.filter((r) => r?.ativo !== false);
    if (museuFiltro) {
      const museu = String(museuFiltro).toUpperCase().replace('MAB', 'MHAB');
      if (museu === 'NOTURNO') {
        lista = lista.filter((r) => {
          const escopo = String(r?.escopo_orcamentario || '').toUpperCase();
          const texto = `${r?.rubrica || ''} ${r?.meta || ''} ${r?.grupo || ''}`.toLowerCase();
          return escopo === 'NOTURNO' || texto.includes('noturno') || texto.includes('ed. 2026');
        });
      } else {
        lista = lista.filter((r) => {
          const codigo = String(r?.museu_codigo || '').toUpperCase().replace('MAB', 'MHAB');
          return codigo === museu;
        });
      }
    }
    if (metaFiltro) {
      const meta = String(metaFiltro).toLowerCase();
      lista = lista.filter((r) => {
        const grupo = String(r?.grupo || r?.meta || '').toLowerCase();
        return grupo.includes(meta) || meta.includes(grupo.slice(0, 20));
      });
    }
    return lista;
  }, [budgetLines, museuFiltro, metaFiltro]);

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
          {rubricas.map(r => (
            <SelectItem key={r.id} value={r.id}>
              {r.nome || r.rubrica || r.descricao}
            </SelectItem>
          ))}
          {rubricas.length === 0 && !isLoading && (
            <div className="px-2 py-2 text-xs text-gray-500">
              Nenhuma rubrica disponível
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}