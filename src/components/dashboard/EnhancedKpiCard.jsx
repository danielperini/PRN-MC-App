import React, { useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EnhancedKpiCard({ label, value, icon: Icon, highlight, options, onFilter }) {
  const [showFilter, setShowFilter] = useState(false);

  return (
    <div className={`p-5 border rounded-xl transition-all ${highlight ? 'border-black bg-black text-white shadow-lg' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${highlight ? 'text-white' : 'text-gray-400'}`} />
          <span className={`text-xs font-medium ${highlight ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
        </div>
        {options && (
          <div className="relative">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 w-6 p-0 hover:bg-gray-100"
              onClick={() => setShowFilter(!showFilter)}
            >
              <Filter className="w-3 h-3" />
            </Button>
            {showFilter && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-40">
                {options.map(opt => (
                  <button
                    key={opt.id}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b last:border-b-0"
                    onClick={() => {
                      onFilter?.(opt.id);
                      setShowFilter(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className={`text-3xl font-bold leading-tight`}>{value}</p>
    </div>
  );
}