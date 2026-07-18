import { useState, useMemo } from 'react';

export const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Converte 'Fevereiro' + 2026 → número comparável 202602
export function mesAnoToNumero(mes, ano) {
  const idx = MESES_PT.findIndex(m => m.toLowerCase() === (mes || '').toLowerCase());
  if (idx === -1) return null;
  return Number(ano) * 100 + (idx + 1);
}

// Verifica se um relatório (com mes_referencia + ano) está dentro do intervalo
export function isRelatorioNoPeriodo(mesRef, anoRef, dataInicio, dataFim) {
  const val = mesAnoToNumero(mesRef, anoRef);
  if (!val) return true; // sem data, não filtra
  const inicio = mesAnoToNumero(dataInicio.mes, dataInicio.ano);
  const fim = mesAnoToNumero(dataFim.mes, dataFim.ano);
  if (!inicio || !fim) return true;
  return val >= inicio && val <= fim;
}

export default function useMetasPeriodoFiltro() {
  const [aditivo, setAditivo] = useState('ambos');
  const [dataInicio, setDataInicio] = useState({ mes: 'Fevereiro', ano: 2026 });
  const [dataFim, setDataFim] = useState({ mes: 'Dezembro', ano: 2028 });

  return {
    aditivo, setAditivo,
    dataInicio, setDataInicio,
    dataFim, setDataFim,
  };
}