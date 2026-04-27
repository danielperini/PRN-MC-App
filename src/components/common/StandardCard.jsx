import React from 'react';
import { CARD_STYLES } from '@/lib/styleGuide';

/**
 * StandardCard — Componente base padronizado preto/branco
 * Use para todos os cards do sistema
 */
export function StandardCard({ 
  children, 
  className = '',
  variant = 'container',
  ...props 
}) {
  const baseStyles = CARD_STYLES[variant] || CARD_STYLES.container;
  return (
    <div className={`${baseStyles} ${className}`} {...props}>
      {children}
    </div>
  );
}

/**
 * StatCard — Card para exibir estatísticas
 */
export function StatCard({ 
  label, 
  value, 
  subtext = '',
  className = '' 
}) {
  return (
    <StandardCard variant="stat" className={className}>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </StandardCard>
  );
}

/**
 * AlertCard — Card para exibir alertas/avisos
 */
export function AlertCard({ 
  icon: Icon,
  title,
  message,
  action = null,
  onDismiss = null
}) {
  return (
    <div className={CARD_STYLES.alert + ' flex items-start gap-3'}>
      {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
      <div className="flex-1">
        {title && <h3 className="text-sm font-semibold text-black">{title}</h3>}
        {message && <p className="text-xs text-gray-700 mt-0.5">{message}</p>}
      </div>
      {action && (
        <div className="flex-shrink-0 ml-2">
          {action}
        </div>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-black hover:text-gray-700 transition-colors ml-2"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * EmptyStateCard — Card para exibir estado vazio
 */
export function EmptyStateCard({
  icon: Icon,
  title = 'Sem dados disponíveis',
  message = '',
  action = null
}) {
  return (
    <div className="border-2 border-dashed border-black rounded-2xl bg-white p-12 text-center">
      {Icon && <Icon className="w-12 h-12 text-black mx-auto mb-4 opacity-50" />}
      <p className="text-black font-medium">{title}</p>
      {message && <p className="text-gray-600 text-sm mt-1">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}