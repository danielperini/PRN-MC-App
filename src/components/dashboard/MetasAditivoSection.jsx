import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, Target, X, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'museus_centro_metas_rubricas_override_v1';

const COMMUNICATION_CURVE = [
  { mes: 'Mai/26', esperado: 20 },
  { mes: 'Jun/26', esperado: 32 },
  { mes: 'Jul/26', esperado: 44 },
  { mes: 'Ago/26', esperado: 58 },
  { mes: 'Set/26', esperado: 72 },
  { mes: 'Out/26', esperado: 86 },
  { mes: 'Nov/26', esperado: 100 },
];

const BASE_METAS_ADITIVO = [
  { numero: 'META 01', titulo: 'Equipe principal', percentual: 100, detalhe: 'Cargos previstos e cargos ocupados na equipe', indicador: '100% concluído · contagem de cargos ativa', status: 'CONCLUÍDA', editableRubricas: false },
  { numero: 'META 02', titulo: 'Plano de comunicação', percentual: 20, detalhe: 'Indicador composto: releases 70%, posts 20% e fotos válidas 10%', indicador: '20% concluído · média operacional dos últimos 3 meses', status: 'EM EXECUÇÃO', editableRubricas: false, curva: COMMUNICATION_CURVE, subindicadores: [{ label: 'Releases', peso: '70%' }, { label: 'Posts', peso: '20%' }, { label: 'Fotos válidas', peso: '10%' }] },
  { numero: 'META 03', titulo: 'Manutenção das exposições', percentual: 0, detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', percentual: 0, detalhe: 'Rubricas de núcleos, salas expositivas, montagem, expografia e ambientação', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 05', titulo: 'Atividades Educativas e Culturais', percentual: 0, detalhe: 'Atividades únicas da Programação/Agenda, filtradas mensalmente desde março/2026', indicador: '0/30 atividades da programação validadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA', editableRubricas: false }
];