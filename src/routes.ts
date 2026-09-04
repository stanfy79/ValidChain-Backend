import type { FastifyInstance } from "fastify";
import { AnalyticsService } from "./services/analytics.service";
import {
  getTxStatus,
  saveOrUpdateTxStatus,
  listTransactions,
  checkTxVerification,
} from "./controllers/AttestcoinStatus";
import {
  verifySingleHandler,
  verifyBatchHandler,
  retryVerificationHandler,
  getVerificationStatusHandler,
} from "./controllers/attestcoin-verification.controller";
import type { TxState } from "./models/transaction.model";

export async function analyticsRoutes(app: FastifyInstance) {
  app.get<{
    Params: { address: string };
    Querystring: Record<string, any>;
  }>("/api/analytics/:address", async (req, reply) => {
    try {
      const { address } = req.params;

      const result = await AnalyticsService(address);

      if (!result.success) {
        return reply.code(422).send({
          ok: false,
          ...result,
        });
      }

      return reply.send({
        ok: true,
        data: result.data,
      });
    } catch (error: any) {
      req.log.error(error);

      return reply.code(500).send({
        ok: false,
        error: {
          code: "API_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}



export async function txHashStatusRoutes(app: FastifyInstance) {
  // Query transaction status by body payload: { txHash: string }
  app.post<{
    Body: { txHash?: string };
  }>("/api/txState", async (req, reply) => {
    return getTxStatus(req, reply);
  });


  // Record or update transaction status: { txHash, state, address?, network?, chainId?, metadata? }
  app.post<{
    Body: {
      txHash: string;
      state?: TxState;
      address?: string;
      network?: string;
      metadata?: Record<string, any>;
    };
  }>("/api/txState/save", async (req, reply) => {
    return saveOrUpdateTxStatus(req, reply);
  });

  // Check if transaction is verified by POST: /api/txState/verify
  app.post<{
    Body: { txHash?: string };
  }>("/api/txState/verify", async (req, reply) => {
    return checkTxVerification(req, reply);
  });

  // List transactions with filtering: /api/txState?state=pending&address=0x...
  app.get<{
    Params: { address: string };
  }>("/api/txState/:address", async (req, reply) => {
    return listTransactions(req, reply);
  });
}

/**
 * Creditcoin Attestation Verification Routes
 * Backend handles all verification logic using Creditcoin SDK
 */
export async function attestationVerificationRoutes(app: FastifyInstance) {
  // Verify a single transaction
  app.post<{
    Body: {
      txHash: string;
      address?: string;
      network?: string;
      metadata?: Record<string, any>;
    };
  }>("/api/verify/single", async (req, reply) => {
    return verifySingleHandler(req, reply);
  });

  // Verify multiple transactions in batch
  app.post<{
    Body: {
      txHashes: string[];
      network?: string;
      metadata?: Record<string, any>;
    };
  }>("/api/verify/batch", async (req, reply) => {
    return verifyBatchHandler(req, reply);
  });

  // Retry verification for a failed transaction
  app.post<{
    Params: { txHash: string };
  }>("/api/verify/retry/:txHash", async (req, reply) => {
    return retryVerificationHandler(req, reply);
  });

  // Get verification status of a transaction
  app.get<{
    Params: { txHash: string };
  }>("/api/verify/status/:txHash", async (req, reply) => {
    return getVerificationStatusHandler(req, reply);
  });
}
