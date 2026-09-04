# Backend Creditcoin Attestation Verification Guide

## Overview

The Creditcoin attestation verification has been refactored to run entirely on the **backend**. The backend now:
- Receives verification requests from the frontend
- Uses the Creditcoin SDK to perform verification
- Saves verification results directly to the database
- Returns results to the frontend

The frontend simply displays verification status without performing the actual verification logic.

## Architecture

```
Frontend                          Backend                         Creditcoin Network
─────────────────────────────────────────────────────────────────────────────
  │                                  │
  ├─ POST /api/verify/single    ──→ │ ┌────────────────────────────┐
  │ { txHash }                       │ │ 1. Get transaction from   │
  │                                  │ │    source chain           │
  │                         Results  │ │ 2. Generate proof         │
  │ ← { verified, state }    ──────── │ │ 3. Verify on Creditcoin   │
  │                                  │ │ 4. Save to database       │
  │                                  │ └────────────────────────────→ Creditcoin
  │                                  │
  └─ GET /api/verify/status    ──→ │ Query database
    /0x123abc                        │ Return tx state
                         Status ←─── │
```

## Setup & Configuration

### 1. Environment Variables

Add to your `.env` file:

```env
# Creditcoin Configuration
CREDITCOIN_CHAIN_KEY=<your-chain-key>
CREDITCOIN_CHAIN_ID=<chain-id>
CREDITCOIN_PROOF_SERVICE_URL=https://prover.cc3-testnet.creditcoin.network
CREDITCOIN_PROOF_TIMEOUT=10000

# MongoDB
MONGO_DB_URL=mongodb://...

# Server
PORT=3000
HOST=0.0.0.0
```

### 2. Initialize Creditcoin Config in server.ts

You need to initialize the Creditcoin SDK providers before the server starts:

```typescript
import Fastify from "fastify";
import { ethers } from "ethers";
import { creditcoinSetup } from "@gluwa/usc-sdk";

const app = Fastify({ logger: true });

// Initialize Creditcoin providers
async function initializeCreditcoinConfig() {
  // Source chain provider (e.g., Ethereum)
  const sourceProvider = new ethers.JsonRpcProvider(
    process.env.SOURCE_CHAIN_RPC_URL
  );

  // Creditcoin provider
  const creditcoinProvider = new ethers.JsonRpcProvider(
    process.env.CREDITCOIN_RPC_URL
  );

  // Initialize SDK
  const { prover, chainKey } = await creditcoinSetup(creditcoinProvider);

  // Attach to app for use in controllers
  app.creditcoinConfig = {
    chainKey,
    chainId: process.env.CREDITCOIN_CHAIN_ID,
    sourceProvider,
    creditcoinProvider,
    prover,
    proofServiceUrl: process.env.CREDITCOIN_PROOF_SERVICE_URL,
    proofTimeout: parseInt(process.env.CREDITCOIN_PROOF_TIMEOUT || "10000"),
  };
}

async function startServer() {
  // Initialize Creditcoin before starting routes
  await initializeCreditcoinConfig();

  // ... rest of server setup
}
```

## API Endpoints

### 1. Verify Single Transaction

**POST** `/api/verify/single`

Request:
```json
{
  "txHash": "0x1234567890abcdef...",
  "address": "0xuser...",
  "network": "ethereum",
  "metadata": {
    "customField": "value"
  }
}
```

Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Transaction verified successfully.",
  "data": {
    "success": true,
    "txHash": "0x1234567890abcdef",
    "verified": true,
    "state": "verified",
    "blockNumber": 12345,
    "headerNumber": 100,
    "chainKey": "0x...",
    "proofData": { /* proof details */ },
    "timestamp": "2024-..."
  }
}
```

### 2. Verify Batch Transactions

**POST** `/api/verify/batch`

Request:
```json
{
  "txHashes": [
    "0x1234567890abcdef",
    "0x2345678901bcdef0",
    "0x3456789012cdef01"
  ],
  "network": "ethereum",
  "metadata": {
    "batchId": "batch-001"
  }
}
```

Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Batch verification completed. 3/3 successful.",
  "data": {
    "success": true,
    "verified": true,
    "txCount": 3,
    "results": [
      {
        "success": true,
        "txHash": "0x1234567890abcdef",
        "verified": true,
        "state": "verified",
        "timestamp": "2024-..."
      },
      // ... more results
    ],
    "chainKey": "0x...",
    "timestamp": "2024-..."
  }
}
```

