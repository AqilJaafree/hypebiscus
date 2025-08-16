// src/hooks/useWeb3AuthTransactions.ts
// Wrapper hook to handle Web3Auth transaction complexities

import { useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { useSignTransaction } from '@web3auth/modal/react/solana';

export interface Web3AuthTransactionResult {
  signature?: string;
  success: boolean;
  error?: string;
}

export function useWeb3AuthTransactions() {
  const { 
    signTransaction: web3AuthSignTransaction, 
    loading: web3AuthSigning,
    error: web3AuthError 
  } = useSignTransaction();

  const signAndSendTransaction = useCallback(async (
    transaction: any, // Use any to avoid version conflicts
    connection: Connection
  ): Promise<Web3AuthTransactionResult> => {
    if (!web3AuthSignTransaction) {
      return {
        success: false,
        error: 'Web3Auth sign transaction not available'
      };
    }

    try {
      // Sign the transaction with Web3Auth
      const result = await web3AuthSignTransaction(transaction as any);
      
      // Handle different possible return types from Web3Auth
      if (typeof result === 'string') {
        // If it returns a signature directly
        return {
          success: true,
          signature: result
        };
      }
      
      // If it returns a signed transaction object
      if (result && typeof result === 'object') {
        try {
          // Try to serialize and send the signed transaction
          let serializedTransaction: Buffer;
          
          // Use type assertion to avoid TypeScript version conflicts
          const signedTx = result as any;
          if (signedTx && typeof signedTx.serialize === 'function') {
            serializedTransaction = signedTx.serialize();
          } else {
            throw new Error('Cannot serialize signed transaction');
          }
          
          // Send the serialized transaction
          const signature = await connection.sendRawTransaction(serializedTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          });
          
          // Confirm the transaction
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          return {
            success: true,
            signature
          };
          
        } catch (sendError) {
          return {
            success: false,
            error: `Failed to send transaction: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`
          };
        }
      }
      
      return {
        success: false,
        error: 'Unexpected transaction result format from Web3Auth'
      };
      
    } catch (signError) {
      return {
        success: false,
        error: `Failed to sign transaction: ${signError instanceof Error ? signError.message : 'Unknown error'}`
      };
    }
  }, [web3AuthSignTransaction]);

  return {
    signAndSendTransaction,
    isLoading: web3AuthSigning,
    error: web3AuthError
  };
}