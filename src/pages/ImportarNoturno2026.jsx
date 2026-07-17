import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImportarRelatorioNoturno from '@/components/entrada/ImportarRelatorioNoturno';

export default function ImportarNoturno2026() {
  const navigate = useNavigate();
  const [abrir, setAbrir] = useState(true);

  if (!abrir) return null;

  return (
    <ImportarRelatorioNoturno
      onClose={() => navigate(-1)}
      onConcluido={() => navigate('/Relatorios')}
    />
  );
}