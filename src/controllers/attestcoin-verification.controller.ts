import httpStatus from "http-status";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  verifySingleTransaction,
  verifyBatchTransactions,
  retryVerification,
  type VerificationProgressCallback,
} from "../services/attestcoin-verification.service";
import {
  getCreditcoinConfig,
  isCreditcoinConfigured,
} from "../services/creditcoin-config.service";
import { getTxState } from "../services/transaction.service";

/**
 * Verify a single transaction
 * POST /api/verify/single
 */
export const verifySingleHandler = async (
  req: FastifyRequest<{
    Body: {
      txHash: string;
      address?: string;
      network?: string;
      metadata?: Record<string, any>;
    };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { txHash, address, network, metadata } = req.body;

    if (!txHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    // Check if Creditcoin is configured
    if (!isCreditcoinConfigured()) {
      return reply.status(httpStatus.SERVICE_UNAVAILABLE).send({
        statusCode: httpStatus.SERVICE_UNAVAILABLE,
        success: false,
        message:
          "Creditcoin verification service is not available. Please try again later.",
      });
    }

    const config = getCreditcoinConfig();

    // Optional: Create progress tracking if using WebSockets or Server-Sent Events
    const progressCallback: VerificationProgressCallback = (step, message) => {
      console.log(`[PROGRESS] Step ${step}: ${message}`);
      req.log.info(`Verification progress: ${message}`);
    };

    const result = await verifySingleTransaction(
      txHash.trim().toLowerCase(),
      config,
      progressCallback,
      {
        ...metadata,
        address,
        // network,
      },
    );

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: result.success,
      message: result.success
        ? "Transaction verified successfully."
        : "Transaction verification failed.",
      data: result,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred during verification.",
    });
  }
};

/**
 * Verify multiple transactions in batch
 * POST /api/verify/batch
 */
export const verifyBatchHandler = async (
  req: FastifyRequest<{
    Body: {
      txHashes: string[];
      network?: string;
      metadata?: Record<string, any>;
    };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { txHashes, network, metadata } = req.body;

    if (!txHashes || !Array.isArray(txHashes) || txHashes.length === 0) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message:
          "Transaction hashes array (txHashes) is required and must not be empty.",
      });
    }

    if (txHashes.length > 100) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message:
          "Maximum 100 transactions per batch. Please split larger requests.",
      });
    }

    // Check if Creditcoin is configured
    if (!isCreditcoinConfigured()) {
      return reply.status(httpStatus.SERVICE_UNAVAILABLE).send({
        statusCode: httpStatus.SERVICE_UNAVAILABLE,
        success: false,
        message:
          "Creditcoin verification service is not available. Please try again later.",
      });
    }

    const config = getCreditcoinConfig();

    const progressCallback: VerificationProgressCallback = (step, message) => {
      console.log(`[BATCH PROGRESS] Step ${step}: ${message}`);
      req.log.info(`Batch verification progress: ${message}`);
    };

    const normalizedHashes = txHashes.map((h) => h.trim().toLowerCase());

    const result = await verifyBatchTransactions(
      normalizedHashes,
      config,
      progressCallback,
      {
        network,
        ...metadata,
      },
    );

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: result.success,
      message: result.success
        ? `Batch verification completed. ${result.results.filter((r) => r.success).length}/${result.txCount} successful.`
        : "Batch verification failed.",
      data: result,
    });
  } catch (error: unknown) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error instanceof Error ? error.message : "An error occurred during batch verification.",
    });
  }
};

/**
 * Retry verification for a failed transaction
 * POST /api/verify/retry/:txHash
 */
export const retryVerificationHandler = async (
  req: FastifyRequest<{
    Params: { txHash: string };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { txHash } = req.params;

    if (!txHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    const normalizedHash = txHash.trim().toLowerCase();

    // Check if transaction exists
    const existing = await getTxState(normalizedHash);
    if (!existing) {
      return reply.status(httpStatus.NOT_FOUND).send({
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: "Transaction not found in database.",
      });
    }

    // Check if Creditcoin is configured
    if (!isCreditcoinConfigured()) {
      return reply.status(httpStatus.SERVICE_UNAVAILABLE).send({
        statusCode: httpStatus.SERVICE_UNAVAILABLE,
        success: false,
        message:
          "Creditcoin verification service is not available. Please try again later.",
      });
    }

    const config = getCreditcoinConfig();

    const progressCallback: VerificationProgressCallback = (step, message) => {
      console.log(`[RETRY PROGRESS] Step ${step}: ${message}`);
      req.log.info(`Retry verification progress: ${message}`);
    };

    const result = await retryVerification(
      normalizedHash,
      config,
      progressCallback,
    );

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: result.success,
      message: result.success
        ? "Retry verification successful."
        : "Retry verification failed.",
      data: result,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred during retry verification.",
    });
  }
};

/**
 * Get verification status of a transaction
 * GET /api/verify/status/:txHash
 */
export const getVerificationStatusHandler = async (
  req: FastifyRequest<{
    Params: { txHash: string };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { txHash } = req.params;

    if (!txHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    const normalizedHash = txHash.trim().toLowerCase();
    const transaction = await getTxState(normalizedHash);

    const status = transaction
      ? {
          txHash: normalizedHash,
          state: transaction.state,
          verified: transaction.state === "verified",
          details: transaction,
        }
      : {
          txHash: normalizedHash,
          state: "unavailable" as const,
          verified: false,
          details: null,
        };

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: true,
      message: "Verification status retrieved successfully.",
      data: status,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error?.message ||
        "An error occurred while retrieving verification status.",
    });
  }
};
