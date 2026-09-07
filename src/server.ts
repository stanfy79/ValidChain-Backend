import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env";
import { connectDB } from "./database/client";
import { analyticsRoutes, txHashStatusRoutes, attestationVerificationRoutes } from "./routes";
import { initializeCreditcoinConfig, getConfigStatus } from "./services/creditcoin-config.service";

const app = Fastify({
  logger: true,
});

async function startServer() {
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "https://validchain.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await connectDB();

  // Initialize Creditcoin configuration
  try {
    await initializeCreditcoinConfig();
    console.log("[SERVER] Creditcoin verification enabled");
  } catch (err) {
    console.warn("[SERVER] Creditcoin verification disabled:", err instanceof Error ? err.message : String(err));
    console.warn("[SERVER] Set CREDITCOIN_CHAIN_KEY, SOURCE_CHAIN_RPC_URL, and CREDITCOIN_RPC_URL to enable verification");
  }

  // Health check endpoint
  app.get("/api/health", async (_req, reply) => {
    const creditcoinStatus = getConfigStatus();
    return reply.send({
      status: "ok",
      timestamp: new Date(),
      creditcoin: creditcoinStatus,
    });
  });

  await app.register(analyticsRoutes);
  await app.register(txHashStatusRoutes);
  await app.register(attestationVerificationRoutes);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    const status = Number((error as any).status) || 500;
    const body = (error as any).body;
    const message = error instanceof Error ? error.message : String(error);

    reply.status(status).send({
      ok: false,
      error: message,
      ValidChain: body ?? undefined,
    });
  });

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  setInterval(
    () => {
      fetch("https://api-validchain.onrender.com/api/health", { method: "GET" }).catch(
        (err) => console.error("Health check ping failed:", err.message)
      );
    },
    1000 * 60 * 10,
  );

  console.log(
    `ValidChain backend listening on http://${env.HOST}:${env.PORT}`,
  );
}

startServer();
