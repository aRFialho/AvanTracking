import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchWithAuth } from "../utils/authFetch";
import { Building2, ChevronDown } from "lucide-react";

interface Company {
  id: string;
  name: string;
}

export const CompanySwitcher: React.FC = () => {
  const { user, setUser } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Carregar empresas disponíveis
    const loadCompanies = async () => {
      try {
        const response = await fetchWithAuth("/api/companies");
        if (response.ok) {
          const data = await response.json();
          setCompanies(data);
        }
      } catch (error) {
        console.error("Erro ao carregar empresas:", error);
      }
    };

    if (user) {
      loadCompanies();
    }
  }, [user]);

  const handleSwitchCompany = async (companyId: string) => {
    if (companyId === user?.companyId) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithAuth("/api/users/switch-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          companyId,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Atualizar o usuário no contexto com a nova empresa e novo token
        if (setUser && data.user && data.token) {
          const updatedUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            companyId: data.user.companyId,
          };
          setUser(updatedUser, data.token);

          // Recarregar a página para refletir os dados da nova empresa
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      } else {
        alert("Erro ao trocar empresa");
      }
    } catch (error) {
      console.error("Erro ao trocar empresa:", error);
      alert("Erro ao trocar empresa");
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  if (!user?.companyId) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded">
        <Building2 className="w-4 h-4" />
        <span>Sem empresa vinculada</span>
      </div>
    );
  }

  const currentCompany = companies.find((c) => c.id === user.companyId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 w-full"
      >
        <Building2 className="w-4 h-4 flex-shrink-0" />
        <span className="truncate max-w-[120px]">
          {currentCompany?.name || "Empresa"}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && companies.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg z-50">
          <div className="p-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1 mb-1">
              Trocar Empresa
            </p>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => handleSwitchCompany(company.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  company.id === user.companyId
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold"
                    : "hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {company.name}
                {company.id === user.companyId && " ✓"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
