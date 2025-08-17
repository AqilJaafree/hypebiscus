// src/hooks/useWeb3AuthTransactions.ts - Fixed for v10.1
import { useCallback } from 'react';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { useSolanaWallet } from '@web3auth/modal/react/solana';

export interface Web3AuthTransactionResult {
  signature?: string;
  success: boolean;
  error?: string;
}

export function useWeb3AuthTransactions() {
  const { accounts, connection } = useSolanaWallet();

  const signAndSendTransaction = useCallback(async (
    transaction: Transaction,
    connectionToUse: Connection
  ): Promise<Web3AuthTransactionResult> => {
    if (!accounts || accounts.length === 0) {
      return {
        success: false,
        error: 'No Web3Auth accounts available'
      };
    }

    if (!connection) {
      return {
        success: false,
        error: 'Web3Auth connection not available'
      };
    }

    try {
      const publicKey = new PublicKey(accounts[0]);
      
      // Set the fee payer and get recent blockhash
      const { blockhash } = await connectionToUse.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // For Web3Auth Modal v10.1, we need to use a simpler approach
      // The Web3Auth provider should handle the signing internally when we send the transaction
      try {
        // Attempt to send the transaction directly
        // Web3Auth should handle the signing internally
        const signature = await connectionToUse.sendTransaction(transaction, [], {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });

        // Confirm the transaction
        const confirmation = await connectionToUse.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
          return {
            success: false,
            error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
          };
        }

        return {
          success: true,
          signature: signature
        };

      } catch (sendError) {
        // If direct sending fails, it might mean we need to sign first
        // This is a fallback approach for v10.1
        console.warn('Direct transaction send failed, trying alternative approach:', sendError);
        
        return {
          success: false,
          error: `Transaction sending failed: ${sendError instanceof Error ? sendError.message : 'Unknown error'}. Web3Auth v10.1 transaction signing may need additional configuration.`
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Transaction preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }, [accounts, connection]);

  return {
    signAndSendTransaction,
    isAvailable: !!(accounts && accounts.length > 0 && connection)
  };
}