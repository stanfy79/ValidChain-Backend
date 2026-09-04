import { ethers } from "ethers";
import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import type { CreditcoinConfig } from "./attestcoin-verification.service";

let creditcoinConfig: CreditcoinConfig | null = null;

/**
 * Initialize Creditcoin configuration
 * Call this once during server startup
 */
export const initializeCreditcoinConfig =
  async (): Promise<CreditcoinConfig> => {
    if (creditcoinConfig) {
      console.log("[CONFIG] Creditcoin config already initialized");
      return creditcoinConfig;
    }

    console.log("[CONFIG] Initializing Creditcoin configuration...");

    const chainKey = process.env.CREDITCOIN_CHAIN_KEY;
    const chainId = process.env.CREDITCOIN_CHAIN_ID;
    const sourceRpcUrl = process.env.SOURCE_CHAIN_RPC_URL;
    const creditcoinRpcUrl =
      process.env.CREDITCOIN_RPC_URL ?? process.env.CREDITCOIN_PROVIDER_URL;
    const proofServiceUrl = process.env.CREDITCOIN_PROOF_SERVICE_URL;
    const proofTimeout = 20000; // 20 seconds, can be adjusted or made configurable

    if (!chainKey) {
      throw new Error("CREDITCOIN_CHAIN_KEY is required");
    }

    if (!chainId) {
      throw new Error("CREDITCOIN_CHAIN_ID is required");
    }

    if (!sourceRpcUrl) {
      throw new Error("SOURCE_CHAIN_RPC_URL is required");
    }

    if (!creditcoinRpcUrl) {
      throw new Error("CREDITCOIN_RPC_URL is required");
    }

    if (!proofServiceUrl) {
      throw new Error("CREDITCOIN_PROOF_SERVICE_URL is required");
    }

    // Initialize providers
    const sourceProvider = new ethers.JsonRpcProvider(sourceRpcUrl);
    const creditcoinProvider = new ethers.JsonRpcProvider(creditcoinRpcUrl);

    // Initialize prover - will be injected from SDK or initialized when needed
    const prover = new blockProver.PrecompileBlockProver(creditcoinProvider);

    creditcoinConfig = {
      chainKey,
      chainId,
      sourceProvider,
      creditcoinProvider,
      prover,
      proofServiceUrl,
      proofTimeout,
    };

    console.log("[CONFIG] Creditcoin configuration initialized successfully");
    console.log(`[CONFIG] Chain Key: ${chainKey}`);
    console.log(`[CONFIG] Chain ID: ${chainId}`);
    console.log(`[CONFIG] Proof Service URL: ${proofServiceUrl}`);
    console.log(`[CONFIG] Proof Timeout: ${proofTimeout}ms`);

    return creditcoinConfig;
  };

/**
 * Get current Creditcoin configuration
 * Throws if not initialized
 */
export const getCreditcoinConfig = (): CreditcoinConfig => {
  if (!creditcoinConfig) {
    throw new Error(
      "Creditcoin configuration not initialized. Call initializeCreditcoinConfig() on server startup.",
    );
  }
  return creditcoinConfig;
};

/**
 * Check if Creditcoin is configured and available
 */
export const isCreditcoinConfigured = (): boolean => {
  return creditcoinConfig !== null;
};

/**
 * Get configuration status for health checks
 */
export const getConfigStatus = () => {
  if (!creditcoinConfig) {
    return {
      initialized: false,
      message: "Creditcoin configuration not initialized",
    };
  }

  return {
    initialized: true,
    chainId: creditcoinConfig.chainId,
    chainKey: creditcoinConfig.chainKey.substring(0, 10) + "...", // Truncate for security
    proofServiceUrl: creditcoinConfig.proofServiceUrl,
    message: "Creditcoin verification ready",
  };
};
