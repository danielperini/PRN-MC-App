import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '@/components/auth/RequireAuth';
import MobileApprovalFlow from '@/components/mobile/MobileApprovalFlow';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { FileText, ShoppingCart } from 'lucide-react';

function ApprovalsInner() {
  const { user } = useCurrentUser();
  const [selectedTab, setSelectedTab] = useState('reports');

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Tabs */}
      <div className="hidden md:block sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          <button
            onClick={() => setSelectedTab('reports')}
            className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === 'reports'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Relatórios Pendentes
          </button>
          <button
            onClick={() => setSelectedTab('purchases')}
            className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === 'purchases'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4 inline mr-2" />
            Compras Pendentes
          </button>
        </div>
      </div>

      {selectedTab === 'reports' ? (
        <MobileApprovalFlow type="report" />
      ) : (
        <MobileApprovalFlow type="purchase" />
      )}

      {/* Mobile Tab Switcher */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex gap-0">
        <button
          onClick={() => setSelectedTab('reports')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            selectedTab === 'reports'
              ? 'text-indigo-600 border-t-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Relatórios
        </button>
        <button
          onClick={() => setSelectedTab('purchases')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            selectedTab === 'purchases'
              ? 'text-indigo-600 border-t-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Compras
        </button>
      </div>
    </div>
  );
}

export default function ApprovalsMobile() {
  return <RequireAuth requireRole="COORDENADOR"><ApprovalsInner /></RequireAuth>;
}