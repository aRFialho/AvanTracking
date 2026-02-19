
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { clsx } from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'model', text: 'Olá! Sou a IA da Avantracking. Posso te ajudar com dúvidas sobre exportação, importação, ou como analisar seus pedidos?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const getChatSession = () => {
    if (!chatSessionRef.current) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      chatSessionRef.current = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
          systemInstruction: `Você é o assistente virtual inteligente da plataforma AVANTRACKING.
          
          **Sobre a Plataforma:**
          A AVANTRACKING é um Dashboard Logístico (SPA) para rastreamento em tempo real, análise de riscos e métricas de performance de transportadoras.
          
          **Funcionalidades Principais que você deve explicar:**
          1. **Dashboard Executivo:**
             - Exibe KPIs como: Total de NFs, Entregues, Em Trânsito, Atrasadas.
             - Gráficos de distribuição de status.
             - Ranking de desempenho de transportadoras (Volume vs Pontualidade).
          
          2. **Gerenciamento de Pedidos (Menu "Pedidos"):**
             - Listagem completa com filtros por Status, Transportadora, Marketplace e Data.
             - Busca individual por API (Botão "Buscar API"): Conecta na Intelipost para consultar/atualizar um pedido único específico.
             - Detalhes: Clique no ícone de "olho" na tabela para ver histórico de rastreamento completo e endereço.
          
          3. **Importação de Dados (Menu "Importar CSV"):**
             - Permite upload de arquivos .csv ou .xlsx.
             - O sistema processa automaticamente e exibe no dashboard.
             - Importante: Pedidos com status "CANCELADO" são ignorados na importação por padrão.
          
          4. **Monitoramento de Riscos (Menu "Alertas"):**
             - Foca exclusivamente em pedidos com problemas.
             - Filtra pedidos onde a Data Atual > Data Estimada de Entrega.
             - Classifica por dias de atraso.
          
          5. **Sincronização:**
             - O sistema tenta sincronizar automaticamente a cada hora.
             - Botão manual "Sincronizar" na barra lateral atualiza os status dos pedidos ativos.
          
          **Como responder:**
          - Seja direto, profissional e útil.
          - Se o usuário perguntar "Como importar?", explique o processo do menu Importar CSV.
          - Se perguntar sobre "consultar pedido único", mencione a busca por API na tela de Pedidos.
          - Use formatação Markdown (negrito, listas) para clareza.
          - Fale sempre em Português do Brasil.
          `,
        }
      });
    }
    return chatSessionRef.current;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    
    // Add User Message
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const session = getChatSession();
      const result = await session.sendMessage({ message: userText });
      const responseText = result.text;
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: responseText }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: 'Desculpe, tive um problema ao conectar com a IA. Verifique sua conexão ou tente novamente em instantes.' 
      }]);
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
                <h3 className="font-bold text-sm">Assistente IA</h3>
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
                  {msg.role === 'user' ? <User className="w-4 h-4 text-slate-600 dark:text-slate-300" /> : <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
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
                 <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                 </div>
                 <div className="bg-white dark:bg-[#1A1D2D] p-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-white/5 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Digitando...</span>
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
                placeholder="Digite sua dúvida..."
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
          "pointer-events-auto h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group relative overflow-hidden",
          isOpen ? "bg-slate-700 text-white" : "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
        )}
      > 
        {/* Glow Effect */}
        {!isOpen && <div className="absolute inset-0 bg-white/20 rounded-full animate-ping opacity-20"></div>}
        
        {isOpen ? (
            <X className="w-6 h-6 relative z-10" />
        ) : (
            <MessageCircle className="w-7 h-7 relative z-10" />
        )}
      </button>

    </div>
  );
};
