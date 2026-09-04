import httpStatus from "http-status";
import type { FastifyRequest, FastifyReply } from "fastify";
import Transaction, { TxState, VALID_TX_STATES } from "../models/transaction.model";

interface TxStateBody {
  txHash: string;
  state?: TxState;
  address?: string;
  network?: string;
  metadata?: Record<string, any>;
}

interface TxStateParams {
  txHash: string;
}

interface TxStateQuery {
  state?: TxState;
  address?: string;
  limit?: number;
  page?: number;
}

/**
 * Get the status/state of a transaction by its hash
 */
export const getTxStatus = async (
  req: FastifyRequest<{
    Params?: TxStateParams;
    Body?: { txHash?: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const rawHash = req.params?.txHash || req.body?.txHash;

    if (!rawHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    const txHash = rawHash.trim().toLowerCase();
    const transaction = await Transaction.findOne({ txHash });

    if (!transaction) {
      return reply.status(httpStatus.OK).send({
        statusCode: httpStatus.OK,
        success: true,
        message: "Transaction not found in database records.",
        data: {
          txHash,
          state: "unavailable" as TxState,
        },
      });
    }

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: true,
      message: "Transaction status fetched successfully.",
      data: transaction,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred while fetching transaction status.",
    });
  }
};

/**
 * Record or update a transaction hash and its verification state
 */
export const saveOrUpdateTxStatus = async (
  req: FastifyRequest<{
    Body: TxStateBody;
  }>,
  reply: FastifyReply
) => {
  try {
    const { txHash, state = "pending", address, network, metadata } = req.body;

    if (!txHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    if (state && !VALID_TX_STATES.includes(state)) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid state provided. Must be one of: ${VALID_TX_STATES.join(", ")}`,
      });
    }

    const normalizedHash = txHash.trim().toLowerCase();

    const updatedTx = await Transaction.findOneAndUpdate(
      { txHash: normalizedHash },
      {
        $set: {
          txHash: normalizedHash,
          state,
          ...(address ? { address: address.trim().toLowerCase() } : {}),
          ...(network ? { network } : {}),
          ...(metadata ? { metadata } : {}),
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: true,
      message: "Transaction state recorded successfully.",
      data: updatedTx,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred while saving transaction state.",
    });
  }
};

/**
 * List transactions with optional filtering by state or address
 */
export const listTransactions = async (
  req: FastifyRequest<{
    Params: { address: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const address = req.params?.address?.trim().toLowerCase();

    const filter: {address?: string} = { address };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter),
      Transaction.countDocuments(filter),
    ]);

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: true,
      message: "Transactions retrieved successfully.",
      data: transactions,
      total,
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred while listing transactions.",
    });
  }
};

/**
 * Check if a transaction is verified
 * Returns verification status and full transaction details
 */
export const checkTxVerification = async (
  req: FastifyRequest<{
    Params?: TxStateParams;
    Body?: { txHash?: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const rawHash = req.params?.txHash || req.body?.txHash;

    if (!rawHash) {
      return reply.status(httpStatus.BAD_REQUEST).send({
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Transaction hash (txHash) is required.",
      });
    }

    const txHash = rawHash.trim().toLowerCase();
    const transaction = await Transaction.findOne({ txHash });

    const isVerified = transaction?.state === "verified";
    const state = transaction?.state || ("unavailable" as TxState);

    return reply.status(httpStatus.OK).send({
      statusCode: httpStatus.OK,
      success: true,
      message: `Transaction verification status retrieved successfully.`,
      data: {
        txHash,
        isVerified,
        state,
        transaction: transaction || null,
      },
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || "An error occurred while checking transaction verification.",
    });
  }
};

// Backwards compatibility export
export const txHashStatus = getTxStatus;
