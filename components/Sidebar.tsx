
import React, { useState, useEffect, useCallback } from 'react';
import { PageView } from '../types';
import { LOGO_URL } from '../constants';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, Package, UploadCloud, RefreshCw, 
  ChevronRight, BellRing, Shield, LogOut, Sun, Moon,
  Quote, RefreshCcw
} from 'lucide-react';
import { clsx } from 'clsx';
import { LightningStorm } from './LightningStorm';

interface SidebarProps {
  currentView: PageView;
  onChangeView: (view: PageView) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSync: Date | null;
}

// --- Content Data ---
const VERSES = [
  { text: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
  { text: "Entrega o teu caminho ao Senhor; confia nele, e ele o fará.", ref: "Salmos 37:5" },
  { text: "Mil cairão ao teu lado, e dez mil à tua direita, mas não chegará a ti.", ref: "Salmos 91:7" },
  { text: "O Senhor é o meu pastor, nada me faltará.", ref: "Salmos 23:1" },
  { text: "Esforçai-vos, e ele fortalecerá o vosso coração, vós todos que esperais no Senhor.", ref: "Salmos 31:24" },
  { text: "Porque sou eu que conheço os planos que tenho para vocês, diz o Senhor, planos de fazê-los prosperar.", ref: "Jeremias 29:11" },
  { text: "O temor do Senhor é o princípio da sabedoria.", ref: "Provérbios 9:10" }
];

const LOGISTICS_TIPS = [
  "Dica: Revise endereços com CEPs genéricos para evitar devoluções por 'endereço não encontrado'.",
  "Dica: Monitore de perto os pedidos 'Em Rota' no final do dia para garantir o sucesso da entrega.",
  "Dica: Mantenha o cliente informado proativamente. Isso reduz em 40% os chamados de suporte.",
  "Dica: Pedidos parados sem atualização há mais de 3 dias devem ter chamado aberto na transportadora.",
  "Dica: Analise o ranking de transportadoras mensalmente para renegociar contratos.",
  "Dica: Use a importação em massa para ganhar tempo no cadastro de novos pedidos.",
  "Dica: Verifique a cubagem das embalagens. Otimizar o tamanho reduz custos de frete significativamente.",
  "Dica: Em datas comemorativas, antecipe a operação de expedição em 2 horas."
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onSync, isSyncing }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  
  // State for content
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [verse, setVerse] = useState(VERSES[0]);
  const [animatingTip, setAnimatingTip] = useState(false);

  // Function to cycle tip
  const handleNextTip = useCallback(() => {
    setAnimatingTip(true);
    setTimeout(() => {
        setCurrentTipIndex(prev => (prev + 1) % LOGISTICS_TIPS.length);
        setAnimatingTip(false);
    }, 300);
  }, []);

  useEffect(() => {
    // Random Tip Start
    setCurrentTipIndex(Math.floor(Math.random() * LOGISTICS_TIPS.length));
    
    // Daily Verse (Day of month % array length)
    const dayIndex = new Date().getDate() % VERSES.length;
    setVerse(VERSES[dayIndex]);

    // Auto Refresh Tip every 5 minutes (300,000 ms)
    const tipInterval = setInterval(() => {
      handleNextTip();
    }, 300000);

    return () => clearInterval(tipInterval);
  }, [handleNextTip]);

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
    <aside className="w-64 bg-primary dark:bg-[#08090f] text-white flex flex-col shadow-xl z-20 hidden md:flex border-r border-slate-800 dark:border-white/5 transition-colors duration-300 relative">
      {/* Brand */}
      <div className="p-6 border-b border-slate-800 dark:border-white/5 relative overflow-hidden group shrink-0">
        <div className="absolute inset-0 z-0 opacity-60">
             <LightningStorm />
        </div>
        <img src={LOGO_URL} alt="AVANTRACKING Logo" className="w-full h-auto object-contain max-h-16 mb-2 relative z-10 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
        <p className="text-[10px] text-slate-500 text-center tracking-[0.2em] uppercase mt-2 font-tech relative z-10">Intelligence System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto overflow-x-hidden relative z-10 custom-scrollbar flex flex-col">
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

        {/* --- SPACER to push content down --- */}
        <div className="flex-1"></div>

        {/* --- SKATEBOARD ROBOT AREA --- */}
        <div className="mt-4 mx-1">
           {/* Street/Ramp Container UI */}
           <div className="relative h-24 bg-gradient-to-b from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black rounded-lg overflow-hidden border border-slate-700 dark:border-slate-800 shadow-inner group">
                
                {/* Graffiti/Street Art Background (Subtle) */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.4),transparent_60%)]"></div>
                <div className="absolute bottom-2 w-full h-0.5 bg-slate-500/30"></div>
                
                {/* Robot Character on Skateboard */}
                <div className="skate-container">
                    <svg viewBox="0 0 100 140" className="w-full h-full drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]">
                        <g className="skate-body-group">
                            {/* Head */}
                            <rect x="25" y="10" width="50" height="35" rx="10" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
                            {/* Antenna */}
                            <line x1="50" y1="10" x2="50" y2="0" stroke="#fff" strokeWidth="2" />
                            <circle cx="50" cy="0" r="3" fill="#ef4444" className="animate-pulse" />
                            {/* Eyes */}
                            <circle cx="40" cy="25" r="5" fill="#00f3ff" />
                            <circle cx="60" cy="25" r="5" fill="#00f3ff" />
                            {/* Torso with attitude */}
                            <rect x="25" y="50" width="50" height="40" rx="6" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                            {/* Arm (Back) */}
                            <rect x="10" y="55" width="15" height="10" rx="3" fill="#3b82f6" transform="rotate(-20 10 55)" />
                             {/* Arm (Front) */}
                             <rect x="75" y="55" width="15" height="10" rx="3" fill="#3b82f6" transform="rotate(20 75 55)" />

                            {/* Legs bent for skating */}
                            <rect x="30" y="90" width="12" height="15" fill="#1e293b" />
                            <rect x="58" y="90" width="12" height="15" fill="#1e293b" />
                            
                            {/* Skateboard Deck */}
                            <path d="M15 110 Q50 115 85 110 L90 112 Q50 120 10 112 Z" fill="#ec4899" stroke="#fff" strokeWidth="1" />
                            <rect x="30" y="110" width="40" height="3" fill="#000" opacity="0.5" /> {/* Grip tape */}

                            {/* Wheels */}
                            <circle cx="25" cy="118" r="6" fill="#facc15" stroke="#fff" strokeWidth="1" className="skate-wheel" />
                            <circle cx="75" cy="118" r="6" fill="#facc15" stroke="#fff" strokeWidth="1" className="skate-wheel" />
                        </g>
                    </svg>
                </div>

                {/* Speed lines effect */}
                <div className="absolute bottom-4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-pulse"></div>
           </div>

           {/* Speech Bubble */}
           <div className="relative mt-2 bg-blue-900/40 border border-blue-500/20 rounded-lg p-3 transition-all duration-300">
                {/* Arrow */}
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-900/40 border-t border-l border-blue-500/20 rotate-45"></div>
                
                <div className="flex items-start gap-2">
                    <p className={clsx("text-[10px] text-blue-200 leading-relaxed italic flex-1 transition-opacity duration-300", animatingTip ? "opacity-0" : "opacity-100")}>
                        "{LOGISTICS_TIPS[currentTipIndex]}"
                    </p>
                    <button 
                        onClick={handleNextTip}
                        className="text-blue-400 hover:text-white transition-colors p-1"
                        title="Nova Dica"
                    >
                        <RefreshCcw className={clsx("w-3 h-3", animatingTip && "animate-spin")} />
                    </button>
                </div>
           </div>
        </div>

      </nav>

      {/* Footer Controls */}
      <div className="p-4 border-t border-slate-800 dark:border-white/5 bg-slate-900/50 dark:bg-black/20 relative z-10 shrink-0">
        
        {/* --- DAILY VERSE --- */}
        <div className="mb-4 text-center group cursor-default">
            <div className="flex items-center justify-center gap-2 mb-1 opacity-50 group-hover:opacity-100 transition-opacity">
                <div className="h-[1px] w-4 bg-slate-600"></div>
                <Quote className="w-3 h-3 text-slate-500" />
                <div className="h-[1px] w-4 bg-slate-600"></div>
            </div>
            <p className="text-[10px] text-slate-400 italic font-serif leading-tight">"{verse.text}"</p>
            <p className="text-[9px] text-slate-600 font-bold mt-1 uppercase">{verse.ref}</p>
        </div>

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
