import React, { useEffect, useMemo, useState } from "react";
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

type AuthView = "login" | "forgot" | "set-password";
type AccessTokenType = "INVITE" | "RESET_PASSWORD" | null;
type LoginModule = "avantracking" | "logisync";
type ExperienceStage = "intro" | "profiles" | "entering" | "form";

const MODULES: Array<{
  id: LoginModule;
  name: string;
  subtitle: string;
  logo: string;
}> = [
  {
    id: "avantracking",
    name: "Avantracking",
    subtitle: "Rastreio inteligente e visao operacional",
    logo: LOGO_URL,
  },
  {
    id: "logisync",
    name: "Logisync",
    subtitle: "Conciliacao automatizada de frete",
    logo: "/logisync.png",
  },
];

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [experienceStage, setExperienceStage] = useState<ExperienceStage>("intro");
  const [selectedModule, setSelectedModule] = useState<LoginModule>("avantracking");
  const [entryModule, setEntryModule] = useState<LoginModule>("avantracking");

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

  const isLogiSyncModule = selectedModule === "logisync";
  const moduleLogoUrl = isLogiSyncModule ? "/logisync.png" : LOGO_URL;
  const moduleLabel = isLogiSyncModule ? "Logisync" : "Avantracking";
  const loginButtonText = isLogiSyncModule
    ? "ENTRAR NO LOGISYNC"
    : "ENTRAR NO AVANTRACKING";

  useEffect(() => {
    if (authView !== "login" || experienceStage !== "intro") {
      return;
    }

    const introTimer = window.setTimeout(() => {
      setExperienceStage("profiles");
    }, 1900);

    return () => window.clearTimeout(introTimer);
  }, [authView, experienceStage]);

  useEffect(() => {
    if (experienceStage !== "entering") {
      return;
    }

    const enteringTimer = window.setTimeout(() => {
      setExperienceStage("form");
    }, 920);

    return () => window.clearTimeout(enteringTimer);
  }, [experienceStage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      return;
    }

    setAuthView("set-password");
    setExperienceStage("form");
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

  const currentTheme = useMemo(
    () =>
      isLogiSyncModule
        ? {
            surface:
              "border-white/15 bg-[linear-gradient(150deg,rgba(6,18,34,0.94),rgba(11,31,47,0.86))] shadow-[0_32px_110px_rgba(3,16,31,0.55)]",
            badge: "border-cyan-300/35 bg-cyan-400/10 text-cyan-200",
            title: "text-cyan-100",
            subtitle: "text-slate-300",
            label: "text-cyan-100/80",
            input:
              "border-cyan-300/20 bg-slate-950/35 text-white placeholder:text-slate-500 focus:border-cyan-300 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.2)]",
            button:
              "bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 shadow-cyan-800/40",
            secondaryButton:
              "bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 shadow-cyan-900/40",
            subtleLink: "text-cyan-100/80 hover:text-cyan-100",
            forgotLink: "text-cyan-300 hover:text-cyan-100",
            infoBox: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
            bgGlowTop: "bg-cyan-500/40",
            bgGlowBottom: "bg-sky-500/40",
          }
        : {
            surface:
              "border-white/10 bg-[linear-gradient(150deg,rgba(17,17,17,0.95),rgba(8,8,8,0.9))] shadow-[0_34px_110px_rgba(0,0,0,0.6)]",
            badge: "border-[#f05a3d]/40 bg-[#f05a3d]/10 text-[#ffcabd]",
            title: "text-white",
            subtitle: "text-slate-300",
            label: "text-[#ffcabd]/85",
            input:
              "border-white/10 bg-black/45 text-white placeholder:text-slate-500 focus:border-[#f05a3d] focus:shadow-[0_0_0_3px_rgba(240,90,61,0.22)]",
            button:
              "bg-gradient-to-r from-[#f05a3d] to-[#fb923c] hover:from-[#ff6a4f] hover:to-[#ffa24b] shadow-[#f05a3d]/35",
            secondaryButton:
              "bg-gradient-to-r from-[#f05a3d] to-[#dc2626] hover:from-[#ff6a4f] hover:to-[#ef4444] shadow-[#f05a3d]/30",
            subtleLink: "text-[#ffcabd]/85 hover:text-[#ffd8cd]",
            forgotLink: "text-[#ff9a85] hover:text-[#ffc6b9]",
            infoBox: "border-[#f05a3d]/35 bg-[#f05a3d]/10 text-[#ffd9d0]",
            bgGlowTop: "bg-[#f05a3d]/35",
            bgGlowBottom: "bg-rose-500/35",
          },
    [isLogiSyncModule],
  );

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
    setExperienceStage("form");
  };

  const handleSelectModule = (module: LoginModule) => {
    if (authView !== "login") {
      return;
    }

    setSelectedModule(module);
    setEntryModule(module);
    setError("");
    setInfo("");
    setExperienceStage("entering");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const success = await login(email, password, rememberMe, selectedModule);
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
      setExperienceStage("form");
      setError("");
      setInfo(data.message || "Senha definida com sucesso. Voce ja pode entrar.");
    } catch (err: any) {
      setError(err.message || "Erro ao concluir definicao de senha.");
    } finally {
      setLoading(false);
    }
  };

  const headerText = useMemo(() => {
    if (authView === "forgot") {
      return {
        title: "Redefinicao de senha",
        subtitle: "Solicite um novo link para acessar sua conta",
      };
    }

    if (authView === "set-password") {
      return {
        title: accessTokenType === "INVITE" ? "Cadastre sua senha" : "Nova senha",
        subtitle:
          accessTokenType === "INVITE"
            ? "Finalize seu convite para entrar na plataforma"
            : "Defina uma nova senha para continuar",
      };
    }

    return {
      title: isLogiSyncModule ? "Acesso Logisync" : "Acesso Avantracking",
      subtitle: "Painel seguro com autentificacao criptografada",
    };
  }, [accessTokenType, authView, isLogiSyncModule]);

  const renderAuthForm = () => {
    const labelClass = clsx(
      "ml-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
      currentTheme.label,
    );
    const inputClass = clsx(
      "w-full rounded-xl border pl-10 pr-4 py-3 text-sm transition-all duration-300 focus:outline-none",
      currentTheme.input,
    );

    if (authView === "login") {
      return (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className={labelClass}>Usuario</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="admin@empresa.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="********"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setRememberMe((current) => !current)}
              className={clsx(
                "inline-flex items-center gap-2 text-sm transition-colors",
                currentTheme.subtleLink,
              )}
            >
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                  rememberMe
                    ? isLogiSyncModule
                      ? "border-cyan-300 bg-cyan-400/20 text-cyan-200"
                      : "border-[#f05a3d] bg-[#f05a3d]/20 text-[#ffd9d0]"
                    : "border-white/30 text-transparent",
                )}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              Lembrar login
            </button>

            {isLogiSyncModule ? (
              <span className={clsx("text-xs", currentTheme.subtleLink)}>
                Redefinicao pelo admin super
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setResetEmail(email);
                  setAuthView("forgot");
                }}
                className={clsx("text-sm transition-colors", currentTheme.forgotLink)}
              >
                Redefinir senha
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={clsx(
              "group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-xl transition-all duration-300",
              currentTheme.button,
              loading ? "cursor-wait opacity-75" : "hover:scale-[1.01]",
            )}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                {loginButtonText}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setExperienceStage("profiles");
              setAuthView("login");
              resetMessages();
            }}
            className={clsx("w-full text-xs transition-colors", currentTheme.subtleLink)}
          >
            Trocar modulo
          </button>
        </form>
      );
    }

    if (authView === "forgot") {
      return (
        <form onSubmit={handleForgotPassword} className="space-y-5">
          <div className="space-y-2">
            <label className={labelClass}>E-mail da conta</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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
              "group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-xl transition-all duration-300",
              currentTheme.secondaryButton,
              loading ? "cursor-wait opacity-75" : "hover:scale-[1.01]",
            )}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                ENVIAR LINK
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={goToLogin}
            className={clsx(
              "inline-flex w-full items-center justify-center gap-2 text-sm transition-colors",
              currentTheme.subtleLink,
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </button>
        </form>
      );
    }

    return (
      <div className="space-y-5">
        {tokenLoading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-slate-200">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Validando link de acesso...</span>
          </div>
        ) : error && !accessTokenType ? (
          <button
            type="button"
            onClick={goToLogin}
            className={clsx(
              "inline-flex w-full items-center justify-center gap-2 text-sm transition-colors",
              currentTheme.subtleLink,
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </button>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-5">
            <div className={clsx("rounded-xl border px-4 py-3 text-sm", currentTheme.infoBox)}>
              <p className="font-semibold">
                {accessTokenType === "INVITE"
                  ? "Convite identificado"
                  : "Redefinicao de senha"}
              </p>
              <p className="mt-1">
                {tokenUserName || "Usuario"}
                {tokenUserEmail ? ` | ${tokenUserEmail}` : ""}
              </p>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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

            <div className="space-y-2">
              <label className={labelClass}>Confirmar senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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
                "group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-xl transition-all duration-300",
                currentTheme.button,
                loading ? "cursor-wait opacity-75" : "hover:scale-[1.01]",
              )}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  SALVAR NOVA SENHA
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={goToLogin}
              className={clsx(
                "inline-flex w-full items-center justify-center gap-2 text-sm transition-colors",
                currentTheme.subtleLink,
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07090f]">
      <div className="login-grid-overlay absolute inset-0" />
      <div
        className={clsx(
          "absolute -left-24 -top-28 h-80 w-80 rounded-full blur-[120px]",
          currentTheme.bgGlowTop,
        )}
      />
      <div
        className={clsx(
          "absolute -bottom-28 -right-24 h-80 w-80 rounded-full blur-[120px]",
          currentTheme.bgGlowBottom,
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />

      {authView === "login" && experienceStage === "intro" && (
        <div className="login-stage-overlay">
          <div className="login-intro-mark">
            <img src={LOGO_URL} alt="Avantracking" className="login-intro-logo h-24 w-auto" />
          </div>
        </div>
      )}

      {authView === "login" && experienceStage === "entering" && (
        <div className="login-stage-overlay">
          <div className="login-entry-mark">
            <div className="login-entry-glow" />
            <img
              src={entryModule === "logisync" ? "/logisync.png" : LOGO_URL}
              alt={entryModule}
              className="login-entry-logo h-20 w-auto"
            />
          </div>
        </div>
      )}

      {authView === "login" && experienceStage === "profiles" && (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-4xl text-center">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Escolha o modulo
            </p>
            <h1 className="mb-10 text-3xl font-tech font-bold text-white md:text-4xl">
              Quem esta entrando?
            </h1>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {MODULES.map((module, index) => {
                const isLogiSync = module.id === "logisync";
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => handleSelectModule(module.id)}
                    className={clsx(
                      "login-profile-card group",
                      isLogiSync
                        ? "border-cyan-300/30 hover:border-cyan-300/80 hover:shadow-[0_24px_60px_rgba(34,211,238,0.2)]"
                        : "border-[#f05a3d]/30 hover:border-[#f05a3d]/80 hover:shadow-[0_24px_60px_rgba(240,90,61,0.22)]",
                    )}
                    style={{ animationDelay: `${index * 130}ms` }}
                  >
                    <div
                      className={clsx(
                        "login-profile-avatar",
                        isLogiSync
                          ? "bg-[linear-gradient(145deg,#08253a,#0b3651)]"
                          : "bg-[linear-gradient(145deg,#2a0d0d,#3b1212)]",
                      )}
                    >
                      <img src={module.logo} alt={module.name} className="h-14 w-auto object-contain" />
                    </div>

                    <div className="mt-4">
                      <p className="text-xl font-tech font-bold text-white">{module.name}</p>
                      <p className="mt-2 text-sm text-slate-300">{module.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {(authView !== "login" || experienceStage === "form") && (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
          <div
            className={clsx(
              "w-full max-w-md rounded-3xl border p-7 backdrop-blur-xl md:p-8",
              currentTheme.surface,
            )}
          >
            <div className="mb-7 text-center">
              <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
                <div
                  className={clsx(
                    "absolute inset-0 rounded-full border",
                    isLogiSyncModule ? "border-cyan-300/35" : "border-[#f05a3d]/35",
                  )}
                />
                <div
                  className={clsx(
                    "absolute inset-[14px] rounded-full blur-2xl",
                    isLogiSyncModule ? "bg-cyan-300/25" : "bg-[#f05a3d]/25",
                  )}
                />
                <img src={moduleLogoUrl} alt={moduleLabel} className="relative z-10 h-12 w-auto object-contain" />
              </div>

              <span
                className={clsx(
                  "inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  currentTheme.badge,
                )}
              >
                {moduleLabel}
              </span>
              <h2 className={clsx("mt-4 text-2xl font-tech font-bold", currentTheme.title)}>
                {headerText.title}
              </h2>
              <p className={clsx("mt-1 text-sm", currentTheme.subtitle)}>{headerText.subtitle}</p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-400/45 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                <ShieldCheck className="h-4 w-4" />
                {error}
              </div>
            )}

            {info && (
              <div
                className={clsx(
                  "mb-4 flex items-center gap-2 rounded-xl border px-4 py-2 text-sm",
                  currentTheme.infoBox,
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                {info}
              </div>
            )}

            {renderAuthForm()}

            <div className="mt-7 border-t border-white/10 pt-5 text-center text-xs text-slate-400">
              Sistema protegido por criptografia de ponta a ponta.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
