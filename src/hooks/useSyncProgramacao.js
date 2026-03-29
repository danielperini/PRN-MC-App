import { base44 } from '@/api/base44Client';

const PROGRAMACAO_SOURCE_URL =
  'https://docs.google.com/spreadsheets/d/1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC/edit?usp=drive_link&ouid=114388859796899599894&rtpof=true&sd=true';

export async function syncProgramacao(extraArgs = {}) {
  const response = await base44.functions.invoke('syncProgramacao', {
    source_url: PROGRAMACAO_SOURCE_URL,
    title: 'Programação espelhada',
    mode: 'history',
    debug: '1',
    ...extraArgs,
  });

  return response?.data || response;
}