### 3. Retry Failed Verification

**POST** `/api/verify/retry/:txHash`

Request:
```bash
POST /api/verify/retry/0x1234567890abcdef
```

Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Retry verification successful.",
  "data": {
    "success": true,
    "txHash": "0x1234567890abcdef",
    "verified": true,
    "state": "verified",
    "timestamp": "2024-..."
  }
}
```

### 4. Get Verification Status

**GET** `/api/verify/status/:txHash`

Request:
```bash
GET /api/verify/status/0x1234567890abcdef
```

Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Verification status retrieved successfully.",
  "data": {
    "txHash": "0x1234567890abcdef",
    "state": "verified",
    "verified": true,
    "details": {
      "_id": "...",
      "txHash": "0x1234567890abcdef",
      "state": "verified",
      "address": "0xuser",
      "network": "ethereum",
      "chainId": "1",
      "metadata": { /* stored metadata */ },
      "createdAt": "2024-...",
      "updatedAt": "2024-..."
    }
  }
}
```

## Verification States

After verification, transactions are stored with one of these states:

| State | Meaning |
|-------|---------|
| `verified` | Transaction successfully verified on Creditcoin |
| `not_verified` | Verification failed, transaction could not be verified |
| `pending` | Verification not yet attempted or in progress |
| `unavailable` | Transaction not found in database |

## Verification Workflow

### Step-by-Step Process

1. **Frontend** sends verification request:
   ```typescript
   const response = await fetch('/api/verify/single', {
     method: 'POST',
     body: JSON.stringify({ txHash: '0x...' })
   });
   ```

2. **Backend** receives request and:
   - Validates transaction hash
   - Initializes Creditcoin SDK providers
   - Fetches transaction from source chain
   - Generates Merkle proof
   - Verifies proof on Creditcoin
   - Saves result to database

3. **Database** stores:
   ```json
   {
     "txHash": "0x...",
     "state": "verified",
     "metadata": {
       "blockNumber": 12345,
       "headerNumber": 100,
       "verifiedAt": "2024-...",
       "verificationMethod": "creditcoin-sdk"
     }
   }
   ```

4. **Frontend** checks status:
   ```typescript
   const status = await fetch('/api/verify/status/0x...');
   ```

## Backend Service Functions

### Location: `src/services/attestcoin-verification.service.ts`

#### `verifySingleTransaction(txHash, config, progressCallback?, metadata?)`

Verify a single transaction and save result to database.

```typescript
import { verifySingleTransaction } from './services/attestcoin-verification.service';

const result = await verifySingleTransaction(
  '0x123abc',
  creditcoinConfig,
  (step, message) => {
    console.log(`Step ${step}: ${message}`);
  },
  { customMetadata: 'value' }
);

console.log(result.verified);  // true/false
console.log(result.state);     // 'verified' | 'not_verified' | 'pending'
```

#### `verifyBatchTransactions(txHashes, config, progressCallback?, metadata?)`

Verify multiple transactions efficiently in batch.

```typescript
const result = await verifyBatchTransactions(
  ['0x123abc', '0x456def', '0x789ghi'],
  creditcoinConfig,
  progressCallback
);

console.log(result.txCount);    // 3
console.log(result.results);    // array of verification results
```

#### `retryVerification(txHash, config, progressCallback?)`

Retry verification for a failed transaction.

```typescript
const result = await retryVerification('0x123abc', creditcoinConfig);
```

## Frontend Integration

### Simple Status Check

```typescript
// Check current verification status (no new verification)
async function checkStatus(txHash) {
  const response = await fetch(`/api/verify/status/${txHash}`);
  const result = await response.json();
  
  return {
    isVerified: result.data.verified,
    state: result.data.state
  };
}
```

### Request Verification

```typescript
// Ask backend to verify the transaction
async function requestVerification(txHash) {
  const response = await fetch('/api/verify/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash })
  });

  const result = await response.json();
  
  if (result.success && result.data.verified) {
    console.log('✓ Transaction verified!');
  } else {
    console.log('✗ Verification failed');
  }
}
```

### React Hook Example

```typescript
import { useEffect, useState } from 'react';

export const useVerificationStatus = (txHash) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/verify/status/${txHash}`);
      const result = await response.json();
      setStatus(result.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const requestVerification = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/verify/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash })
      });
      const result = await response.json();
      setStatus(result.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [txHash]);

  return { status, loading, error, requestVerification };
};
```

### React Component Example

```typescript
import React from 'react';
import { useVerificationStatus } from './hooks/useVerificationStatus';

