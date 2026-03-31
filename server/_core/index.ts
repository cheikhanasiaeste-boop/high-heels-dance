import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleStripeWebhook } from "../stripe-webhook";
import { setupSSE } from "../sse";
import { setupCronJobs } from "../jobs/setupCron";
import { checkSupabaseHealth, ensureAdminUser } from "../lib/supabase";

// Prevent unhandled promise rejections (e.g. from postgres connection errors) from crashing the server
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled rejection (server kept alive):", reason);
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Simple ping endpoint to keep Render awake
  app.get('/ping', (_req, res) => {
    res.status(200).send('OK');
  });

  // Redirect root domain to www in production
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      const host = req.hostname;
      if (host === "elizabeth-zolotova.com") {
        return res.redirect(301, `https://www.elizabeth-zolotova.com${req.originalUrl}`);
      }
      next();
    });
  }

  // ── Security Headers ──────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // CSP managed by Vite/meta tags; enabling here breaks inline scripts
    crossOriginEmbedderPolicy: false, // breaks Zoom SDK and Bunny.net video embeds
  }));

  // ── Rate Limiting ──────────────────────────────────────────────────
  // Global: 200 requests per minute per IP
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  }));

  // Stricter limit on auth-related tRPC calls (30/min)
  app.use("/api/trpc/auth", rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Stricter limit on chat endpoint (10/min to prevent LLM cost abuse)
  app.use("/api/trpc/chat", rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Stripe webhook MUST be registered BEFORE express.json() middleware
  // This is required for webhook signature verification
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );

  // Body parser — 50MB limit (videos use Bunny.net direct upload, not JSON body)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // SSE endpoint for admin notifications (requires admin auth via tRPC context)
  app.get("/api/admin/notifications/stream", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { supabaseAdmin } = await import("../lib/supabase");
    const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (error || !supabaseUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { getUserBySupabaseId } = await import("../db");
    const user = await getUserBySupabaseId(supabaseUser.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    setupSSE(req, res);
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Verify Supabase auth is reachable, then ensure admin account exists
    await checkSupabaseHealth();
    await ensureAdminUser();

    // Setup scheduled jobs
    setupCronJobs();
  });
}

startServer().catch(console.error);
