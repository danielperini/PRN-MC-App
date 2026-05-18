import React from 'react';

const HEADER_TEXT = {
  line1: 'Viaduto das Artes – Fundado em 16 de junho de 2015',
  line2: 'Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG',
  line3: 'CEP 30640-010 – E-mail: viadutodasartes@gmail.com',
};

function ViadutoLogoFallback() {
  return (
    <div
      style={{
        width: 58,
        height: 58,
        backgroundColor: '#1f1f1f',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
      aria-label="Viaduto das Artes"
    >
      <div
        style={{
          lineHeight: '0.82',
          fontWeight: 900,
          fontSize: 19,
          letterSpacing: '-1px',
          textAlign: 'left',
          marginRight: 9,
        }}
      >
        <div>VIA</div>
        <div>DU</div>
        <div>TO</div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 4,
          top: 8,
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.5px',
          lineHeight: 1,
        }}
      >
        DAS ARTES
      </div>
    </div>
  );
}

export default function ReportInstitutionalHeader({
  logoSrc = '',
  className = '',
  style = {},
  logoAlt = 'Viaduto das Artes',
}) {
  return (
    <header
      className={className}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 32,
        paddingTop: 28,
        paddingLeft: 42,
        paddingRight: 42,
        paddingBottom: 18,
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#222222',
        backgroundColor: '#ffffff',
        ...style,
      }}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={logoAlt}
          style={{
            width: 58,
            height: 58,
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
      ) : (
        <ViadutoLogoFallback />
      )}

      <div
        style={{
          paddingTop: 7,
          fontSize: 9,
          lineHeight: 1.45,
          fontWeight: 500,
          color: '#242424',
          whiteSpace: 'normal',
        }}
      >
        <div>{HEADER_TEXT.line1}</div>
        <div>{HEADER_TEXT.line2}</div>
        <div>{HEADER_TEXT.line3}</div>
      </div>
    </header>
  );
}