function TransactionVerifier({ txHash }) {
  const { status, loading, error, requestVerification } = useVerificationStatus(txHash);

  return (
    <div className="verifier">
      <h3>Transaction Verification</h3>
      <p>Hash: {txHash}</p>

      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}

      {status && (
        <div>
          <p>State: {status.state}</p>
          <p>Verified: {status.verified ? '✓ Yes' : '✗ No'}</p>
        </div>
      )}

      <button onClick={requestVerification} disabled={loading}>
        {loading ? 'Verifying...' : 'Start Verification'}
      </button>
    </div>
  );
}

export default TransactionVerifier;
```

## Comparison: Old vs New Flow

### Old Flow (Frontend-based)

```
Frontend                          Creditcoin
  │
  ├─ useCallback verifySingle()
  │ ├─ Call SDK functions
  │ ├─ Generate proofs
  │ └─ Update local state
  │
  └─ User sees result
     (no backend involvement)
```

**Problems:**
- Heavy computation in browser
- No persistence
- No audit trail
- Backend doesn't know about verifications

### New Flow (Backend-based)

```
Frontend                 Backend              Creditcoin    Database
  │                        │                     │             │
  ├─ POST /verify/single ─→ │ ┌────────────────→ │             │
  │                        │ │ Get tx & verify   │             │
  │                        │ │ Generate proof    │             │
  │                 Result │ │ Verify proof      │             │
  │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ → Save state ─→ │
  │                        │                     │             │
  └─ GET /verify/status ──→ │ Query database ────────────────→ │
    Result ←─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
```

**Benefits:**
- ✓ Backend handles computation
- ✓ Results persisted in database
- ✓ Full audit trail
- ✓ Can retry failed verifications
- ✓ Batch verification support
- ✓ Status available to all users

## Error Handling

### Common Error Scenarios

1. **Missing Creditcoin Configuration**
   ```
   Error: Creditcoin configuration not initialized
   → Initialize providers before starting server
   ```

2. **Invalid Transaction Hash**
   ```
   Error: Could not retrieve block number for transaction
   → Verify txHash exists on source chain
   ```

3. **Proof Generation Failed**
   ```
   Error: Proof generation failed: timeout
   → Increase proofTimeout in config
   → Check proof service connectivity
   ```

4. **Transaction Not Found in Database**
   ```
   State: unavailable
   → Transaction hasn't been saved yet
   ```

## Monitoring & Logging

All verification operations log progress:

```typescript
// Backend logs
[PROGRESS] Step 0: Connecting to Creditcoin...
[PROGRESS] Step 1: Finding transaction block...
[PROGRESS] Step 2: Waiting for block attestation...
[PROGRESS] Step 3: Generating Merkle proof...
[PROGRESS] Step 4: Verifying proof on Creditcoin...
[PROGRESS] Step 5: Verification complete: verified
```

View logs in your application's logging system (Winston, Pino, etc.)

## Migration Checklist

If migrating from frontend-based verification:

- [ ] Remove verification logic from React components
- [ ] Update environment variables with Creditcoin config
- [ ] Initialize Creditcoin SDK in `server.ts`
- [ ] Remove old frontend crypto/proof generation code
- [ ] Update frontend components to call new API endpoints
- [ ] Add error handling for verification failures
- [ ] Test verification workflow end-to-end
- [ ] Set up monitoring for verification metrics
- [ ] Document any custom verification logic

## Performance Considerations

### Single Transaction Verification
- Time: ~10-30 seconds (depends on block confirmations)
- Network requests: Multiple calls to proof service
- Database writes: 1 update

### Batch Verification (10 transactions)
- Time: ~15-40 seconds (more efficient per tx)
- Network requests: Fewer than 10 individual verifications
- Database writes: 10 updates (can be optimized)

### Recommendations
- Use batch verification for multiple transactions
- Implement retry logic for transient failures
- Cache verification results in frontend
- Use WebSockets for real-time progress updates (future enhancement)

## Next Steps

1. **Initialize Creditcoin config** in your server startup
2. **Test endpoints** with curl or Postman
3. **Update frontend** to use new API endpoints
4. **Monitor verification metrics** in production
5. **Consider enhancement features**:
   - WebSocket progress streaming
   - Scheduled batch verifications
   - Verification analytics dashboard
