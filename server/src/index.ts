import path from "path";
import express from "express";
import orderRoutes from "./routes/orders";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' })); // Aumentar limite para planilhas grandes

// API routes
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Rotas de pedidos
app.use("/api/orders", orderRoutes);

// Servir frontend
const frontendPath = path.join(__dirname, "../public");
app.use(express.static(frontendPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});