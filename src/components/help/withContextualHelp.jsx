import React from 'react';
import { ContextualTooltip } from '@/components/help/ContextualTooltip';

/**
 * HOC que envolve um componente com ajuda contextual
 * Uso: <HelpButton componentKey="btn-novo" label="Novo" componentType="button">...</HelpButton>
 */
export function withContextualHelp(Component, defaultProps = {}) {
  return function ComponentWithHelp(props) {
    const { componentKey, label, componentType = 'other', contextDescription, ...restProps } = props;
    
    if (!componentKey) {
      return <Component {...restProps} />;
    }

    return (
      <ContextualTooltip
        componentKey={componentKey}
        label={label || defaultProps.label}
        componentType={componentType}
        contextDescription={contextDescription}
        className={restProps.className}
      >
        <Component {...restProps} />
      </ContextualTooltip>
    );
  };
}

/**
 * Wrapper direto para envolver qualquer elemento com ajuda contextual
 */
export function HelpWrapper({ 
  componentKey, 
  label, 
  componentType = 'other',
  contextDescription,
  children,
  className 
}) {
  if (!componentKey) {
    return <>{children}</>;
  }

  return (
    <ContextualTooltip
      componentKey={componentKey}
      label={label}
      componentType={componentType}
      contextDescription={contextDescription}
      className={className}
    >
      {children}
    </ContextualTooltip>
  );
}