/// <reference types="node" />

import path from "path";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// API routes primeiro
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 👇 servir frontend
const frontendPath = path.join(__dirname, "../public");

app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});