
import React from 'react';
import { PageView } from '../types';
import { LOGO_URL } from '../constants';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, Package, UploadCloud, RefreshCw, 
  ChevronRight, BellRing, Shield, LogOut, Sun, Moon 
} from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
  currentView: PageView;
  onChangeView: (view: PageView) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSync: Date | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onSync, isSyncing }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const NavItem = ({ view, icon: Icon, label }: { view: PageView; icon: any; label: string }) => (
    <button
      onClick={() => onChangeView(view)}
      className={clsx(
        "flex items-center w-full p-3 mb-2 rounded-lg transition-all duration-200 group relative overflow-hidden",
        currentView === view 
          ? "bg-accent/10 text-accent font-medium border-r-4 border-accent dark:bg-accent/20 dark:text-neon-blue dark:border-neon-blue" 
          : "text-slate-400 hover:bg-slate-800 dark:hover:bg-white/5 hover:text-white"
      )}
    >
      <div className={clsx("absolute inset-0 opacity-0 transition-opacity", currentView === view && "bg-gradient-to-r from-accent/0 to-accent/5 dark:to-neon-blue/10 opacity-100")}></div>
      <Icon className={clsx("w-5 h-5 mr-3 relative z-10", currentView === view ? "text-accent dark:text-neon-blue" : "text-slate-500 group-hover:text-white")} />
      <span className="relative z-10">{label}</span>
      {currentView === view && <ChevronRight className="w-4 h-4 ml-auto relative z-10" />}
    </button>
  );

  return (
    <aside className="w-64 bg-primary dark:bg-[#08090f] text-white flex flex-col shadow-xl z-20 hidden md:flex border-r border-slate-800 dark:border-white/5 transition-colors duration-300">
      {/* Brand */}
      <div className="p-6 border-b border-slate-800 dark:border-white/5 relative overflow-hidden">
        {/* Lightning Particle Effect */}
        <div className="lightning-container">
            <div className="lightning-bolt" style={{animationDelay: '0s'}}></div>
            <div className="lightning-bolt" style={{animationDelay: '1.5s'}}></div>
        </div>

        <img src={LOGO_URL} alt="AVANTRACKING Logo" className="w-full h-auto object-contain max-h-16 mb-2 relative z-10 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
        <p className="text-[10px] text-slate-500 text-center tracking-[0.2em] uppercase mt-2 font-tech relative z-10">Intelligence System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
        <NavItem view="alerts" icon={BellRing} label="Alertas de Risco" />
        <NavItem view="orders" icon={Package} label="Pedidos" />
        <NavItem view="upload" icon={UploadCloud} label="Importar CSV" />
        
        {user?.role === 'ADMIN' && (
          <>
            <div className="my-4 border-t border-slate-800 dark:border-white/10 mx-2"></div>
            <NavItem view="admin" icon={Shield} label="Administração" />
          </>
        )}
      </nav>

      {/* Footer Controls */}
      <div className="p-4 border-t border-slate-800 dark:border-white/5 bg-slate-900/50 dark:bg-black/20">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold">
                 {user?.name?.charAt(0)}
               </div>
               <div className="flex flex-col">
                 <span className="text-xs font-medium text-white">{user?.name}</span>
                 <span className="text-[10px] text-slate-400">{user?.role}</span>
               </div>
            </div>
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
        </div>

        <button
          onClick={onSync}
          disabled={isSyncing}
          className={clsx(
            "w-full flex items-center justify-center p-3 rounded-lg font-medium transition-all mb-2",
            isSyncing 
              ? "bg-slate-700 text-slate-400 cursor-not-allowed" 
              : "bg-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-900/50 dark:shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          )}
        >
          <RefreshCw className={clsx("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
          {isSyncing ? "Sync..." : "Sincronizar"}
        </button>

        <button 
           onClick={logout}
           className="w-full flex items-center justify-center p-2 text-xs text-slate-400 hover:text-red-400 transition-colors gap-2"
        >
           <LogOut className="w-3 h-3" /> Sair
        </button>
      </div>
    </aside>
  );
};
