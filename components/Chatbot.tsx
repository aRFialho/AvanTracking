import React, { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../utils/authFetch";

const BOT_NAME = "Muriçoca";
const BOT_AVATAR_SRC = "/muricoca.png";
const BOT_ANIMATED_AVATAR_SRC = "/muricoca_animated.mp4";
const BOT_BUTTON_SIZE = 64;
const BOT_WINDOW_GAP = 16;
const BOT_MARGIN = 24;
const getDefaultLauncherPosition = (width: number, height: number) => ({
  x: Math.max(BOT_MARGIN, width - BOT_BUTTON_SIZE - BOT_MARGIN),
  y: Math.max(BOT_MARGIN, height - BOT_BUTTON_SIZE - BOT_MARGIN),
});

const clampLauncherPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const maxX = Math.max(BOT_MARGIN, width - BOT_BUTTON_SIZE - BOT_MARGIN);
  const maxY = Math.max(BOT_MARGIN, height - BOT_BUTTON_SIZE - BOT_MARGIN);

  return {
    x: Math.min(Math.max(BOT_MARGIN, x), maxX),
    y: Math.min(Math.max(BOT_MARGIN, y), maxY),
  };
};

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
}

interface KnowledgeItem {
  keywords: string[];
  response: string;
}

// --- KNOWLEDGE BASE ---
const KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    keywords: [
      "dashboard",
      "grafico",
      "kpi",
      "ranking",
      "resumo",
      "tela inicial",
      "metricas",
      "indicadores",
    ],
    response:
      "## 📊 Dashboard Executivo\n\nO Dashboard é sua central de controle. Aqui você encontra:\n\n* KPIs em Tempo Real: Cards com total de NFs, entregues, em trânsito e atrasadas.\n* Gráfico de Status: Uma visão visual da distribuição dos seus pedidos.\n* Ranking de Transportadoras: Uma lista detalhada classificando parceiros por volume e pontualidade.\n* Resumo Mensal: Comparativo de crescimento vs mês anterior.",
  },
  {
    keywords: [
      "importar",
      "csv",
      "excel",
      "planilha",
      "upload",
      "carregar",
      "layout",
      "dados",
    ],
    response:
      "## 📤 Importação de Dados\n\nPara carregar seus pedidos:\n\n1. Acesse o menu Importar CSV.\n2. Arraste seu arquivo .csv ou .xlsx.\n3. O sistema valida e processa os dados automaticamente.\n\nImportante:\n- O sistema ignora pedidos com status 'CANCELADO' automaticamente.\n- O layout deve conter colunas como: *Pedido, Nome do Cliente, Data, Status, Frete tipo, etc*.",
  },
  {
    keywords: [
      "api",
      "busca",
      "consultar",
      "único",
      "rastrear",
      "intelipost",
      "externa",
    ],
    response:
      "## 🌐 Consulta via API\n\nVocê pode consultar dados em tempo real direto da Intelipost:\n\n1. Vá no menu Pedidos.\n2. Clique no botão 'Buscar API' (canto superior direito).\n3. Digite o número do pedido.\n\nIsso buscará a última atualização oficial e adicionará/atualizará o pedido na sua lista.",
  },
  {
    keywords: [
      "alerta",
      "risco",
      "atraso",
      "problema",
      "monitoramento",
      "critico",
    ],
    response:
      "## ⚠️ Monitoramento de Riscos\n\nO módulo de Alertas foca apenas no que precisa de atenção:\n\n* Detecção Automática: Identifica pedidos onde *Data Atual > Previsão de Entrega*.\n* Filtros de Gravidade: Use a régua para filtrar atrasos críticos (ex: +5 dias, +10 dias).\n* Ação: Clique em 'Detalhes' para ver onde o pedido parou.",
  },
  {
    keywords: ["sync", "sincronizar", "atualizar", "tempo", "automático"],
    response:
      "## 🔄 Sincronização\n\nO sistema mantém os dados atualizados de duas formas:\n\n1. Automática: Ocorre a cada 4 horas em segundo plano.\n2. Manual: Clique no botão 'Sincronizar' no rodapé da barra lateral para forçar uma atualização imediata de todos os pedidos ativos.",
  },
  {
    keywords: [
      "pedido",
      "lista",
      "filtro",
      "detalhe",
      "histórico",
      "rastreamento",
    ],
    response:
      "## 📦 Gerenciamento de Pedidos\n\nNa tela de Pedidos, você tem controle total:\n\n* Filtros Avançados: Por Status, Transportadora, Marketplace e Data de Previsão.\n* Detalhes Completos: Clique no ícone de 'olho' 👁️ para ver endereço, valores e o histórico completo de eventos de rastreamento.\n* Busca: Pesquise por Nome, CPF ou Número do Pedido.",
  },
  {
    keywords: ["admin", "usuario", "senha", "acesso", "permissão", "criar"],
    response:
      "## 🛡️ Painel Administrativo\n\nExclusivo para usuários com perfil ADMIN:\n\n* Gerenciar Usuários: Crie novos acessos ou remova usuários antigos.\n* Controle de Acesso: Defina quem é 'ADMIN' (acesso total) ou 'USER' (apenas visualização).\n* Status: Ative ou inative contas instantaneamente.",
  },
  {
    keywords: [
      "logistica do canal",
      "canal",
      "shopee",
      "mercado livre",
      "coletas",
      "me2",
      "priority",
    ],
    response:
      "## 🚚 Logística do Canal\n\nStatus como 'Logística do Canal' aparecem quando o frete é gerenciado pelo marketplace (ex: Shopee Xpress, Mercado Envios/Coletas).\n\nNesses casos, a transportadora é definida pelo canal de venda e o rastreamento externo pode ser limitado, pois a responsabilidade é do marketplace.",
  },
  {
    keywords: [
      "ola",
      "oi",
      "ajuda",
      "bom dia",
      "boa tarde",
      "boa noite",
      "começar",
      "iniciar",
      "help",
    ],
    response:
      "👋 Olá! Eu sou a Muriçoca.\n\nEstou aqui para tirar suas dúvidas sobre o Avantracking. Você pode me perguntar sobre:\n\n* 📊 Dashboard e KPIs\n* 📤 Importação de planilhas\n* ⚠️ Alertas de risco\n* 📦 Pedidos e Rastreamento\n* 🔄 Sincronização\n\nComo posso ajudar hoje?",
  },
];

