import React, { useState, useRef, useEffect } from 'react';
import { useHelp } from '@/components/help/HelpContextProvider';
import { cn } from '@/lib/utils';

export function ContextualTooltip({ 
  componentKey, 
  label, 
  componentType = 'other',
  contextDescription,
  children,
  className 
}) {
  const { getHelpText, isHelpEnabled } = useHelp();
  const [helpText, setHelpText] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, side: 'bottom' });
  
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);

  const handleMouseEnter = async () => {
    if (!isHelpEnabled || !componentKey) return;

    timerRef.current = setTimeout(async () => {
      const text = await getHelpText(componentKey, label, componentType, contextDescription);
      if (text) {
        setHelpText(text);
        setIsVisible(true);
        calculatePosition();
      }
    }, 3000);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
  };

  const calculatePosition = () => {
    if (!containerRef.current || !tooltipRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    let top = containerRect.bottom + 8;
    let left = containerRect.left + (containerRect.width - tooltipRect.width) / 2;
    let side = 'bottom';

    // Ajustar se sair da tela
    if (left < 8) {
      left = 8;
    } else if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }

    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = containerRect.top - tooltipRect.height - 8;
      side = 'top';
    }

    setPosition({ top, left, side });
  };

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener('resize', calculatePosition);
      return () => window.removeEventListener('resize', calculatePosition);
    }
  }, [isVisible]);

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
        role="tooltip"
        aria-describedby={isVisible ? `help-${componentKey}` : undefined}
      >
        {children}
      </div>

      {isVisible && helpText && (
        <div
          ref={tooltipRef}
          id={`help-${componentKey}`}
          className={cn(
            'fixed z-50 max-w-sm px-4 py-3 rounded-lg shadow-lg border animate-in fade-in-0 zoom-in-95 duration-200',
            'bg-white border-slate-200 text-slate-900',
            'pointer-events-none'
          )}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <p className="text-sm leading-relaxed">
            {helpText}
          </p>
          <div className={cn(
            'absolute w-2 h-2 bg-white border border-slate-200 rotate-45',
            position.side === 'bottom' 
              ? 'top-[-5px] left-1/2 -translate-x-1/2'
              : 'bottom-[-5px] left-1/2 -translate-x-1/2'
          )} />
        </div>
      )}
    </>
  );
}