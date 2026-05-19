import React from 'react';

export default function PremiumInternalPageHeader({ className = '' }) {
  return (
    <div className={`premium-internal-page-header ${className}`.trim()}>
      <div className="premium-internal-page-header-logo">
        <img src="/viaduto-logo.png" alt="Viaduto das Artes" />
      </div>
      <div className="premium-internal-page-header-text">
        <strong>Viaduto das Artes – Fundado em 16 de junho de 2015</strong>
        <span>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</span>
        <span>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</span>
      </div>
    </div>
  );
}
