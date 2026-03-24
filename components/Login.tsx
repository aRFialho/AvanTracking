import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LOGO_URL } from "../constants";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";
import { LightningStorm } from "./LightningStorm";

type AuthView = "login" | "forgot" | "set-password";
type AccessTokenType = "INVITE" | "RESET_PASSWORD" | null;

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenType, setAccessTokenType] = useState<AccessTokenType>(null);
  const [tokenUserName, setTokenUserName] = useState("");
  const [tokenUserEmail, setTokenUserEmail] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      return;
    }

    setAuthView("set-password");
    setAccessToken(token);
    setTokenLoading(true);
    setError("");

    fetch(`/api/users/access-link/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Link invalido ou expirado.");
        }

        setAccessTokenType(data.type || null);
        setTokenUserName(data.user?.name || "");
        setTokenUserEmail(data.user?.email || "");
      })
      .catch((err: Error) => {
        setError(err.message || "Nao foi possivel validar o link.");
      })
      .finally(() => {
        setTokenLoading(false);
      });
  }, []);

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const clearAccessLinkState = () => {
    setAccessToken("");
    setAccessTokenType(null);
    setTokenUserName("");
    setTokenUserEmail("");
    setNewPassword("");
    setConfirmPassword("");
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const goToLogin = () => {
    clearAccessLinkState();
    resetMessages();
    setAuthView("login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const success = await login(email, password, rememberMe);
    if (!success) {
      setError("Credenciais invalidas. Tente novamente.");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/users/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel solicitar a redefinicao de senha.",
        );
      }

      setInfo(
        data.message ||
          "Se existir uma conta com este e-mail, enviaremos as instrucoes.",
      );
    } catch (err: any) {
      setError(err.message || "Erro ao solicitar redefinicao de senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (newPassword.length < 8) {
      setLoading(false);
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setLoading(false);
      setError("A confirmacao da senha nao confere.");
      return;
    }

    try {
      const response = await fetch("/api/users/access-link/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: accessToken,
          password: newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel definir a senha.");
      }

      setEmail(tokenUserEmail || email);
      setPassword("");
      clearAccessLinkState();
      setAuthView("login");
      setError("");
      setInfo(data.message || "Senha definida com sucesso. Voce ja pode entrar.");
    } catch (err: any) {
      setError(err.message || "Erro ao concluir definicao de senha.");
    } finally {
      setLoading(false);
    }
  };

  const renderHeaderText = () => {
    if (authView === "forgot") {
      return {
        title: "REDEFINICAO",
        subtitle: "Solicite um novo link de acesso",
      };
    }

    if (authView === "set-password") {
      return {
        title:
          accessTokenType === "INVITE" ? "CADASTRE A SENHA" : "NOVA SENHA",
        subtitle:
          accessTokenType === "INVITE"
            ? "Finalize seu convite para acessar a plataforma"
            : "Defina uma nova senha para sua conta",
      };
    }

    return {
      title: "SYSTEM ACCESS",
      subtitle: "Avantracking Intelligence",
    };
  };

  const headerText = renderHeaderText();

  return (
    <div className="min-h-screen bg-[#0B0C15] flex items-center justify-center p-4 relative overflow-hidden">
      <LightningStorm />

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        ></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md perspective-1000">
        <div className="glass-card rounded-2xl p-8 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-500 hover:rotate-y-2 preserve-3d">
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="relative flex items-center justify-center w-32 h-32">
              <div className="logo-energy">
                <div className="energy-core"></div>
                <div className="energy-ring"></div>
              </div>

              <img
                src={LOGO_URL}
                alt="Logo"
                className="h-16 relative z-10 drop-shadow-[0_0_40px_rgba(0,243,255,1)]"
              />
            </div>

            <h2 className="mt-4 text-2xl font-tech font-bold text-white tracking-wider">
              {headerText.title}
            </h2>
            <p className="text-slate-400 text-sm">{headerText.subtitle}</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
              <ShieldCheck className="w-4 h-4" /> {error}
            </div>
          )}

          {info && (
            <div className="mb-5 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
              <ShieldCheck className="w-4 h-4" /> {info}
            </div>
          )}

          {authView === "login" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2 group">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                  Usuario
                </label>
                <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-blue transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all placeholder:text-slate-600"
                    placeholder="admin@avantracking.com.br"
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

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={clsx(
                      "w-5 h-5 rounded border flex items-center justify-center transition-all",
                      rememberMe
                        ? "bg-accent border-accent text-white"
                        : "bg-transparent border-slate-600 text-transparent hover:border-slate-500",
                    )}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Lembrar login
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setResetEmail(email);
                    setAuthView("forgot");
                  }}
                  className="text-sm text-cyan-300 hover:text-white transition-colors"
                >
                  Redefinicao de senha
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  "w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-300 flex items-center justify-center gap-2 group",
                  loading ? "opacity-70 cursor-wait" : "hover:scale-[1.02]",
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
          )}

          {authView === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div className="space-y-2 group">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                  E-mail da conta
                </label>
                <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-blue transition-colors" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all placeholder:text-slate-600"
                    placeholder="voce@empresa.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  "w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-300 flex items-center justify-center gap-2 group",
                  loading ? "opacity-70 cursor-wait" : "hover:scale-[1.02]",
                )}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    ENVIAR LINK
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={goToLogin}
                className="w-full text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </button>
            </form>
          )}

          {authView === "set-password" && (
            <div className="space-y-6">
              {tokenLoading ? (
                <div className="py-8 flex flex-col items-center gap-3 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Validando link de acesso...</span>
                </div>
              ) : error && !accessTokenType ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="w-full text-sm text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSetPassword} className="space-y-6">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-200">
                    <p className="font-semibold text-cyan-300">
                      {accessTokenType === "INVITE"
                        ? "Convite identificado"
                        : "Redefinicao de senha"}
                    </p>
                    <p className="mt-1 text-slate-300">
                      {tokenUserName || "Usuario"} {tokenUserEmail && `• ${tokenUserEmail}`}
                    </p>
                  </div>

                  <div className="space-y-2 group">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                      Nova senha
                    </label>
                    <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-purple transition-colors" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-purple focus:shadow-[0_0_15px_rgba(188,19,254,0.2)] transition-all placeholder:text-slate-600"
                        placeholder="Minimo de 8 caracteres"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2 group">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
                      Confirmar senha
                    </label>
                    <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-neon-purple transition-colors" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-purple focus:shadow-[0_0_15px_rgba(188,19,254,0.2)] transition-all placeholder:text-slate-600"
                        placeholder="Repita a senha"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={clsx(
                      "w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-300 flex items-center justify-center gap-2 group",
                      loading ? "opacity-70 cursor-wait" : "hover:scale-[1.02]",
                    )}
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        SALVAR NOVA SENHA
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={goToLogin}
                    className="w-full text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                  </button>
                </form>
              )}
            </div>
          )}

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
