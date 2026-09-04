import Transaction, { TxState, ITransaction } from "../models/transaction.model";

/**
 * Payload for saving/updating transaction state
 */
export interface SaveTxPayload {
  txHash: string;
  state?: TxState;
  address?: string;
  network?: string;
  metadata?: Record<string, any>;
}

/**
 * Save or update a transaction with its verification state
 * @param payload - Transaction data to save/update
 * @returns The saved/updated transaction document
 */
export const saveTxState = async (payload: SaveTxPayload): Promise<ITransaction> => {
  const { txHash, state = "pending", address, network, metadata } = payload;

  if (!txHash) {
    throw new Error("Transaction hash (txHash) is required.");
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

  if (!updatedTx) {
    throw new Error("Failed to save transaction state");
  }

  return updatedTx;
};

/**
 * Get transaction status by hash
 * @param txHash - Transaction hash to lookup
 * @returns Transaction document or null if not found
 */
export const getTxState = async (txHash: string): Promise<ITransaction | null> => {
  if (!txHash) {
    throw new Error("Transaction hash (txHash) is required.");
  }

  const normalizedHash = txHash.trim().toLowerCase();
  return Transaction.findOne({ txHash: normalizedHash });
};

/**
 * Check if a transaction is verified
 * @param txHash - Transaction hash to check
 * @returns Object containing verification status and transaction data
 */
export const isTxVerified = async (
  txHash: string
): Promise<{
  isVerified: boolean;
  state: TxState;
  transaction: ITransaction | null;
}> => {
  if (!txHash) {
    throw new Error("Transaction hash (txHash) is required.");
  }

  const normalizedHash = txHash.trim().toLowerCase();
  const transaction = await Transaction.findOne({ txHash: normalizedHash });

  if (!transaction) {
    return {
      isVerified: false,
      state: "unavailable" as TxState,
      transaction: null,
    };
  }

  return {
    isVerified: transaction.state === "verified",
    state: transaction.state,
    transaction,
  };
};

/**
 * Update only the state of a transaction
 * @param txHash - Transaction hash
 * @param state - New state to set
 * @returns Updated transaction document
 */
export const updateTxState = async (txHash: string, state: TxState): Promise<ITransaction> => {
  if (!txHash) {
    throw new Error("Transaction hash (txHash) is required.");
  }

  const normalizedHash = txHash.trim().toLowerCase();
  const updatedTx = await Transaction.findOneAndUpdate(
    { txHash: normalizedHash },
    { $set: { state } },
    { returnDocument: "after", runValidators: true }
  );

  if (!updatedTx) {
    throw new Error(`Transaction with hash ${txHash} not found`);
  }

  return updatedTx;
};

/**
 * List transactions with optional filtering
 * @param filters - Filter criteria
 * @param limit - Number of records to return
 * @param page - Page number for pagination
 * @returns Transactions list with pagination info
 */
export const listTxs = async (
  filters: { state?: TxState; address?: string } = {},
  limit: number = 50,
  page: number = 1
): Promise<{
  transactions: ITransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> => {
  const filter: Record<string, any> = {};

  if (filters.state) {
    filter.state = filters.state;
  }

  if (filters.address) {
    filter.address = filters.address.trim().toLowerCase();
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Transaction.countDocuments(filter),
  ]);

  return {
    transactions,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

/**
 * Batch update transaction states
 * @param updates - Array of {txHash, state} to update
 * @returns Array of updated transactions
 */
export const batchUpdateTxStates = async (
  updates: Array<{ txHash: string; state: TxState }>
): Promise<ITransaction[]> => {
  const results = [];

  for (const { txHash, state } of updates) {
    try {
      const updated = await updateTxState(txHash, state);
      results.push(updated);
    } catch (error) {
      console.error(`Failed to update ${txHash}:`, error);
    }
  }

  return results;
};
