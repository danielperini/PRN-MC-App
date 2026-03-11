import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpWrapper } from './withContextualHelp';
import { useAutoButtonHelp } from './useAutoHelp';

/**
 * AutoButton - Botão com ajuda contextual automática
 * 
 * Detecta automaticamente o tipo de botão pelo label (Salvar, Novo, Editar, etc.)
 * e aplica ajuda contextual apropriada.
 * 
 * Uso:
 * <AutoButton>Salvar</AutoButton>
 * <AutoButton variant="destructive">Excluir</AutoButton>
 */
export function AutoButton({ children, variant, size, ...props }) {
  const helpConfig = useAutoButtonHelp(children);

  if (!helpConfig) {
    // Se não conseguir detectar, renderiza sem ajuda
    return <Button variant={variant} size={size} {...props}>{children}</Button>;
  }

  return (
    <HelpWrapper
      componentKey={helpConfig.componentKey}
      label={helpConfig.label}
      componentType={helpConfig.componentType}
      contextDescription={helpConfig.contextDescription}
    >
      <Button variant={variant} size={size} {...props}>
        {children}
      </Button>
    </HelpWrapper>
  );
}

export default AutoButton;