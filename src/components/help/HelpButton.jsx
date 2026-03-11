import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpWrapper } from '@/components/help/withContextualHelp';

/**
 * Botão com ajuda contextual integrada
 */
export function HelpButton({
  componentKey,
  label,
  contextDescription,
  children,
  ...buttonProps
}) {
  return (
    <HelpWrapper
      componentKey={componentKey}
      label={label || buttonProps['aria-label'] || 'Botão'}
      componentType="button"
      contextDescription={contextDescription}
    >
      <Button {...buttonProps}>
        {children}
      </Button>
    </HelpWrapper>
  );
}

export default HelpButton;