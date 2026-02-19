import path from "path";
import express from "express";
import orderRoutes from "./routes/orders";
import { showInstallPage, handleAuthCallback, checkAuthStatus } from './controllers/trayAuthController';
import { syncTrayOrders } from './controllers/traySyncController';
import { trayRateLimiter } from './services/rateLimiter';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// ==================== API ROUTES ====================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Rotas de pedidos
app.use("/api/orders", orderRoutes);

// ✅ ROTAS OAUTH TRAY
app.get('/api/tray/callback', showInstallPage);
app.get('/api/tray/callback/auth', handleAuthCallback);
app.get('/api/tray/status', checkAuthStatus);
app.post('/api/tray/sync', syncTrayOrders);

// ==================== FRONTEND ====================

// Servir frontend
const frontendPath = path.join(__dirname, "../public");
app.use(express.static(frontendPath));

// Fallback para SPA (Single Page Application)
app.get(/.*/, (req, res) => {
  // Verificar se é uma rota API que não existe
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // Servir frontend para todas as outras rotas
  res.sendFile(path.join(frontendPath, "index.html"));
});
// ✅ ENDPOINT PARA MONITORAR RATE LIMIT
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
// ==================== START SERVER ====================

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
