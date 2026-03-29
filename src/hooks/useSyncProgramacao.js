import { base44 } from '@/api/base44Client';

const PROGRAMACAO_FILE_NAME = 'Planilha_de_programação_MC-VAR (1).xlsx';

export async function syncProgramacao(extraArgs = {}) {
  const response = await base44.functions.invoke('syncProgramacao', {
    file_name: PROGRAMACAO_FILE_NAME,
    ...extraArgs,
  });

  return response?.data || response;
}
