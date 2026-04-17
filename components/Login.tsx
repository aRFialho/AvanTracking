import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LOGO_URL } from "../constants";
import {
  ArrowLeft,
  ArrowRight,
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
type LoginModule = "avantracking" | "logisync";

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
  const [loginModule, setLoginModule] = useState<LoginModule>("avantracking");
  const [isModuleSwitching, setIsModuleSwitching] = useState(false);

  const isLogiSyncModule = loginModule === "logisync";
  const moduleLogoUrl = isLogiSyncModule ? "/logisync.png" : LOGO_URL;
  const loginButtonText = isLogiSyncModule
    ? "ACESSAR LOGISYNC"
    : "ACESSAR DASHBOARD";
  const switchButtonText = isLogiSyncModule
    ? "Voltar ao Avantracking"
    : "Entrar no LogiSync";

  const handleSwitchModule = () => {
    if (isModuleSwitching || authView !== "login") {
      return;
    }

    setIsModuleSwitching(true);
    window.setTimeout(() => {
      setLoginModule((current) =>
        current === "avantracking" ? "logisync" : "avantracking",
      );
    }, 250);
    window.setTimeout(() => {
      setIsModuleSwitching(false);
    }, 600);
  };

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
      title: isLogiSyncModule ? "LOGISYNC ACCESS" : "SYSTEM ACCESS",
      subtitle: isLogiSyncModule
        ? "Modulo de integracoes LogiSync"
        : "Avantracking Intelligence",
    };
  };

  const headerText = renderHeaderText();
  const pageBackgroundClass = isLogiSyncModule
    ? "bg-[radial-gradient(circle_at_top,#fff7ed_0%,#ffedd5_45%,#ffffff_100%)]"
    : "bg-[#0B0C15]";
  const cardClass = clsx(
    "rounded-2xl p-8 border transform transition-all duration-500 preserve-3d",
    isLogiSyncModule
      ? "bg-white border-orange-200 shadow-[0_24px_70px_rgba(249,115,22,0.25)] hover:translate-y-[-2px]"
      : "glass-card border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] hover:rotate-y-2",
  );
  const titleClass = isLogiSyncModule
    ? "mt-4 text-2xl font-tech font-bold text-orange-600 tracking-wider"
    : "mt-4 text-2xl font-tech font-bold text-white tracking-wider";
  const subtitleClass = isLogiSyncModule
    ? "text-orange-500 text-sm"
    : "text-slate-400 text-sm";
  const labelClass = isLogiSyncModule
    ? "text-xs font-semibold text-orange-700 uppercase tracking-widest ml-1"
    : "text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1";
  const inputClass = isLogiSyncModule
    ? "w-full bg-orange-50 border border-orange-200 text-slate-800 pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-orange-400 focus:shadow-[0_0_0_3px_rgba(251,146,60,0.2)] transition-all placeholder:text-orange-300"
    : "w-full bg-[#1A1D2D] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all placeholder:text-slate-600";
  const primaryButtonClass = isLogiSyncModule
    ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 shadow-orange-600/30"
    : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-600/30";
  const secondaryButtonClass = isLogiSyncModule
    ? "bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 shadow-orange-500/30"
    : "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-blue-600/30";
  const subtleLinkClass = isLogiSyncModule
    ? "text-sm text-orange-700 hover:text-orange-900 transition-colors"
    : "text-sm text-slate-400 hover:text-white transition-colors";
  const forgotLinkClass = isLogiSyncModule
    ? "text-sm text-orange-600 hover:text-orange-800 transition-colors"
    : "text-sm text-cyan-300 hover:text-white transition-colors";
  const footerClass = isLogiSyncModule
    ? "mt-8 pt-6 border-t border-orange-100 text-center"
    : "mt-8 pt-6 border-t border-white/5 text-center";
  const footerTextClass = isLogiSyncModule
    ? "text-xs text-orange-500"
    : "text-xs text-slate-500";

  return (
    <div
      className={clsx(
        "min-h-screen flex items-center justify-center p-4 relative overflow-hidden",
        pageBackgroundClass,
      )}
    >
      {!isLogiSyncModule && <LightningStorm />}

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div
          className={clsx(
            "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] animate-pulse-slow",
            isLogiSyncModule ? "bg-orange-300/45" : "bg-blue-600/20",
          )}
        ></div>
        <div
          className={clsx(
            "absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] animate-pulse-slow",
            isLogiSyncModule ? "bg-amber-300/50" : "bg-purple-600/20",
          )}
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className={clsx(
            "absolute inset-0 bg-[size:40px_40px]",
            isLogiSyncModule
              ? "bg-[linear-gradient(rgba(249,115,22,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.08)_1px,transparent_1px)]"
              : "bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]",
          )}
        ></div>
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="flex flex-col items-center justify-center gap-5 lg:flex-row lg:items-stretch">
          <div
            className={clsx(
              "w-full max-w-md perspective-1000",
              isModuleSwitching && "module-flow-swap",
            )}
          >
        <div className={cardClass}>
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="relative flex items-center justify-center w-32 h-32">
              <div
                className={clsx(
                  "absolute inset-2 rounded-full blur-3xl",
                  isLogiSyncModule ? "bg-orange-400/45" : "bg-cyan-400/35",
                )}
              ></div>
              <div
                className={clsx(
                  "absolute inset-0 rounded-full border",
                  isLogiSyncModule ? "border-orange-300/60" : "border-cyan-300/40",
                )}
              ></div>

              <img
                src={moduleLogoUrl}
                alt="Logo"
                className={clsx(
                  "h-16 relative z-10",
                  isLogiSyncModule
                    ? "drop-shadow-[0_0_30px_rgba(249,115,22,0.8)]"
                    : "drop-shadow-[0_0_40px_rgba(0,243,255,1)]",
                )}
              />
            </div>

            <h2 className={titleClass}>
              {headerText.title}
            </h2>
            <p className={subtitleClass}>{headerText.subtitle}</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
              <ShieldCheck className="w-4 h-4" /> {error}
            </div>
          )}

          {info && (
            <div
              className={clsx(
                "mb-5 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2 border",
                isLogiSyncModule
                  ? "bg-orange-50 border-orange-200 text-orange-700"
                  : "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
              )}
            >
              <ShieldCheck className="w-4 h-4" /> {info}
            </div>
          )}

          {authView === "login" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2 group">
                <label className={labelClass}>
                  Usuario
                </label>
                <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                  <Mail
                    className={clsx(
                      "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 transition-colors",
                      isLogiSyncModule
                        ? "group-hover:text-orange-500"
                        : "group-hover:text-neon-blue",
                    )}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="admin@avantracking.com.br"
                  />
                </div>
              </div>

              <div className="space-y-2 group">
                <label className={labelClass}>
                  Senha
                </label>
                <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                  <Lock
                    className={clsx(
                      "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 transition-colors",
                      isLogiSyncModule
                        ? "group-hover:text-orange-500"
                        : "group-hover:text-neon-purple",
                    )}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
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
                        ? isLogiSyncModule
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "bg-accent border-accent text-white"
                        : "bg-transparent border-slate-600 text-transparent hover:border-slate-500",
                    )}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={subtleLinkClass}
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
                  className={forgotLinkClass}
                >
                  Redefinicao de senha
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  "w-full text-white font-bold py-3 rounded-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group",
                  primaryButtonClass,
                  loading ? "opacity-70 cursor-wait" : "hover:scale-[1.02]",
                )}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {loginButtonText}
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {authView === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div className="space-y-2 group">
                <label className={labelClass}>
                  E-mail da conta
                </label>
                <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                  <Mail
                    className={clsx(
                      "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 transition-colors",
                      isLogiSyncModule
                        ? "group-hover:text-orange-500"
                        : "group-hover:text-neon-blue",
                    )}
                  />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={inputClass}
                    placeholder="voce@empresa.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  "w-full text-white font-bold py-3 rounded-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group",
                  secondaryButtonClass,
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
                className={clsx(
                  "w-full text-sm transition-colors flex items-center justify-center gap-2",
                  isLogiSyncModule
                    ? "text-orange-700 hover:text-orange-900"
                    : "text-slate-400 hover:text-white",
                )}
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </button>
            </form>
          )}

          {authView === "set-password" && (
            <div className="space-y-6">
              {tokenLoading ? (
                <div
                  className={clsx(
                    "py-8 flex flex-col items-center gap-3",
                    isLogiSyncModule ? "text-orange-700" : "text-slate-300",
                  )}
                >
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Validando link de acesso...</span>
                </div>
              ) : error && !accessTokenType ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className={clsx(
                      "w-full text-sm transition-colors flex items-center justify-center gap-2",
                      isLogiSyncModule
                        ? "text-orange-700 hover:text-orange-900"
                        : "text-slate-300 hover:text-white",
                    )}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSetPassword} className="space-y-6">
                  <div
                    className={clsx(
                      "rounded-xl px-4 py-3 text-sm border",
                      isLogiSyncModule
                        ? "border-orange-200 bg-orange-50 text-orange-700"
                        : "border-cyan-500/20 bg-cyan-500/5 text-slate-200",
                    )}
                  >
                    <p
                      className={clsx(
                        "font-semibold",
                        isLogiSyncModule ? "text-orange-600" : "text-cyan-300",
                      )}
                    >
                      {accessTokenType === "INVITE"
                        ? "Convite identificado"
                        : "Redefinicao de senha"}
                    </p>
                    <p
                      className={clsx(
                        "mt-1",
                        isLogiSyncModule ? "text-orange-700" : "text-slate-300",
                      )}
                    >
                      {tokenUserName || "Usuario"} {tokenUserEmail && `• ${tokenUserEmail}`}
                    </p>
                  </div>

                  <div className="space-y-2 group">
                    <label className={labelClass}>
                      Nova senha
                    </label>
                    <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                      <Lock
                        className={clsx(
                          "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 transition-colors",
                          isLogiSyncModule
                            ? "group-hover:text-orange-500"
                            : "group-hover:text-neon-purple",
                        )}
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Minimo de 8 caracteres"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2 group">
                    <label className={labelClass}>
                      Confirmar senha
                    </label>
                    <div className="relative transition-all duration-300 transform group-hover:translate-x-1">
                      <Lock
                        className={clsx(
                          "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 transition-colors",
                          isLogiSyncModule
                            ? "group-hover:text-orange-500"
                            : "group-hover:text-neon-purple",
                        )}
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Repita a senha"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={clsx(
                      "w-full text-white font-bold py-3 rounded-lg shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group",
                      primaryButtonClass,
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
                    className={clsx(
                      "w-full text-sm transition-colors flex items-center justify-center gap-2",
                      isLogiSyncModule
                        ? "text-orange-700 hover:text-orange-900"
                        : "text-slate-400 hover:text-white",
                    )}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao login
                  </button>
                </form>
              )}
            </div>
          )}

          <div className={footerClass}>
            <p className={footerTextClass}>
              Sistema protegido por criptografia de ponta a ponta.
            </p>
          </div>
        </div>
          </div>

          {authView === "login" && (
            <button
              type="button"
              onClick={handleSwitchModule}
              disabled={isModuleSwitching}
              className={clsx(
                "module-switch-pulse group relative flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border px-6 py-5 text-left transition-all duration-300 lg:w-[210px] lg:max-w-[210px] lg:flex-col lg:justify-center lg:text-center",
                isLogiSyncModule
                  ? "text-orange-700 border-orange-300 bg-gradient-to-br from-orange-100 via-amber-50 to-white shadow-[0_0_40px_rgba(249,115,22,0.25)] hover:border-orange-400"
                  : "text-white border-emerald-300/50 bg-gradient-to-br from-emerald-600/35 via-teal-500/20 to-slate-900/70 shadow-[0_0_40px_rgba(16,185,129,0.35)] hover:border-emerald-200/80",
                isModuleSwitching
                  ? "cursor-wait opacity-80"
                  : "hover:scale-[1.02] hover:translate-x-1",
              )}
            >
              <div className="flex flex-col">
                <span
                  className={clsx(
                    "text-[10px] font-semibold uppercase tracking-[0.2em]",
                    isLogiSyncModule ? "text-orange-500" : "text-white/70",
                  )}
                >
                  Trocar modulo
                </span>
                <span className="mt-1 text-base font-extrabold tracking-wide">
                  {switchButtonText}
                </span>
              </div>
              <div
                className={clsx(
                  "rounded-2xl p-3 backdrop-blur-sm transition-transform duration-300 group-hover:translate-x-1",
                  isLogiSyncModule ? "bg-orange-200/70" : "bg-white/15",
                )}
              >
                <ArrowRight
                  className={clsx(
                    "h-8 w-8 transition-transform duration-300",
                    isLogiSyncModule && "rotate-180",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
