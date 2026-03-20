import path from "path";
import express from "express";
import orderRoutes from "./routes/orders";
import userRoutes from "./routes/users";
import companyRoutes from "./routes/companies";
import { showInstallPage, handleAuthCallback, checkAuthStatus } from './controllers/trayAuthController';
import { syncTrayOrders } from './controllers/traySyncController';
import { trayRateLimiter } from './services/rateLimiter';
import { quoteOrderFreight, quoteBatchFreight } from './controllers/freightController';
import { authenticateToken } from './middleware/auth';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// ==================== API ROUTES ====================

// ✅ ROTA DE CHAT (protegida com autenticação)
app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
    const ollamaModel = process.env.OLLAMA_MODEL || "qwen3:0.6b";

    const input = typeof req.body?.input === "string" ? req.body.input : "";
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!input.trim()) {
      return res.status(400).json({ error: "Mensagem vazia." });
    }

    const history = messages
      .slice(-12)
      .map((m: any) => ({
        role: m?.role === "user" ? "user" : "model",
        text: typeof m?.text === "string" ? m.text : "",
      }))
      .filter((m: any) => m.text.trim().length > 0);

    const SYSTEM = [
      "Você é a Muriçoca, assistente da plataforma Avantracking.",
      "Ajude usuários a operar o sistema de ponta a ponta com instruções curtas e práticas.",
      "Não invente telas, botões ou integrações que você não tenha certeza; quando faltar contexto, faça 1-2 perguntas objetivas.",
      "Responda em PT-BR.",
      "",
      "Contexto do Avantracking (resumo funcional):",
      "- Autenticação: Login (usuário precisa estar autenticado para acessar a aplicação).",
      "- Navegação: Sidebar com visões: Dashboard, Pedidos, Pedidos sem movimentação, Importação, Alertas, Falhas na Entrega, Admin (para ADMIN).",
      "- Dashboard: KPIs e gráficos; permite clicar e filtrar para abrir a lista de pedidos com filtros aplicados.",
      "- Pedidos: lista com filtros; permite buscar um pedido único via API (Intelipost) e atualizar/adicionar na lista.",
      "- Importação: envio de CSV/XLSX; pedidos CANCELADOS são ignorados; alguns fretes do canal (ColetasME2, Shopee Xpress, 'priorit') viram status Logística do Canal.",
      "- Sincronização: atualização manual e automática (a cada 1 hora) com a Intelipost para pedidos ativos; recalcula status efetivo e atraso.",
      "- Alertas: monitora riscos de atraso (data atual > previsão; não entregue).",
      "- Falhas na entrega: visão focada em ocorrências/entregas com problema.",
      "- Integração TRAY: rotas /api/tray/* para autenticação e sincronização.",
      "- Cotação de frete: rotas /api/freight/quote/:orderId e /api/freight/quote-batch.",
      "",
      "Regras de resposta:",
      "- Quando o usuário pedir 'como faço', entregue um passo a passo curto.",
      "- Quando o usuário reportar erro, explique a causa provável e o que checar.",
      "- Se o usuário pedir algo que exige permissão (ex: Admin), aponte isso.",
      "- REGRA CRÍTICA DE FALLBACK: Se você não souber a resposta, ou se o usuário disser que 'não está funcionando', 'deu erro', 'não consigo' ou relatar falhas técnicas persistentes, peça para ele entrar em contato com o desenvolvedor para resolução.",
    ].join("\n");

    const ollamaMessages = [
      { role: "system", content: SYSTEM },
      ...history.map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
      { role: "user", content: input },
    ];

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: ollamaMessages,
        options: {
          temperature: 0.3,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const details =
        typeof data?.error === "string"
          ? data.error
          : `HTTP ${response.status}`;
      return res.status(502).json({
        error: "Falha ao consultar o Ollama.",
        details,
        ollamaUrl,
        model: ollamaModel,
      });
    }

    const text =
      typeof data?.message?.content === "string" ? data.message.content.trim() : "";
    if (!text) {
      return res.status(502).json({ error: "Resposta vazia do modelo." });
    }

    return res.json({ text });
  } catch (error: any) {
    return res.status(500).json({
      error: "Falha ao consultar IA.",
      details: typeof error?.message === "string" ? error.message : String(error),
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Users API (algumas rotas protegidas, algumas não - ver routes/users.ts)
app.use("/api/users", userRoutes);

// Companies API (protegida)
app.use("/api/companies", authenticateToken, companyRoutes);

// Orders API (protegida)
app.use("/api/orders", authenticateToken, orderRoutes);

// ✅ ROTAS OAUTH TRAY (sem autenticação obrigatória)
app.get('/api/tray/callback', showInstallPage);
app.get('/api/tray/callback/auth', handleAuthCallback);
app.get('/api/tray/status', checkAuthStatus);
app.post('/api/tray/sync', syncTrayOrders);

// ✅ ROTAS DE COTAÇÃO DE FRETE (protegidas)
app.post('/api/freight/quote/:orderId', authenticateToken, quoteOrderFreight);
app.post('/api/freight/quote-batch', quoteBatchFreight);

// ✅ ENDPOINT PARA MONITORAR RATE LIMIT (MOVIDO PARA ANTES DO FALLBACK)
app.get('/api/tray/rate-limit-stats', (req, res) => {
  const stats = trayRateLimiter.getStats();
  
  return res.json({
    success: true,
    rateLimiter: {
      ...stats,
      status: stats.utilizationPercent > 90 ? 'CRITICAL' : 
              stats.utilizationPercent > 70 ? 'WARNING' : 'OK'
    }
  });
});

// ==================== FRONTEND ====================

// Servir frontend
const frontendPath = path.join(__dirname, "../public");
app.use(express.static(frontendPath));

// ⚠️ FALLBACK DEVE SER SEMPRE A ÚLTIMA ROTA!
app.get(/.*/, (req, res) => {
  // Verificar se é uma rota API que não existe
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // Servir frontend para todas as outras rotas
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ==================== START SERVER ====================

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
