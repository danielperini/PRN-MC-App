import { useHelp } from './HelpContextProvider';

/**
 * Hook para aplicar ajuda contextual automaticamente com mapeamento inteligente
 * 
 * Uso:
 * const helpProps = useAutoHelp('btn-salvar', 'Salvar', 'button');
 * <Button {...helpProps}>Salvar</Button>
 */
export function useAutoHelp(componentKey, label, componentType) {
  const { getHelpText } = useHelp();

  return {
    'data-help-key': componentKey,
    'data-help-label': label,
    'data-help-type': componentType,
    onMouseEnter: async (e) => {
      // Timer será gerenciado por ContextualTooltip se envolvido
      const helpText = await getHelpText(componentKey, label, componentType, `${componentType}: ${label}`);
      if (helpText && e.currentTarget) {
        e.currentTarget.setAttribute('data-help-text', helpText);
      }
    },
  };
}

/**
 * Mapeamento automático de tipos de botão para componentKey
 * 
 * Detecta automaticamente o tipo de botão baseado no conteúdo/props
 */
export const buttonTypeMap = {
  'novo': { key: 'btn-novo', type: 'button', context: 'Cria um novo registro' },
  'salvar': { key: 'btn-salvar', type: 'button', context: 'Salva as alterações' },
  'editar': { key: 'btn-editar', type: 'button', context: 'Abre para edição' },
  'excluir': { key: 'btn-excluir', type: 'button', context: 'Remove permanentemente' },
  'cancelar': { key: 'btn-cancelar', type: 'button', context: 'Cancela a operação' },
  'submeter': { key: 'btn-submeter', type: 'button', context: 'Envia para revisão' },
  'aprovar': { key: 'btn-aprovar', type: 'button', context: 'Aprova a solicitação' },
  'rejeitar': { key: 'btn-rejeitar', type: 'button', context: 'Rejeita a solicitação' },
  'exportar': { key: 'btn-exportar', type: 'button', context: 'Exporta em PDF/Excel' },
  'filtrar': { key: 'btn-filtrar', type: 'button', context: 'Aplica filtros' },
  'buscar': { key: 'btn-buscar', type: 'button', context: 'Realiza busca' },
};

/**
 * Hook para detectar automaticamente tipo de botão pelo label
 */
export function useAutoButtonHelp(buttonLabel) {
  const normalized = buttonLabel?.toLowerCase().trim() || '';
  const mapping = buttonTypeMap[normalized];
  
  if (!mapping) {
    return null;
  }

  return {
    componentKey: mapping.key,
    label: buttonLabel,
    componentType: mapping.type,
    contextDescription: mapping.context,
  };
}

/**
 * Hook para campos de formulário com detecção automática
 */
export function useAutoFieldHelp(fieldLabel) {
  const normalized = fieldLabel?.toLowerCase().trim() || '';
  
  const fieldMap = {
    'titulo': { key: 'field-titulo', context: 'Nome ou identificação do item' },
    'descricao': { key: 'field-descricao', context: 'Detalhes adicionais' },
    'email': { key: 'field-email', context: 'Endereço de email' },
    'data': { key: 'field-data', context: 'Data de referência' },
    'status': { key: 'field-status', context: 'Situação atual do item' },
  };

  const mapping = fieldMap[normalized];
  if (!mapping) {
    return null;
  }

  return {
    componentKey: mapping.key,
    label: fieldLabel,
    componentType: 'field',
    contextDescription: mapping.context,
  };
}