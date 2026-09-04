/**
 * Frontend Client for Transaction State API
 * Use this to interact with the backend API and manage UI updates
 */

export type TxState = "verified" | "not_verified" | "pending" | "unavailable";

export interface Transaction {
  _id?: string;
  txHash: string;
  state: TxState;
  address?: string;
  network?: string;
  chainId?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VerificationResponse {
  isVerified: boolean;
  state: TxState;
  transaction: Transaction | null;
}

export interface ApiResponse<T> {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

/**
 * Save or update a transaction with verification state
 */
export const saveTxState = async (payload: {
  txHash: string;
  state?: TxState;
  address?: string;
  network?: string;
  chainId?: string;
  metadata?: Record<string, any>;
}): Promise<Transaction> => {
  const response = await fetch(`${API_BASE_URL}/api/txState/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to save transaction state: ${response.statusText}`);
  }

  const result: ApiResponse<Transaction> = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
};

/**
 * Get transaction status by hash
 */
export const getTxStatus = async (txHash: string): Promise<Transaction> => {
  const response = await fetch(`${API_BASE_URL}/api/txState/${txHash}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get transaction status: ${response.statusText}`);
  }

  const result: ApiResponse<Transaction> = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
};

/**
 * Check if a transaction is verified
 * This is the main function to use for UI updates
 */
export const checkTxVerification = async (
  txHash: string
): Promise<VerificationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/txState/${txHash}/verify`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to check verification: ${response.statusText}`);
  }

  const result: ApiResponse<VerificationResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
};

/**
 * Alternative POST method to check verification
 */
export const checkTxVerificationByPost = async (
  txHash: string
): Promise<VerificationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/txState/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ txHash }),
  });

  if (!response.ok) {
    throw new Error(`Failed to check verification: ${response.statusText}`);
  }

  const result: ApiResponse<VerificationResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
};

/**
 * React Hook to check transaction verification and update UI
 * Usage:
 * const { isVerified, state, loading, error } = useCheckTxVerification(txHash);
 */
export const useCheckTxVerification = (txHash: string | null) => {
  const [isVerified, setIsVerified] = React.useState(false);
  const [state, setState] = React.useState<TxState>("unavailable");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [transaction, setTransaction] = React.useState<Transaction | null>(null);

  const checkVerification = React.useCallback(async () => {
    if (!txHash) {
      setError(new Error("Transaction hash is required"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await checkTxVerification(txHash);
      setIsVerified(result.isVerified);
      setState(result.state);
      setTransaction(result.transaction);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsVerified(false);
      setState("unavailable");
    } finally {
      setLoading(false);
    }
  }, [txHash]);

  // Auto-check on mount and when txHash changes
  React.useEffect(() => {
    checkVerification();
  }, [txHash, checkVerification]);

  return {
    isVerified,
    state,
    loading,
    error,
    transaction,
    refetch: checkVerification,
  };
};

/**
 * Helper function to get UI-friendly status text
 */
export const getStatusText = (state: TxState): string => {
  const statusMap: Record<TxState, string> = {
    verified: "✓ Verified",
    not_verified: "✗ Not Verified",
    pending: "⏳ Pending",
    unavailable: "? Unavailable",
  };
  return statusMap[state] || state;
};

/**
 * Helper function to get status badge color
 */
export const getStatusColor = (state: TxState): string => {
  const colorMap: Record<TxState, string> = {
    verified: "success",
    not_verified: "error",
    pending: "warning",
    unavailable: "default",
  };
  return colorMap[state] || "default";
};

/**
 * Batch check multiple transactions
 */
export const batchCheckTxVerifications = async (
  txHashes: string[]
): Promise<Record<string, VerificationResponse>> => {
  const results: Record<string, VerificationResponse> = {};

  for (const txHash of txHashes) {
    try {
      results[txHash] = await checkTxVerification(txHash);
    } catch (error) {
      console.error(`Failed to check ${txHash}:`, error);
      results[txHash] = {
        isVerified: false,
        state: "unavailable",
        transaction: null,
      };
    }
  }

  return results;
};

// Add React import at the top - users need to import React in their files
// import React from 'react';
