import React from 'react';
import { HelpWrapper } from '@/components/help/withContextualHelp';

/**
 * Wrapper para campos de formulário com ajuda contextual
 * Uso: <HelpFormField label="Email" contextDescription="Email do usuário">
 *        <Input ... />
 *      </HelpFormField>
 */
export function HelpFormField({
  componentKey,
  label,
  contextDescription,
  children,
  className = '',
}) {
  const key = componentKey || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <HelpWrapper
      componentKey={key}
      label={label || 'Campo de formulário'}
      componentType="field"
      contextDescription={contextDescription}
      className={className}
    >
      {children}
    </HelpWrapper>
  );
}

export default HelpFormField;