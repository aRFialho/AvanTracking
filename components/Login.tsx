import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LOGO_URL } from '../constants';
import { Lock, Mail, ChevronRight, Loader2, ShieldCheck, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { LightningStorm } from './LightningStorm';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const success = await login(email, password, rememberMe);
    if (!success) {
      setError('Credenciais inválidas. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] flex items-center justify-center p-4 relative overflow-hidden">
      
      <LightningStorm />

      <div className="lightning-storm"></div>

      {/* Background Atmosphere */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md perspective-1000">
        <div className="glass-card rounded-2xl p-8 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-500 hover:rotate-y-2 preserve-3d">
          
          {/* Logo + Neon Energy */}
          <div className="text-center mb-8 flex flex-col items-center">

            <div className="relative flex items-center justify-center w-32 h-32">

              <div className="logo-energy">
                <div className="energy-core"></div>
                <div className="energy-ring"></div>
                <div className="energy-lightning"></div>
              </div>

              <img
                src={LOGO_URL}
                alt="Logo"
                className="h-16 relative z-10 drop-shadow-[0_0_40px_rgba(0,243,255,1)]"
              />

            </div>

            <h2 className="mt-4 text-2xl font-tech font-bold text-white tracking-wider">
              SYSTEM ACCESS
            </h2>
            <p className="text-slate-400 text-sm">
              Autrack Intelligence
            </p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                Usuário
              </label>
              <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-blue transition-colors" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all placeholder:text-slate-600"
                  placeholder="admin@autrack.com.br"
                />
              </div>
            </div>

            <div className="space-y-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                Senha
              </label>
              <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-purple transition-colors" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-purple focus:shadow-[0_0_15px_rgba(188,19,254,0.2)] transition-all placeholder:text-slate-600"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className={clsx(
                  "w-5 h-5 rounded border flex items-center justify-center transition-all",
                  rememberMe 
                    ? "bg-accent border-accent text-white" 
                    : "bg-transparent border-slate-600 text-transparent hover:border-slate-500"
                )}
              >
                <Check className="w-3 h-3" strokeWidth={3} />
              </button>

              <button 
                type="button" 
                onClick={() => setRememberMe(!rememberMe)}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Lembrar Login
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                <ShieldCheck className="w-4 h-4" /> {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className={clsx(
                "w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-300 flex items-center justify-center gap-2 group",
                loading ? "opacity-70 cursor-wait" : "hover:scale-[1.02]"
              )}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  ACESSAR DASHBOARD 
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-slate-500">
              Sistema protegido por criptografia de ponta a ponta.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
