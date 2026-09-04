/**
 * Example React Component: Transaction Verification Display
 * This demonstrates how to use the txStateClient to check verification status
 * and update the UI accordingly
 */

import React, { useState, useEffect } from 'react';
import {
  checkTxVerification,
  saveTxState,
  getStatusText,
  getStatusColor,
  type VerificationResponse,
  type TxState,
} from '../client/txStateClient';

interface TxVerificationDisplayProps {
  txHash: string;
  onVerificationChange?: (isVerified: boolean, state: TxState) => void;
  autoRefreshInterval?: number; // in milliseconds
}

/**
 * Main Component: Display transaction verification status with auto-refresh
 */
export const TxVerificationDisplay: React.FC<TxVerificationDisplayProps> = ({
  txHash,
  onVerificationChange,
  autoRefreshInterval = 5000, // Refresh every 5 seconds by default
}) => {
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkVerification = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await checkTxVerification(txHash);
      setVerification(result);
      setLastChecked(new Date());

      // Callback when verification status changes
      if (onVerificationChange) {
        onVerificationChange(result.isVerified, result.state);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Initial check on mount
  useEffect(() => {
    checkVerification();
  }, [txHash]);

  // Auto-refresh verification status
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const interval = setInterval(() => {
      checkVerification();
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [txHash, autoRefreshInterval]);

  if (loading && !verification) {
    return (
      <div className="tx-verification-container loading">
        <div className="spinner"></div>
        <p>Checking verification status...</p>
      </div>
    );
  }

  if (error && !verification) {
    return (
      <div className="tx-verification-container error">
        <p>❌ Error: {error}</p>
        <button onClick={checkVerification}>Retry</button>
      </div>
    );
  }

  if (!verification) {
    return null;
  }

  const statusColor = getStatusColor(verification.state);
  const statusText = getStatusText(verification.state);

  return (
    <div className={`tx-verification-container status-${verification.state}`}>
      <div className="verification-header">
        <h3>Transaction Verification</h3>
        <button
          onClick={checkVerification}
          disabled={loading}
          className="refresh-btn"
          title="Refresh verification status"
        >
          🔄 {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      <div className="verification-content">
        {/* Transaction Hash */}
        <div className="tx-hash">
          <label>Hash:</label>
          <code>{txHash}</code>
          <button
            onClick={() => navigator.clipboard.writeText(txHash)}
            className="copy-btn"
            title="Copy to clipboard"
          >
            📋
          </button>
        </div>

        {/* Status Badge */}
        <div className={`status-badge status-${statusColor}`}>
          <span className="status-icon">
            {verification.isVerified ? '✓' : '✗'}
          </span>
          <span className="status-text">{statusText}</span>
        </div>

        {/* Status Message */}
        <div className="status-message">
          {verification.isVerified ? (
            <div className="verified-message">
              <p>✓ This transaction has been verified on the blockchain!</p>
              <p className="confidence">Status is confirmed and trusted.</p>
            </div>
          ) : verification.state === 'pending' ? (
            <div className="pending-message">
              <p>⏳ Verification is in progress.</p>
              <p className="info">Your transaction is being processed...</p>
            </div>
          ) : verification.state === 'not_verified' ? (
            <div className="not-verified-message">
              <p>✗ This transaction could not be verified.</p>
              <p className="warning">There may be an issue with this transaction.</p>
            </div>
          ) : (
            <div className="unavailable-message">
              <p>? Transaction data is not available.</p>
              <p className="info">The transaction may not exist in our database.</p>
            </div>
          )}
        </div>

        {/* Transaction Details */}
        {verification.transaction && (
          <div className="transaction-details">
            <h4>Transaction Details</h4>
            <div className="details-grid">
              {verification.transaction.address && (
                <div className="detail-item">
                  <label>Address:</label>
                  <span>{verification.transaction.address}</span>
                </div>
              )}
              {verification.transaction.network && (
                <div className="detail-item">
                  <label>Network:</label>
                  <span>{verification.transaction.network}</span>
                </div>
              )}
              {verification.transaction.chainId && (
                <div className="detail-item">
                  <label>Chain ID:</label>
                  <span>{verification.transaction.chainId}</span>
                </div>
              )}
              {verification.transaction.createdAt && (
                <div className="detail-item">
                  <label>Created:</label>
                  <span>{new Date(verification.transaction.createdAt).toLocaleString()}</span>
                </div>
              )}
              {verification.transaction.updatedAt && (
                <div className="detail-item">
                  <label>Last Updated:</label>
                  <span>{new Date(verification.transaction.updatedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Metadata */}
            {verification.transaction.metadata &&
              Object.keys(verification.transaction.metadata).length > 0 && (
                <div className="metadata">
                  <h5>Additional Metadata</h5>
                  <pre>{JSON.stringify(verification.transaction.metadata, null, 2)}</pre>
                </div>
              )}
          </div>
        )}

        {/* Last Checked */}
        {lastChecked && (
          <div className="last-checked">
            Last checked: {lastChecked.toLocaleTimeString()}
          </div>
        )}
      </div>

      <style jsx>{`
        .tx-verification-container {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          margin: 16px 0;
          background-color: #fafafa;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
        }

        .tx-verification-container.loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100px;
          color: #666;
        }

        .tx-verification-container.error {
          background-color: #fff3cd;
          border-color: #ffc107;
          color: #856404;
        }

        .tx-verification-container.status-verified {
          background-color: #d4edda;
          border-color: #28a745;
        }

        .tx-verification-container.status-pending {
          background-color: #fff3cd;
          border-color: #ffc107;
        }

        .tx-verification-container.status-not_verified {
          background-color: #f8d7da;
          border-color: #f5c6cb;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 10px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .verification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          padding-bottom: 12px;
        }

        .verification-header h3 {
          margin: 0;
          font-size: 18px;
        }

        .refresh-btn {
          background: none;
          border: 1px solid #ccc;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.3s;
        }

        .refresh-btn:hover:not(:disabled) {
          background-color: rgba(0, 0, 0, 0.05);
          border-color: #999;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .verification-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .tx-hash {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tx-hash label {
          font-weight: bold;
          min-width: 60px;
        }

        .tx-hash code {
          background-color: rgba(0, 0, 0, 0.05);
          padding: 4px 8px;
          border-radius: 4px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          word-break: break-all;
          flex: 1;
        }

        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          padding: 2px 8px;
          transition: transform 0.2s;
        }

        .copy-btn:hover {
          transform: scale(1.2);
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 6px;
          font-weight: bold;
          font-size: 16px;
        }

        .status-badge.status-success {
          background-color: #28a745;
          color: white;
        }

        .status-badge.status-warning {
          background-color: #ffc107;
          color: #333;
        }

        .status-badge.status-error {
          background-color: #dc3545;
          color: white;
        }

        .status-badge.status-default {
          background-color: #6c757d;
          color: white;
        }

        .status-icon {
          font-size: 20px;
        }

        .status-message {
          padding: 12px;
          border-radius: 4px;
          line-height: 1.6;
        }

        .verified-message {
          background-color: rgba(40, 167, 69, 0.1);
          color: #155724;
        }

        .pending-message {
          background-color: rgba(255, 193, 7, 0.1);
          color: #856404;
        }

        .not-verified-message {
          background-color: rgba(220, 53, 69, 0.1);
          color: #721c24;
        }

        .unavailable-message {
          background-color: rgba(108, 117, 125, 0.1);
          color: #383d41;
        }

        .status-message p {
          margin: 4px 0;
        }

        .status-message .confidence,
        .status-message .warning,
        .status-message .info {
          font-size: 14px;
          opacity: 0.8;
          margin-top: 8px !important;
        }

        .transaction-details {
          background-color: rgba(0, 0, 0, 0.03);
          padding: 12px;
          border-radius: 4px;
          border-left: 3px solid #3498db;
        }

        .transaction-details h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          text-transform: uppercase;
          color: #666;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 12px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
        }

        .detail-item label {
          font-weight: bold;
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }

        .detail-item span {
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          word-break: break-all;
          background-color: rgba(0, 0, 0, 0.02);
          padding: 4px;
          border-radius: 2px;
        }

        .metadata {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
        }

        .metadata h5 {
          margin: 0 0 8px 0;
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
        }

        .metadata pre {
          background-color: rgba(0, 0, 0, 0.05);
          padding: 8px;
          border-radius: 3px;
          overflow-x: auto;
          font-size: 11px;
          margin: 0;
        }

        .last-checked {
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .error p {
          margin: 0;
        }
      `}</style>
    </div>
  );
};

/**
 * Example Hook: Simpler hook for just the verification status
 */
export const useSimpleVerification = (txHash: string) => {
  const [isVerified, setIsVerified] = React.useState(false);
  const [state, setState] = React.useState<TxState>('unavailable');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const check = async () => {
      try {
        const result = await checkTxVerification(txHash);
        setIsVerified(result.isVerified);
        setState(result.state);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [txHash]);

  return { isVerified, state, loading };
};

/**
 * Example: Minimal Component
 */
export const TxStatusBadge: React.FC<{ txHash: string }> = ({ txHash }) => {
  const { isVerified, state, loading } = useSimpleVerification(txHash);

  if (loading) return <span>Loading...</span>;

  return (
    <span className={`badge badge-${state}`}>
      {isVerified ? '✓ Verified' : `${getStatusText(state)}`}
    </span>
  );
};

/**
 * Example Usage in a Page:
 * 
 * import { TxVerificationDisplay } from './TxVerificationDisplay';
 * 
 * function MyPage() {
 *   const txHash = '0x1234567890abcdef';
 * 
 *   return (
 *     <div>
 *       <h1>My Transaction</h1>
 *       <TxVerificationDisplay
 *         txHash={txHash}
 *         autoRefreshInterval={5000}
 *         onVerificationChange={(isVerified, state) => {
 *           if (isVerified) {
 *             console.log('Transaction verified!');
 *           }
 *         }}
 *       />
 *     </div>
 *   );
 * }
 */
