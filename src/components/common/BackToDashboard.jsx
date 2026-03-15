import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard } from 'lucide-react';

/**
 * Botão reutilizável "Voltar para o Dashboard"
 * Use em qualquer página: <BackToDashboard />
 */
export default function BackToDashboard({ className = '' }) {
  return (
    <Link to={createPageUrl('Dashboard')}>
      <button
        className={`inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-black transition-colors group ${className}`}
      >
        <LayoutDashboard className="w-3.5 h-3.5 group-hover:text-black" />
        <span>Voltar ao Dashboard</span>
      </button>
    </Link>
  );
}