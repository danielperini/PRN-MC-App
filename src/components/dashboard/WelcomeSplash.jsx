import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

function getSaudacao() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getPrimeiroNome(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(' ')[0];
}

function formatEquipe(teamMember) {
  if (!teamMember) return null;
  const partes = [teamMember.museu_vinculado, teamMember.tipo_equipe].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : null;
}

export default function WelcomeSplash({ userName, userEmail, onDone }) {
  const [phase, setPhase] = useState('in'); // 'in' | 'visible' | 'out' | 'done'
  const [equipe, setEquipe] = useState(null);

  // Busca TeamMember sem bloquear o splash
  useEffect(() => {
    if (!userEmail) return;
    base44.entities.TeamMember.filter({ user_email: userEmail })
      .then((results) => {
        if (results?.length > 0) {
          setEquipe(formatEquipe(results[0]));
        }
      })
      .catch(() => {});
  }, [userEmail]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 600);
    const t2 = setTimeout(() => setPhase('out'), 600 + 1800);
    const t3 = setTimeout(() => {
      setPhase('done');
      onDone?.();
    }, 600 + 1800 + 600);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (phase === 'done') return null;

  const opacity =
    phase === 'in' ? 'opacity-0' :
    phase === 'visible' ? 'opacity-100' :
    'opacity-0';

  const saudacao = getSaudacao();
  const nome = getPrimeiroNome(userName);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-[600ms] ${opacity}`}
    >
      <div className="text-center space-y-3 px-6">
        <p className="text-gray-400 text-lg font-light tracking-widest uppercase">
          {saudacao}{nome ? ',' : ''}
        </p>

        {nome && (
          <p className="text-white text-4xl md:text-5xl font-bold tracking-tight">
            {nome}!
          </p>
        )}

        {equipe && (
          <p className="text-gray-400 text-base font-light">
            {equipe}
          </p>
        )}

        <p className="text-gray-300 text-base md:text-lg font-light mt-2">
          Seja bem-vindo ao{' '}
          <span className="text-white font-semibold">Museus Centro App</span>
        </p>
      </div>

      <div className="absolute bottom-10 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse delay-150" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse delay-300" />
      </div>
    </div>
  );
}