import { chainInfo, blockProver, proofProvider } from "@gluwa/usc-sdk";
import { saveTxState, updateTxState } from "./transaction.service";
import type { TxState } from "../models/transaction.model";
import { ethers } from "ethers";

/**
 * Configuration for Creditcoin verification
 */
export interface CreditcoinConfig {
  chainKey: string;
  chainId: string;
  sourceProvider: ethers.JsonRpcProvider;
  creditcoinProvider: ethers.JsonRpcProvider;
  prover: any; // Creditcoin prover instance
  proofServiceUrl: string;
  proofTimeout: number;
}

/**
 * Verification step callback type
 */
export type VerificationProgressCallback = (
  step: number,
  message: string,
) => void;

/**
 * Single transaction verification result
 */
export interface VerificationResult {
  success: boolean;
  txHash: string;
  verified: boolean;
  state: TxState;
  blockNumber?: number;
  headerNumber?: number;
  chainKey?: string;
  proofData?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  success: boolean;
  verified: boolean;
  txCount: number;
  results: VerificationResult[];
  chainKey?: string;
  headers?: number[];
  proofData?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Verify a single transaction using Creditcoin SDK
 * Saves result to database
 */
export const verifySingleTransaction = async (
  txHash: string,
  config: CreditcoinConfig,
  progressCallback?: VerificationProgressCallback,
  metadata?: Record<string, any>,
): Promise<VerificationResult> => {
  const startTime = new Date();

  try {
    progressCallback?.(0, "Connecting to Creditcoin and validating chain info");

    const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(
      config.creditcoinProvider,
    );

    const supportedChains = await chainInfoProvider.getSupportedChains();
    console.log(`[VERIFY ${txHash}] Supported chains:`, supportedChains);

    // Find which block the transaction is in
    progressCallback?.(1, "Finding transaction block on source chain");
    console.log(`[VERIFY ${txHash}] Fetching transaction details...`);

    const tx = await config.sourceProvider.getTransaction(txHash);
    console.log(`[VERIFY ${txHash}] Transaction:`, tx);

    const blockNumber = tx?.blockNumber;

    if (!blockNumber) {
      throw new Error("Could not retrieve block number for transaction");
    }

    progressCallback?.(
      2,
      `Waiting for Creditcoin block attestation (#${blockNumber})`,
    );
    console.log(
      `[VERIFY ${txHash}] Waiting for height ${blockNumber} to be attested...`,
    );

    const proofBuilder = new proofProvider.service.ProofBuilder(
      config.chainKey as any,
      config.proofServiceUrl,
      config.proofTimeout,
    );

    // Wait until Creditcoin has attested that block
    await proofBuilder.waitUntilHeightAttested(
      config.chainKey as any,
      blockNumber,
    );
    console.log(
      `[VERIFY ${txHash}] Block ${blockNumber} is attested — ready to generate proof`,
    );

    progressCallback?.(3, "Generating cryptographic Merkle proof");
    const result = await proofBuilder.getProof(txHash);

    if (!result.success || !result.data) {
      throw new Error(
        `Proof generation failed: ${result.error || "Unknown error"}`,
      );
    }

    const {
      chainKey: ck,
      headerNumber,
      txBytes,
      merkleProof,
      continuityProof,
    } = result.data as any; // Type flexibility for SDK compatibility

    progressCallback?.(4, "Verifying proof on Creditcoin precompile");
    const verified = await config.prover.verifySingle(
      ck,
      headerNumber,
      txBytes,
      merkleProof,
      continuityProof,
    );

    console.log(
      `[VERIFY ${txHash}] Proof verification: ${verified ? "SUCCESS" : "FAILED"}`,
    );

    const finalState: TxState = verified ? "verified" : "not_verified";

    // Save verification result to database
    await saveTxState({
      txHash,
      state: finalState,
      metadata: {
        ...metadata,
        blockNumber,
        headerNumber,
        chainKey: ck?.toString?.() || config.chainKey, // Ensure string format
        verifiedAt: new Date(),
        verificationMethod: "creditcoin-sdk",
        proofData: {
          merkleProof: merkleProof?.substring?.(0, 50) + "...", // Store abbreviated for DB
          continuityProof: continuityProof?.substring?.(0, 50) + "...",
        },
      },
    });

    progressCallback?.(5, `Verification complete: ${finalState}`);

    return {
      success: true,
      txHash,
      verified,
      state: finalState,
      blockNumber,
      headerNumber,
      chainKey: ck,
      proofData: result.data,
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    console.error(`[VERIFY ${txHash}] Error occurred:`, err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    // Save failed state to database
    try {
      await saveTxState({
        txHash,
        state: "pending",
        metadata: {
          ...metadata,
          lastVerificationError: errorMessage,
          lastVerificationAttempt: new Date(),
          verificationMethod: "creditcoin-sdk",
        },
      });
    } catch (dbErr) {
      console.error(
        `[VERIFY ${txHash}] Failed to save error state to DB:`,
        dbErr,
      );
    }

    progressCallback?.(-1, `Verification failed: ${errorMessage}`);

    return {
      success: false,
      txHash,
      verified: false,
      state: "pending",
      error: errorMessage,
      timestamp: new Date(),
    };
  }
};

/**
 * Verify multiple transactions in batch
 * More efficient than verifying one-by-one
 */
export const verifyBatchTransactions = async (
  txHashes: string[],
  config: CreditcoinConfig,
  progressCallback?: VerificationProgressCallback,
  metadata?: Record<string, any>,
): Promise<BatchVerificationResult> => {
  const startTime = Date.now();

  const MAX_BATCH_SIZE = 10;

  // Normalize + deduplicate hashes
  const normalizedHashes = [
    ...new Set(
      (txHashes ?? [])
        .map((hash) => hash?.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // ------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------

  if (normalizedHashes.length === 0) {
    return {
      success: false,
      verified: false,
      txCount: 0,
      results: [],
      error: "No transaction hashes provided",
      timestamp: new Date(),
    };
  }

  if (normalizedHashes.length > MAX_BATCH_SIZE) {
    const error = `Maximum batch size is ${MAX_BATCH_SIZE}. Received ${normalizedHashes.length}.`;

    progressCallback?.(-1, error);

    return {
      success: false,
      verified: false,
      txCount: normalizedHashes.length,
      results: normalizedHashes.map((txHash) => ({
        success: false,
        txHash,
        verified: false,
        state: "unavailable" as TxState,
        error,
        timestamp: new Date(),
      })),
      error,
      timestamp: new Date(),
    };
  }

  try {
    // ------------------------------------------------------------
    // STEP 0 — Validate Creditcoin configuration
    // ------------------------------------------------------------

    progressCallback?.(
      0,
      "Connecting to Creditcoin and validating chain info",
    );

    if (!config.sourceProvider) {
      throw new Error("Source chain provider is not configured");
    }

    if (!config.creditcoinProvider) {
      throw new Error("Creditcoin provider is not configured");
    }

    if (!config.proofServiceUrl) {
      throw new Error("Creditcoin proof service URL is not configured");
    }

    if (config.chainKey === undefined || config.chainKey === null) {
      throw new Error("Creditcoin chain key is not configured");
    }

    const sourceNetwork = await config.sourceProvider.getNetwork();

    console.log("[BATCH VERIFY] Source network:", {
      name: sourceNetwork.name,
      chainId: sourceNetwork.chainId.toString(),
    });

    const chainInfoProvider =
      new chainInfo.PrecompileChainInfoProvider(
        config.creditcoinProvider,
      );

    const supportedChains =
      await chainInfoProvider.getSupportedChains();

    console.log(
      "[BATCH VERIFY] Supported Creditcoin chains:",
      supportedChains,
    );

    if (!supportedChains || supportedChains.length === 0) {
      throw new Error(
        "Creditcoin returned no supported source chains",
      );
    }

    // ------------------------------------------------------------
    // STEP 1 — Retrieve EVERY source transaction
    // ------------------------------------------------------------

    progressCallback?.(
      1,
      "Finding transaction blocks on source chain",
    );

    console.log(
      `[BATCH VERIFY] Looking up ${normalizedHashes.length} transaction(s) on source chain`,
    );

    const sourceTransactions = await Promise.all(
      normalizedHashes.map(async (txHash) => {
        try {
          const tx =
            await config.sourceProvider.getTransaction(txHash);

          if (!tx) {
            throw new Error(
              `Transaction ${txHash} was not found on source chain ` +
                `(chainId=${sourceNetwork.chainId.toString()}, ` +
                `network=${sourceNetwork.name})`,
            );
          }

          console.log("[BATCH VERIFY] Transaction found:", {
            txHash,
            blockNumber: tx.blockNumber,
            from: tx.from,
            to: tx.to,
          });

          return {
            hash: txHash,
            transaction: tx,
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          throw new Error(
            `Could not retrieve transaction ${txHash}: ${message}`,
          );
        }
      }),
    );

    // ------------------------------------------------------------
    // STEP 2 — Make sure every transaction is mined
    // ------------------------------------------------------------

    const blockNumbers = sourceTransactions.map(
      ({ hash, transaction }) => {
        if (
          transaction.blockNumber === null ||
          transaction.blockNumber === undefined
        ) {
          throw new Error(
            `Transaction ${hash} has not been mined yet`,
          );
        }

        return transaction.blockNumber;
      },
    );

    const highestBlock = Math.max(...blockNumbers);
    const lowestBlock = Math.min(...blockNumbers);

    console.log("[BATCH VERIFY] Source transaction blocks:", {
      lowestBlock,
      highestBlock,
      blockNumbers,
    });

    // ------------------------------------------------------------
    // STEP 3 — Wait for Creditcoin attestation
    // ------------------------------------------------------------

    progressCallback?.(
      2,
      `Waiting for Creditcoin block attestation through #${highestBlock}`,
    );

    const proofBuilder =
      new proofProvider.service.ProofBuilder(
        config.chainKey as any,
        config.proofServiceUrl,
        config.proofTimeout,
      );

    await proofBuilder.waitUntilHeightAttested(
      config.chainKey as any,
      highestBlock,
    );

    // ------------------------------------------------------------
    // STEP 4 — Generate batch proof
    // ------------------------------------------------------------

    progressCallback?.(
      3,
      `Generating batch proof for ${normalizedHashes.length} transaction${
        normalizedHashes.length === 1 ? "" : "s"
      }`,
    );

    console.log(
      "[BATCH VERIFY] Generating proof for:",
      normalizedHashes,
    );

    const batchResult =
      await proofBuilder.getBatchProof(normalizedHashes);

    if (!batchResult.success || !batchResult.data) {
      throw new Error(
        `Batch proof generation failed: ${
          batchResult.error || "Unknown proof service error"
        }`,
      );
    }

    const batchData = batchResult.data as any;

    if (!batchData.merkleProofs) {
      throw new Error(
        "Proof service returned no Merkle proofs",
      );
    }

    // ------------------------------------------------------------
    // STEP 5 — Extract proofs
    // ------------------------------------------------------------

    progressCallback?.(
      4,
      "Extracting Merkle proofs and block headers",
    );

    const headers: number[] = [];
    const txBytesArr: string[] = [];
    const merkleProofs: any[] = [];

    for (const [
      headerNumber,
      proofsMap,
    ] of batchData.merkleProofs.entries()) {
      for (const [
        txIndex,
        proofEntry,
      ] of proofsMap.entries()) {
        if (!proofEntry) {
          throw new Error(
            `Missing proof entry for block ${headerNumber}, transaction index ${txIndex}`,
          );
        }

        if (!proofEntry.txBytes) {
          throw new Error(
            `Missing txBytes for block ${headerNumber}, transaction index ${txIndex}`,
          );
        }

        if (!proofEntry.merkleProof) {
          throw new Error(
            `Missing Merkle proof for block ${headerNumber}, transaction index ${txIndex}`,
          );
        }

        headers.push(Number(headerNumber));
        txBytesArr.push(proofEntry.txBytes);
        merkleProofs.push(proofEntry.merkleProof);
      }
    }

    console.log("[BATCH VERIFY] Extracted proof data:", {
      requestedTransactions: normalizedHashes.length,
      headers: headers.length,
      txBytes: txBytesArr.length,
      merkleProofs: merkleProofs.length,
    });

    // ------------------------------------------------------------
    // STEP 6 — Validate proof count
    // ------------------------------------------------------------

    if (headers.length !== normalizedHashes.length) {
      throw new Error(
        `Proof count mismatch: requested ${normalizedHashes.length}, received ${headers.length}`,
      );
    }

    if (txBytesArr.length !== normalizedHashes.length) {
      throw new Error(
        `Transaction proof count mismatch: requested ${normalizedHashes.length}, received ${txBytesArr.length}`,
      );
    }

    if (merkleProofs.length !== normalizedHashes.length) {
      throw new Error(
        `Merkle proof count mismatch: requested ${normalizedHashes.length}, received ${merkleProofs.length}`,
      );
    }

    if (!batchData.continuityProof) {
      throw new Error(
        "Proof service returned no continuity proof",
      );
    }

    // ------------------------------------------------------------
    // STEP 7 — Verify on Creditcoin precompile
    // ------------------------------------------------------------

    progressCallback?.(
      5,
      "Verifying batch on Creditcoin precompile",
    );

    console.log("[BATCH VERIFY] Calling Creditcoin verifyBatch:", {
      chainKey: batchData.chainKey,
      headers,
      proofCount: merkleProofs.length,
    });

    let batchVerified: boolean;

    try {
      batchVerified = await config.prover.verifyBatch(
        batchData.chainKey,
        headers,
        txBytesArr,
        merkleProofs,
        batchData.continuityProof,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      throw new Error(
        `Creditcoin batch verification reverted or failed: ${message}`,
      );
    }

    if (!batchVerified) {
      throw new Error(
        "Creditcoin batch verification returned false",
      );
    }

    // ------------------------------------------------------------
    // STEP 8 — Save successful verification state
    // ------------------------------------------------------------

    const verificationDurationMs =
      Date.now() - startTime;

    progressCallback?.(
      6,
      `Batch verified successfully in ${verificationDurationMs}ms`,
    );

    const results: VerificationResult[] = [];

    for (const txHash of normalizedHashes) {
      try {
        await saveTxState({
          txHash,
          state: "verified",
          metadata: {
            ...metadata,
            verifiedAt: new Date(),
            verificationMethod: "creditcoin-sdk-batch",
            batchSize: normalizedHashes.length,
            chainKey:
              batchData.chainKey?.toString?.() ??
              String(config.chainKey),
            sourceChainId:
              sourceNetwork.chainId.toString(),
            sourceNetwork: sourceNetwork.name,
            verificationDurationMs,
            sourceBlockNumber:
              sourceTransactions.find(
                (item) => item.hash === txHash,
              )?.transaction.blockNumber,
          },
        });

        results.push({
          success: true,
          txHash,
          verified: true,
          state: "verified",
          timestamp: new Date(),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          `[BATCH VERIFY] Failed to save state for ${txHash}:`,
          error,
        );

        results.push({
          success: false,
          txHash,
          verified: true,
          state: "verified",
          error: `Transaction verified, but state could not be saved: ${message}`,
          timestamp: new Date(),
        });
      }
    }

    // ------------------------------------------------------------
    // STEP 9 — Return result
    // ------------------------------------------------------------

    return {
      success: true,
      verified: true,
      txCount: normalizedHashes.length,
      results,
      chainKey:
        batchData.chainKey?.toString?.() ??
        String(config.chainKey),
      headers,
      proofData: batchData,
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      "[BATCH VERIFY] Error occurred:",
      err,
    );

    progressCallback?.(
      -1,
      `Batch verification failed: ${errorMessage}`,
    );

    // ------------------------------------------------------------
    // Determine correct failure state
    // ------------------------------------------------------------

    const isNotMined =
      errorMessage.toLowerCase().includes("not been mined");

    const isNotFound =
      errorMessage.toLowerCase().includes("was not found") ||
      errorMessage.toLowerCase().includes("could not retrieve");

    const failureState: TxState =
      isNotMined ? "pending" : "unavailable";

    const results: VerificationResult[] = [];

    for (const txHash of normalizedHashes) {
      try {
        await updateTxState(
          txHash,
          failureState,
        );

        results.push({
          success: false,
          txHash,
          verified: false,
          state: failureState,
          error: errorMessage,
          timestamp: new Date(),
        });
      } catch (stateError) {
        console.error(
          `[BATCH VERIFY] Failed to update state for ${txHash}:`,
          stateError,
        );

        results.push({
          success: false,
          txHash,
          verified: false,
          state: failureState,
          error: errorMessage,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: false,
      verified: false,
      txCount: normalizedHashes.length,
      results,
      error: errorMessage,
      timestamp: new Date(),
    };
  }
};

/**
 * Retry verification for a transaction that previously failed
 */
export const retryVerification = async (
  txHash: string,
  config: CreditcoinConfig,
  progressCallback?: VerificationProgressCallback,
): Promise<VerificationResult> => {
  console.log(`[RETRY VERIFY ${txHash}] Starting retry...`);
  progressCallback?.(0, "Retrying verification for failed transaction");

  return verifySingleTransaction(txHash, config, progressCallback, {
    retryAttempt: new Date(),
  });
};

/**
 * Get verification statistics
 */
export const getVerificationStats = async (): Promise<{
  total: number;
  verified: number;
  notVerified: number;
  pending: number;
  unavailable: number;
}> => {
  // This would query the database for stats
  // Implementation depends on your database setup
  return {
    total: 0,
    verified: 0,
    notVerified: 0,
    pending: 0,
    unavailable: 0,
  };
};
