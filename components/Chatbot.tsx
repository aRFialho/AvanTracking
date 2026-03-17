
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

const BOT_NAME = 'Muriçoca';
const BOT_AVATAR_SRC = '/muricoca.png';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface KnowledgeItem {
  keywords: string[];
  response: string;
}

// --- KNOWLEDGE BASE ---
const KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    keywords: ['dashboard', 'grafico', 'kpi', 'ranking', 'resumo', 'tela inicial', 'metricas', 'indicadores'],
    response: "## 📊 Dashboard Executivo\n\nO Dashboard é sua central de controle. Aqui você encontra:\n\n* **KPIs em Tempo Real:** Cards com total de NFs, entregues, em trânsito e atrasadas.\n* **Gráfico de Status:** Uma visão visual da distribuição dos seus pedidos.\n* **Ranking de Transportadoras:** Uma lista detalhada classificando parceiros por volume e pontualidade.\n* **Resumo Mensal:** Comparativo de crescimento vs mês anterior."
  },
  {
    keywords: ['importar', 'csv', 'excel', 'planilha', 'upload', 'carregar', 'layout', 'dados'],
    response: "## 📤 Importação de Dados\n\nPara carregar seus pedidos:\n\n1. Acesse o menu **Importar CSV**.\n2. Arraste seu arquivo **.csv** ou **.xlsx**.\n3. O sistema valida e processa os dados automaticamente.\n\n**Importante:**\n- O sistema ignora pedidos com status 'CANCELADO' automaticamente.\n- O layout deve conter colunas como: *Pedido, Nome do Cliente, Data, Status, Frete tipo, etc*."
  },
  {
    keywords: ['api', 'busca', 'consultar', 'único', 'rastrear', 'intelipost', 'externa'],
    response: "## 🌐 Consulta via API\n\nVocê pode consultar dados em tempo real direto da Intelipost:\n\n1. Vá no menu **Pedidos**.\n2. Clique no botão **'Buscar API'** (canto superior direito).\n3. Digite o número do pedido.\n\nIsso buscará a última atualização oficial e adicionará/atualizará o pedido na sua lista."
  },
  {
    keywords: ['alerta', 'risco', 'atraso', 'problema', 'monitoramento', 'critico'],
    response: "## ⚠️ Monitoramento de Riscos\n\nO módulo de Alertas foca apenas no que precisa de atenção:\n\n* **Detecção Automática:** Identifica pedidos onde *Data Atual > Previsão de Entrega*.\n* **Filtros de Gravidade:** Use a régua para filtrar atrasos críticos (ex: +5 dias, +10 dias).\n* **Ação:** Clique em 'Detalhes' para ver onde o pedido parou."
  },
  {
    keywords: ['sync', 'sincronizar', 'atualizar', 'tempo', 'automático'],
    response: "## 🔄 Sincronização\n\nO sistema mantém os dados atualizados de duas formas:\n\n1. **Automática:** Ocorre a cada **1 hora** em segundo plano.\n2. **Manual:** Clique no botão **'Sincronizar'** no rodapé da barra lateral para forçar uma atualização imediata de todos os pedidos ativos."
  },
  {
    keywords: ['pedido', 'lista', 'filtro', 'detalhe', 'histórico', 'rastreamento'],
    response: "## 📦 Gerenciamento de Pedidos\n\nNa tela de Pedidos, você tem controle total:\n\n* **Filtros Avançados:** Por Status, Transportadora, Marketplace e Data de Previsão.\n* **Detalhes Completos:** Clique no ícone de 'olho' 👁️ para ver endereço, valores e o histórico completo de eventos de rastreamento.\n* **Busca:** Pesquise por Nome, CPF ou Número do Pedido."
  },
  {
    keywords: ['admin', 'usuario', 'senha', 'acesso', 'permissão', 'criar'],
    response: "## 🛡️ Painel Administrativo\n\nExclusivo para usuários com perfil **ADMIN**:\n\n* **Gerenciar Usuários:** Crie novos acessos ou remova usuários antigos.\n* **Controle de Acesso:** Defina quem é 'ADMIN' (acesso total) ou 'USER' (apenas visualização).\n* **Status:** Ative ou inative contas instantaneamente."
  },
  {
    keywords: ['logistica do canal', 'canal', 'shopee', 'mercado livre', 'coletas', 'me2', 'priority'],
    response: "## 🚚 Logística do Canal\n\nStatus como **'Logística do Canal'** aparecem quando o frete é gerenciado pelo marketplace (ex: Shopee Xpress, Mercado Envios/Coletas).\n\nNesses casos, a transportadora é definida pelo canal de venda e o rastreamento externo pode ser limitado, pois a responsabilidade é do marketplace."
  },
  {
    keywords: ['ola', 'oi', 'ajuda', 'bom dia', 'boa tarde', 'boa noite', 'começar', 'iniciar', 'help'],
    response: "👋 **Olá! Eu sou a Muriçoca.**\n\nEstou aqui para tirar suas dúvidas sobre o Avantracking. Você pode me perguntar sobre:\n\n* 📊 **Dashboard** e KPIs\n* 📤 **Importação** de planilhas\n* ⚠️ **Alertas** de risco\n* 📦 **Pedidos** e Rastreamento\n* 🔄 **Sincronização**\n\nComo posso ajudar hoje?"
  }
];

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '0', 
      role: 'model', 
      text: `👋 Oi! Eu sou a **${BOT_NAME}**.\n\nPosso te ajudar a usar o Avantracking de ponta a ponta (Dashboard, Pedidos, Importação, Alertas, Sync, Admin e integrações). O que você precisa?` 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarOk, setIsAvatarOk] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // --- LOCAL INTELLIGENCE ENGINE ---
  const findResponse = (text: string): string => {
    const normalizedText = text.toLowerCase().trim();
    
    // 1. Exact/Keyword Match
    for (const item of KNOWLEDGE_BASE) {
        if (item.keywords.some(keyword => normalizedText.includes(keyword))) {
            return item.response;
        }
    }

    // 2. Default Fallback
    return "Desculpe, não entendi exatamente. 😕\n\nTente usar palavras-chave como:\n\n* **'Dashboard'** (para dúvidas sobre gráficos)\n* **'Importar'** (para dúvidas sobre CSV/Excel)\n* **'Alertas'** (para riscos de atraso)\n* **'API'** (para consulta de pedido único)\n* **'Sync'** (para sincronização)";
  };

  const askAI = async (history: Message[], userText: string): Promise<string> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: userText,
        messages: history.slice(-12),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`;
      throw new Error(msg);
    }
    if (typeof data?.text !== 'string' || !data.text.trim()) {
      throw new Error('Resposta vazia');
    }
    return data.text;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    
    // Add User Message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const historySnapshot = [...messages, userMsg];
      const aiText = await askAI(historySnapshot, userText);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: aiText }]);
    } catch {
      const responseText = findResponse(userText);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: responseText }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="pointer-events-auto mb-4 w-[320px] md:w-[380px] h-[500px] bg-white dark:bg-[#151725] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
          
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-white">
              <div className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{BOT_NAME}</h3>
                <p className="text-[10px] opacity-80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> Online
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

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-[#0B0C15]">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={clsx(
                  "flex gap-3 max-w-[90%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                )}
              >
                {/* Avatar */}
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                  msg.role === 'user' 
                    ? "bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/5" 
                    : "bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/30"
                )}>
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  ) : (
                    isAvatarOk ? (
                      <img
                        src={BOT_AVATAR_SRC}
                        alt={BOT_NAME}
                        className="w-5 h-5 object-contain"
                        onError={() => setIsAvatarOk(false)}
                      />
                    ) : (
                      <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )
                  )}
                </div>

                {/* Bubble */}
                <div className={clsx(
                  "p-3 rounded-2xl text-sm shadow-sm",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white dark:bg-[#1A1D2D] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-tl-none"
                )}>
                  {/* Markdown-like simple rendering */}
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
                    <span className="text-xs text-slate-400">Consultando a Muriçoca...</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} className="p-3 bg-white dark:bg-[#151725] border-t border-slate-200 dark:border-white/5">
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

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "pointer-events-auto h-16 w-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group relative overflow-hidden",
          isOpen ? "bg-slate-800 text-white" : "bg-white dark:bg-[#151725] border border-slate-200 dark:border-white/10"
        )}
      > 
        {!isOpen && <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-400/10 rounded-full animate-pulse opacity-70"></div>}

        {isAvatarOk ? (
          <img
            src={BOT_AVATAR_SRC}
            alt={BOT_NAME}
            className={clsx(
              "w-14 h-14 object-contain relative z-10 select-none muricoca-float transition-transform duration-300",
              isOpen ? "opacity-0" : "group-hover:scale-110 group-hover:rotate-2"
            )}
            onError={() => setIsAvatarOk(false)}
          />
        ) : (
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