const SUPPORT_FALLBACK_MESSAGE =
  "Nao consegui identificar essa funcionalidade com seguranca.\n\nEntre em contato com o desenvolvedor da plataforma para orientacao ou correcao.";

const normalizeKnowledgeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isUncertainAiResponse = (text: string) => {
  const normalized = normalizeKnowledgeText(text);

  return [
    "nao entendi",
    "nao compreendi",
    "nao sei",
    "nao tenho certeza",
    "nao encontrei",
    "nao consigo identificar",
    "falta contexto",
  ].some((term) => normalized.includes(term));
};

const ENHANCED_KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    keywords: [
      "dashboard",
      "grafico",
      "kpi",
      "ranking",
      "resumo",
      "tela inicial",
      "metricas",
      "indicadores",
      "cards",
    ],
    response:
      "Dashboard Executivo\n\nNo Dashboard voce acompanha os indicadores principais da operacao.\n- cards com totais e visoes de status\n- graficos de distribuicao dos pedidos\n- ranking de transportadoras\n- atalhos para abrir a tela de pedidos com filtros aplicados",
  },
  {
    keywords: [
      "pedidos",
      "pedido",
      "lista",
      "filtro",
      "detalhe",
      "historico",
      "rastreamento",
      "ordenar",
      "exportar",
      "abrir rastreio",
      "status atrasado",
    ],
    response:
      "Posso te ajudar melhor com Pedidos se voce me confirmar o foco.\n\nMe diga se a sua duvida e sobre:\n1. passo a passo para usar filtros\n2. ordenacao nas colunas\n3. exportacao HTML ou CSV\n4. abrir detalhes do pedido\n5. abrir rastreio\n6. entender algum status ou comportamento da lista",
  },
  {
    keywords: [
      "buscar api",
      "api",
      "consulta externa",
      "pedido unico",
      "nf",
      "nota fiscal",
      "codigo de rastreio",
      "intelipost",
    ],
    response:
      "Consulta de pedido via API\n\nNa tela Pedidos voce pode buscar um pedido individual pela API.\n1. clique em Buscar API\n2. informe numero do pedido, nota fiscal ou codigo de rastreio\n3. o sistema tenta localizar o pedido e atualizar ou adicionar na lista",
  },
  {
    keywords: [
      "sem movimentacao",
      "sem atualizacao",
      "parado",
      "sem movimento",
      "dias sem movimentacao",
    ],
    response:
      "Pedidos sem movimentacao\n\nEssa tela destaca pedidos ativos que ficaram dias sem atualizacao.\n- pedidos finalizados ficam fora dessa lista\n- voce pode ajustar a faixa de dias para localizar casos mais criticos\n- essa visao ajuda a agir antes de virar atraso ou falha",
  },
  {
    keywords: [
      "alerta",
      "alertas",
      "risco",
      "atraso",
      "monitoramento",
      "critico",
      "problema",
    ],
    response:
      "Alertas de Risco\n\nA tela de Alertas foca no que exige atencao imediata.\n- ajuda a localizar pedidos atrasados e situacoes criticas\n- facilita a priorizacao do acompanhamento\n- permite abrir detalhes para entender onde o pedido parou",
  },
  {
    keywords: [
      "falha na entrega",
      "falhas na entrega",
      "insucesso",
      "tentativa de entrega",
      "entrega falhou",
    ],
    response:
      "Falhas na Entrega\n\nEssa tela mostra pedidos com problema real de entrega.\n- pedidos ja entregues nao devem entrar na contagem pendente\n- fretes de retirada na agencia podem ser ignorados nessa analise\n- a visao ajuda a acompanhar novas falhas e agir com a transportadora",
  },
  {
    keywords: [
      "importar",
      "csv",
      "xlsx",
      "excel",
      "planilha",
      "upload",
      "layout",
      "dados",
    ],
    response:
      "Importacao de Dados\n\nPara importar pedidos:\n1. acesse Importar CSV\n2. envie um arquivo CSV ou XLSX\n3. o sistema valida e processa a carga\n\nRegras importantes:\n- pedidos cancelados sao ignorados\n- o arquivo deve trazer dados do pedido, cliente, frete, datas e endereco",
  },
  {
    keywords: [
      "sync",
      "sincronizar",
      "sincronizacao",
      "sincronizacao de pedidos",
      "sync de pedidos",
      "sincronizar pedidos",
      "manual",
      "automatico",
      "relatorio de sincronizacao",
      "relatorio sync",
    ],
    response:
      "Posso te ajudar melhor com sincronizacao de pedidos se voce me confirmar o foco.\n\nMe diga se a sua duvida e sobre:\n1. passo a passo para sincronizar manualmente\n2. como funciona o sync automatico\n3. diferenca entre sync de rastreio e sync da Tray\n4. relatorio de sincronizacao\n5. pedido que nao sincronizou\n6. alguma funcionalidade especifica da sincronizacao",
  },
  {
    keywords: [
      "tray",
      "integracao tray",
      "sincronizar pedidos da tray",
      "oauth tray",
      "loja tray",
    ],
    response:
      "Integracao Tray\n\nA integracao com a Tray permite:\n- autorizar a loja na tela de Integracao\n- acompanhar o status da integracao\n- sincronizar pedidos da Tray\n- reaproveitar dados da Tray em recursos como recotacao de frete",
  },
  {
    keywords: [
      "frete",
      "recalculado",
      "recalculo",
      "cotacao",
      "quote",
      "frete recalculado atual",
    ],
    response:
      "Frete recalculado\n\nA plataforma suporta recotacao de frete por pedido e em lote.\n- o calculo depende de CEP valido e itens reais do pedido\n- a comparacao entre frete pago e frete recalculado ajuda a encontrar divergencias\n- a cotacao usa os dados da integracao quando eles estao disponiveis",
  },
  {
    keywords: [
      "release notes",
      "patch notes",
      "ultimas atualizacoes",
      "ultima atualizacao",
      "release",
    ],
    response:
      "Release Notes e Ultimas Atualizacoes\n\nA plataforma possui historico de atualizacoes publicadas.\n- administradores podem montar e enviar release notes por e-mail\n- a tela Ultimas Atualizacoes mostra o historico enviado\n- cada item exibe versao, resumo, novidades, ajustes e a previa do template",
  },
  {
    keywords: [
      "admin",
      "administracao",
      "usuario",
      "usuarios",
      "empresa",
      "empresas",
      "permissao",
      "acesso",
      "senha",
    ],
    response:
      "Painel Administrativo\n\nNo painel administrativo ou de integracao voce pode:\n- gerenciar usuarios\n- definir perfil ADMIN ou USER\n- cadastrar e gerenciar empresas\n- configurar integracoes da empresa atual\n- enviar release notes\n\nAlgumas acoes exigem permissao de administrador.",
  },
  {
    keywords: [
      "trocar empresa",
      "empresa atual",
      "alternar empresa",
      "mudar empresa",
    ],
    response:
      "Troca de empresa\n\nUsuarios com acesso administrativo podem alternar a empresa ativa quando houver mais de uma empresa disponivel.\n- a troca muda o contexto da operacao\n- pedidos, integracoes e configuracoes passam a refletir a empresa selecionada",
  },
  {
    keywords: [
      "logistica do canal",
      "canal",
      "shopee",
      "mercado livre",
      "coletas",
      "me2",
      "priority",
      "retirada",
      "agencia",
    ],
    response:
      "Logistica do Canal e fretes especiais\n\nQuando o frete e administrado pelo marketplace, o pedido pode aparecer como Logistica do Canal.\n- isso e comum em operacoes como Shopee Xpress, Mercado Envios e Coletas ME2\n- em alguns cenarios a plataforma ignora fretes de retirada na agencia em visoes especificas\n- o rastreio pode ser limitado quando a responsabilidade fica com o canal",
  },
  {
    keywords: [
      "login",
      "esqueci a senha",
      "redefinir senha",
      "convite",
      "acesso por link",
    ],
    response:
      "Acesso e senha\n\nA plataforma possui fluxo de login e definicao de senha.\n- o usuario pode solicitar redefinicao de senha\n- convites podem ser concluidos por link de acesso\n- algumas rotas e configuracoes so ficam disponiveis apos autenticacao",
  },
  {
    keywords: [
      "ola",
      "oi",
      "ajuda",
      "bom dia",
      "boa tarde",
      "boa noite",
      "comecar",
      "iniciar",
      "help",
    ],
    response:
      "Ola! Eu sou a Muricoca.\n\nPosso te ajudar com as funcoes do Avantracking, como Dashboard, Pedidos, Alertas, Falhas na Entrega, Importacao, Sync, Tray, Frete recalculado, Administracao e Release Notes.\n\nSe eu nao entender sua duvida, vou te orientar a entrar em contato com o desenvolvedor da plataforma.",
  },
];

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "model",
      text: `Ola! Eu sou a ${BOT_NAME}.\n\nPosso te ajudar com Dashboard, Pedidos, Importacao, Alertas, Falhas na Entrega, Sync, Tray, Frete recalculado, Administracao e Release Notes.\n\nSe eu nao entender sua duvida, vou te orientar a entrar em contato com o desenvolvedor da plataforma.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarOk, setIsAvatarOk] = useState(true);
  const [isAnimatedAvatarOk, setIsAnimatedAvatarOk] = useState(true);
  const [launcherPosition, setLauncherPosition] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setViewportSize({ width, height });
      setLauncherPosition((current) => {
        if (current.x > 0 || current.y > 0) {
          return clampLauncherPosition(current.x, current.y, width, height);
        }

        return getDefaultLauncherPosition(width, height);
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const findResponse = (text: string): string | null => {
    const normalizedText = normalizeKnowledgeText(text);
    let bestMatch: KnowledgeItem | null = null;
    let bestScore = 0;

    for (const item of ENHANCED_KNOWLEDGE_BASE) {
      const score = item.keywords.reduce((total, keyword) => {
        const normalizedKeyword = normalizeKnowledgeText(keyword);

        if (!normalizedText.includes(normalizedKeyword)) {
          return total;
        }

        const keywordWeight = Math.max(1, normalizedKeyword.split(" ").length * 2);
        return total + keywordWeight;
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch && bestScore > 0 ? bestMatch.response : null;
  };

  const askAI = async (
    history: Message[],
    userText: string,
  ): Promise<string> => {
    const response = await fetchWithAuth("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: userText,
        messages: history.slice(-12),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        typeof data?.error === "string"
          ? data.error
          : `HTTP ${response.status}`;
      throw new Error(msg);
    }
    if (typeof data?.text !== "string" || !data.text.trim()) {
      throw new Error("Resposta vazia");
    }
    return data.text;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: userText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const quickResponse = findResponse(userText);

    if (quickResponse) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "model", text: quickResponse },
      ]);
      setIsLoading(false);
      return;
    }

    try {
      const historySnapshot = [...messages, userMsg];
      const aiText = await askAI(historySnapshot, userText);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "model",
          text: isUncertainAiResponse(aiText)
            ? SUPPORT_FALLBACK_MESSAGE
            : aiText,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "model",
          text: SUPPORT_FALLBACK_MESSAGE,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherPosition.x,
      originY: launcherPosition.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    if (
      !dragStateRef.current.moved &&
      Math.abs(deltaX) < 4 &&
      Math.abs(deltaY) < 4
    ) {
      return;
    }

    dragStateRef.current.moved = true;
    setLauncherPosition(
      clampLauncherPosition(
        dragStateRef.current.originX + deltaX,
        dragStateRef.current.originY + deltaY,
        viewportSize.width,
        viewportSize.height,
      ),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    const shouldToggle = !dragStateRef.current.moved;
    dragStateRef.current.pointerId = -1;
    dragStateRef.current.moved = false;

    if (shouldToggle) {
      setIsOpen((current) => !current);
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current.pointerId = -1;
    dragStateRef.current.moved = false;
  };

  const shouldOpenToLeft =
    viewportSize.width > 0 && launcherPosition.x > viewportSize.width / 2;
  const shouldOpenAbove =
    viewportSize.height > 0 && launcherPosition.y > 540;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: launcherPosition.x,
        top: launcherPosition.y,
      }}
    >
      {isOpen && (
        <div
          className="pointer-events-auto w-[320px] md:w-[380px] h-[500px] bg-white dark:bg-[#151725] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300"
          style={{
            position: "absolute",
            [shouldOpenAbove ? "bottom" : "top"]: BOT_BUTTON_SIZE + BOT_WINDOW_GAP,
            [shouldOpenToLeft ? "right" : "left"]: 0,
          }}
        >
          <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-white">
              <div className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{BOT_NAME}</h3>
                <p className="text-[10px] opacity-80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>{" "}
                  Online
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-[#0B0C15]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  "flex gap-3 max-w-[90%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "",
                )}
              >
                <div
                  className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === "user"
                      ? "bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/5"
                      : "bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/30",
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  ) : isAvatarOk ? (
                    <img
                      src={BOT_AVATAR_SRC}
                      alt={BOT_NAME}
                      className="w-5 h-5 object-contain"
                      onError={() => setIsAvatarOk(false)}
                    />
                  ) : (
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>

                <div
                  className={clsx(
                    "p-3 rounded-2xl text-sm shadow-sm",
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-white dark:bg-[#1A1D2D] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-tl-none",
                  )}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {isAvatarOk ? (
                    <img
                      src={BOT_AVATAR_SRC}
                      alt={BOT_NAME}
                      className="w-5 h-5 object-contain"
                      onError={() => setIsAvatarOk(false)}
                    />
                  ) : (
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div className="bg-white dark:bg-[#1A1D2D] p-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-white/5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">
                    Consultando a Muriçoca...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSend}
            className="p-3 bg-white dark:bg-[#151725] border-t border-slate-200 dark:border-white/5"
          >
            <div className="relative flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex: Como importar csv?"
                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        className={clsx(
          "pointer-events-auto h-16 w-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group relative overflow-hidden touch-none",
          isOpen
            ? "bg-slate-800 text-white"
            : "bg-white border border-white",
        )}
        style={{
          cursor: dragStateRef.current.pointerId === -1 ? "grab" : "grabbing",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {!isOpen && (
          <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-400/10 rounded-full animate-pulse opacity-70"></div>
        )}

        {!isOpen && (
          <div
            className={clsx(
              "absolute inset-[4px] overflow-hidden rounded-full relative z-10 muricoca-float transition-transform duration-300 bg-white",
              "group-hover:scale-110 group-hover:rotate-2",
            )}
          >
            {isAnimatedAvatarOk ? (
              <video
                src={BOT_ANIMATED_AVATAR_SRC}
                poster={BOT_AVATAR_SRC}
                className="h-full w-full object-cover select-none pointer-events-none"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onError={(event) => {
                  console.error("Erro ao carregar video da Muriçoca", event);
                  setIsAnimatedAvatarOk(false);
                }}
              />
            ) : (
              <img
                src={BOT_AVATAR_SRC}
                alt={BOT_NAME}
                className="h-full w-full object-cover select-none pointer-events-none"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onError={(event) => {
                  console.error("Erro ao carregar imagem do Muriçoca", event);
                  setIsAvatarOk(false);
                }}
                style={{ display: isAvatarOk ? "block" : "none" }}
              />
            )}
          </div>
        )}

        {!isAvatarOk && !isOpen && (
          <MessageCircle className="w-7 h-7 relative z-10 text-blue-600 dark:text-blue-400" />
        )}

        {isOpen && (
          <div className="absolute inset-0 flex items-center justify-center">
            <X className="w-7 h-7 relative z-10" />
          </div>
        )}
      </button>
    </div>
  );
};
