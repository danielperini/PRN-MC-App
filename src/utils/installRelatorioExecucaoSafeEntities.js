import { base44 } from '@/api/base44Client';

const ENTIDADES_INEXISTENTES_RELATORIO = [
  'ActivityReport',
  'RelatorioAtividade',
  'RelatorioMensalAtividade',
  'Meta',
  'MetaProjeto',
  'Atividade',
  'Evento',
  'Attendance',
  'ListaPresenca',
  'Presenca',
  'Collaborator',
  'Colaborador',
  'MembroEquipe',
  'GalleryPhoto',
  'GaleriaFoto',
  'ActivityPhoto',
  'AtividadeFoto',
  'Photo',
  'Foto',
];

function estaNaPaginaRelatorioExecucao() {
  return window.location.pathname.includes('/RelatorioExecucaoObjeto');
}

export function installRelatorioExecucaoSafeEntities() {
  const entities = base44?.entities;
  if (!entities) return;

  ENTIDADES_INEXISTENTES_RELATORIO.forEach((nome) => {
    const entidadeOriginal = entities[nome];
    const listOriginal = entidadeOriginal?.list?.bind(entidadeOriginal);

    if (!entidadeOriginal || !listOriginal) return;
    if (entidadeOriginal.__relatorioExecucaoSafeListInstalled) return;

    entidadeOriginal.list = async (...args) => {
      if (estaNaPaginaRelatorioExecucao()) {
        console.warn(`[RelatorioExecucaoObjeto] Entidade indisponível ignorada: ${nome}`);
        return [];
      }

      try {
        return await listOriginal(...args);
      } catch (error) {
        const status = error?.status || error?.response?.status;
        if (status === 404) {
          console.warn(`[Base44] Entidade indisponível ignorada: ${nome}`);
          return [];
        }
        throw error;
      }
    };

    Object.defineProperty(entidadeOriginal, '__relatorioExecucaoSafeListInstalled', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}
