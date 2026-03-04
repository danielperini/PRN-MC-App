import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
import AssistantChat from '@/components/chat/AssistantChat';
import MobileBottomTab from '@/components/mobile/MobileBottomTab';

export default function Layout({ children, currentPageName }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        setCurrentUser(user);
      }
    };
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar 
          currentPageName={currentPageName} 
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main Content */}
      <div className={`hidden md:flex md:flex-col ${sidebarCollapsed ? 'ml-20' : 'ml-64'} min-h-screen transition-all duration-300`}>
        {/* Top Nav */}
        <TopNav
          userEmail={currentUser?.email}
          userName={currentUser?.full_name}
          userRole={currentUser?.role}
        />

        {/* Content */}
          <main className="flex-1 overflow-auto bg-white px-4 md:px-6">
            {children}
          </main>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col min-h-screen">
        <main className="flex-1 overflow-auto bg-white pb-16 animate-slide-in">
          {children}
        </main>
        <MobileBottomTab currentPageName={currentPageName} />
      </div>

      {/* Assistant Chat */}
      <AssistantChat />
    </div>
  );
}