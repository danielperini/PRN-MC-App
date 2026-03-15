import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackToDashboard({ className = '' }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-black transition-colors group ${className}`}
    >
      <ArrowLeft className="w-3.5 h-3.5 group-hover:text-black" />
      <span>Voltar</span>
    </button>
  );
}