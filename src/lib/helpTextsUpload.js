/**
 * Textos de ajuda padronizados para uploads
 * Usado em Manual, FAQ e contexto de ajuda
 */

export const HELP_TEXTS_UPLOAD = {
  LIMIT_TAMANHO: {
    titulo: 'Limite de tamanho dos arquivos',
    conteudo: `O sistema aceita arquivos de até 25 MB por arquivo. Esse limite vale para:

• Notas fiscais em PDF e XML
• Comprovantes de pagamento
• Fotos de atividades
• Listas de presença
• Contratos
• Propostas
• Documentos administrativos
• Outros anexos

Em uploads múltiplos, cada arquivo é validado separadamente. Caso algum arquivo ultrapasse 25 MB, ele será recusado, mas os demais arquivos válidos poderão ser enviados.

Se você receber uma mensagem de "Arquivo muito grande", considere:
• Comprimir o arquivo (ZIP)
• Reduzir a resolução da imagem
• Dividir um PDF grande em múltiplos arquivos
• Converter para formato mais comprimido`,
  },

  FAQ_TAMANHO_MAXIMO: {
    pergunta: 'Qual o tamanho máximo permitido para upload?',
    resposta: `O limite é de 25 MB por arquivo. Se o arquivo ultrapassar esse tamanho, reduza o tamanho do PDF ou imagem antes de enviar. Você pode usar ferramentas online gratuitas para comprimir ou reduzir a resolução dos arquivos.`,
  },

  VALIDACAO_FRONTEND: {
    arquivo_valido: 'Arquivo validado com sucesso.',
    arquivo_invalido: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.',
    upload_sucesso: 'Arquivo enviado com sucesso.',
    upload_multiplo_sucesso: 'Arquivos enviados com sucesso.',
    arquivo_salvo_ia_falhou: 'Arquivo salvo com sucesso, mas a análise automática não foi concluída.',
    arquivo_salvo_backup_falhou: 'Arquivo salvo no sistema, mas houve falha no backup externo.',
  },

  VALIDACAO_BACKEND: {
    arquivo_muito_grande: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.',
    arquivo_obrigatorio: 'Arquivo é obrigatório.',
    erro_ao_gravar: 'Falha ao gravar arquivo no storage.',
    erro_desconhecido: 'Erro inesperado ao processar arquivo.',
  },

  SECOES_MANUAL: {
    entrada_unica: `Limite de tamanho: cada arquivo pode ter até 25 MB. Se você tentar enviar um arquivo maior, o sistema bloqueará o upload apenas daquele arquivo, permitindo que outros arquivos válidos sejam enviados normalmente.`,
    
    pagamentos_equipe: `Os comprovantes de pagamento podem ter até 25 MB. PDFs ou imagens em alta resolução são aceitos. Se o arquivo estiver muito grande, reduza a qualidade antes de enviar.`,
    
    compras: `Notas fiscais e documentos de compra podem ter até 25 MB. O sistema aceita PDF e XML. Se você receber um aviso de tamanho, comprima o arquivo e tente novamente.`,
    
    fotos_atividades: `Fotos podem ter até 25 MB por arquivo. O sistema aceita JPG, PNG e WEBP. Para otimizar o espaço, considere reduzir a resolução antes de enviar múltiplas fotos de alta resolução.`,
    
    backup_drive: `O backup automático no Google Drive respeita o mesmo limite de 25 MB por arquivo. Se um arquivo for muito grande para o backup, ele será salvo localmente no sistema, mas pode não ser sincronizado com o Drive.`,
  },

  ORIENTACOES_USUARIOS: {
    para_pdfs_grandes: `Se seu PDF tem mais de 25 MB, você pode:
1. Dividir em múltiplos PDFs menores
2. Usar um compressor de PDF online
3. Converteu para PNG/JPG em baixa resolução`,

    para_imagens_grandes: `Se sua imagem tem mais de 25 MB, você pode:
1. Reduzir a resolução usando editor de imagem
2. Converter para formato mais comprimido (JPG ao invés de PNG)
3. Dividir em múltiplas imagens menores`,

    para_xml_nf: `Arquivos XML de nota fiscal geralmente são pequenos (< 1 MB). Se estiver acima de 25 MB, pode haver um problema no arquivo. Verifique com o emissor ou tente gerar novamente.`,
  },
};

/**
 * Retornar texto de ajuda por chave
 */
export function getHelpText(category, key) {
  const section = HELP_TEXTS_UPLOAD[category];
  return section ? section[key] : null;
}

/**
 * Gerar texto para Manual de Ajuda
 */
export function generateManualSection() {
  const { LIMIT_TAMANHO, SECOES_MANUAL } = HELP_TEXTS_UPLOAD;
  
  return `
## ${LIMIT_TAMANHO.titulo}

${LIMIT_TAMANHO.conteudo}

### Entrada Única de Documentos
${SECOES_MANUAL.entrada_unica}

### Pagamentos da Equipe
${SECOES_MANUAL.pagamentos_equipe}

### Compras e Notas Fiscais
${SECOES_MANUAL.compras}

### Fotos de Atividades
${SECOES_MANUAL.fotos_atividades}

### Backup no Google Drive
${SECOES_MANUAL.backup_drive}
`;
}

/**
 * Gerar FAQ
 */
export function generateFAQ() {
  const { FAQ_TAMANHO_MAXIMO } = HELP_TEXTS_UPLOAD;
  
  return `
**P: ${FAQ_TAMANHO_MAXIMO.pergunta}**

R: ${FAQ_TAMANHO_MAXIMO.resposta}
`;
}