import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const HelpContext = createContext(null);

async function generateWithClaude(label, componentType, contextDescription) {
  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em ajuda contextual de interface. Gere um texto curto e útil para esta funcionalidade:

Tipo: ${componentType}
Label: "${label}"
Contexto: ${contextDescription || 'N/A'}

Padrão de resposta:
1. Primeira frase: o que é / o que faz
2. Segunda frase: para que serve / quando usar
3. Opcional: efeito esperado da ação

Escreva SEMPRE em português do Brasil. Seja claro, objetivo, elegante e profissional. Sem texto genérico. Máximo 3 linhas.

Responda APENAS com o texto de ajuda, sem explicações adicionais.`,
      model: 'gpt_5_mini',
    });

    return response || null;
  } catch (error) {
    console.error('Erro ao chamar IA:', error);
    return null;
  }
}

export function HelpContextProvider({ children }) {
  const [isHelpEnabled, setIsHelpEnabled] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const cacheRef = useRef({});

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getFromCache = useCallback((componentKey) => {
    if (!isClient) return null;

    if (cacheRef.current[componentKey]) {
      return cacheRef.current[componentKey];
    }

    try {
      const cached = localStorage.getItem(`help_${componentKey}`);

      if (cached) {
        cacheRef.current[componentKey] = JSON.parse(cached);
        return cacheRef.current[componentKey];
      }
    } catch {
      return null;
    }

    return null;
  }, [isClient]);

  const saveToCache = useCallback((componentKey, text) => {
    if (!isClient) return;

    cacheRef.current[componentKey] = text;

    try {
      localStorage.setItem(`help_${componentKey}`, JSON.stringify(text));
    } catch {
      console.error('Erro ao salvar cache');
    }
  }, [isClient]);

  const getHelpText = useCallback(async (componentKey, label, componentType, contextDescription) => {
    if (!isClient) return null;

    const cached = getFromCache(componentKey);
    if (cached) return cached;

    try {
      const existing = await base44.entities.HelpText.filter({
        component_key: componentKey,
        active: true,
      });

      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.help_text_ptbr) {
        const text = existing[0].help_text_ptbr;
        saveToCache(componentKey, text);
        return text;
      }

      const generated = await generateWithClaude(label, componentType, contextDescription);

      if (generated) {
        try {
          await base44.entities.HelpText.create({
            component_key: componentKey,
            page_route: typeof window !== 'undefined' ? window.location.pathname : '',
            component_type: componentType,
            label,
            context_description: contextDescription,
            help_text_ptbr: generated,
            generated_by_model: 'gpt_5_mini',
            last_generated_at: new Date().toISOString(),
            active: true,
            manually_edited: false,
          });
        } catch (saveError) {
          console.warn('Falha ao salvar HelpText:', saveError);
        }

        saveToCache(componentKey, generated);
        return generated;
      }
    } catch (error) {
      console.error('Erro ao gerar ajuda:', error);
    }

    return null;
  }, [getFromCache, saveToCache, isClient]);

  if (!isClient) {
    return <>{children}</>;
  }

  return (
    <HelpContext.Provider value={{ getHelpText, isHelpEnabled, setIsHelpEnabled }}>
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const context = useContext(HelpContext);

  if (!context) {
    return {
      getHelpText: async () => null,
      isHelpEnabled: false,
      setIsHelpEnabled: () => {},
    };
  }

  return context;
}
