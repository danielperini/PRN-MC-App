import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { 
  Building2, 
  FileText, 
  Users, 
  LogOut,
  Menu,
  X,
  History,
  Eye,
  Paperclip,
  Settings,
  UserCircle
} from 'lucide-react';
import PlanoTrabalhoChat from './components/reports/PlanoTrabalhoChat';
import { Button } from '@/components/ui/button';

export default function Layout({ children, currentPageName }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

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

  const isCoordenador = ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const navItems = [
    { name: 'Dashboard', icon: FileText, label: 'Dashboard', show: true },
    { name: 'Relatorios', icon: FileText, label: 'Relatórios', show: true },
    { name: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', show: true },
    { name: 'CoordReview', icon: Eye, label: 'Revisão', show: isCoordenador },
    { name: 'UserManagement', icon: Users, label: 'Usuários', show: isCoordenador },
    { name: 'PlataformaAdmin', icon: Settings, label: 'Plataforma', show: isCoordenador },
    { name: 'AuditLog', icon: History, label: 'Auditoria', show: isCoordenador },
  ].filter(item => item.show);

  if (currentPageName === 'Home') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Nav */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white z-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
              <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-black hidden sm:block">
                Museus Centro
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = currentPageName === item.name;
                return (
                  <Link key={item.name} to={createPageUrl(item.name)}>
                    <Button 
                      variant="ghost" 
                      className={`gap-2 ${isActive ? 'bg-gray-100' : ''}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              {currentUser && (
                <Link to={createPageUrl('Perfil')} className="hidden sm:block text-right hover:opacity-70 transition-opacity">
                  <p className="text-sm font-medium text-black">
                    {currentUser.full_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {currentUser.role}
                  </p>
                </Link>
              )}
              <Link to={createPageUrl('Perfil')}>
                <Button variant="ghost" size="icon" className="text-gray-500">
                  <UserCircle className="w-4 h-4" />
                </Button>
              </Link>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => base44.auth.logout()}
                className="text-gray-500"
              >
                <LogOut className="w-4 h-4" />
              </Button>
              
              {/* Mobile Menu Button */}
              <Button 
                variant="ghost" 
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 py-2 px-6">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPageName === item.name;
              return (
                <Link 
                  key={item.name} 
                  to={createPageUrl(item.name)}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button 
                    variant="ghost" 
                    className={`w-full justify-start gap-2 ${isActive ? 'bg-gray-100' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Content */}
      <main>
        {children}
      </main>
    </div>
  );
}