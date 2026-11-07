import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import api from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// API (routes are defined without the /api prefix, mounted here).
app.use("/api", api);

// Static assets from the built frontend.
app.use(express.static(path.join(__dirname, "../dist")));

// SPA fallback (hash-routed, so deep links resolve to index.html).
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(__dirname, "../dist/index.html"));
  }
  next();
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Rivulet running on http://localhost:${port}`);
});
