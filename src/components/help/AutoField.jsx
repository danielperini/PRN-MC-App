import React from 'react';
import { HelpFormField } from './HelpFormField';
import { useAutoFieldHelp } from './useAutoHelp';

/**
 * AutoField - Campo de formulário com ajuda contextual automática
 * 
 * Detecta automaticamente o tipo de campo pelo label (Email, Data, Status, etc.)
 * e aplica ajuda contextual apropriada.
 * 
 * Uso:
 * <AutoField label="Email">
 *   <Input type="email" />
 * </AutoField>
 */
export function AutoField({ label, children, ...props }) {
  const helpConfig = useAutoFieldHelp(label);

  if (!helpConfig) {
    // Se não conseguir detectar, renderiza sem ajuda
    return (
      <div>
        <label className="text-sm font-medium text-slate-900">{label}</label>
        {children}
      </div>
    );
  }

  return (
    <HelpFormField
      label={label}
      contextDescription={helpConfig.contextDescription}
      {...props}
    >
      {children}
    </HelpFormField>
  );
}

export default AutoField;