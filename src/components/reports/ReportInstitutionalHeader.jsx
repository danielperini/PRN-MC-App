import React from 'react';

export default function ReportInstitutionalHeader({
  className = '',
  style = {},
}) {
  return (
    <header
      className={className}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '30px',
        paddingTop: '28px',
        paddingLeft: '42px',
        paddingRight: '42px',
        paddingBottom: '18px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#222222',
        backgroundColor: '#ffffff',
        ...style,
      }}
    >
      <img
        src="/viaduto-logo.png"
        alt="Viaduto das Artes"
        style={{
          width: '58px',
          height: '58px',
          objectFit: 'contain',
          display: 'block',
          flexShrink: 0,
        }}
      />

      <div
        style={{
          paddingTop: '7px',
          fontSize: '9px',
          lineHeight: 1.45,
          fontWeight: 500,
          color: '#242424',
          whiteSpace: 'normal',
        }}
      >
        <div>Viaduto das Artes – Fundado em 16 de junho de 2015</div>
        <div>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</div>
        <div>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</div>
      </div>
    </header>
  );
}
