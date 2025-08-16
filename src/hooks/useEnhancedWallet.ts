// src/hooks/useEnhancedWallet.ts - FIXED with Web3Auth integration

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
// FIXED: Import Web3Auth hooks for Solana
import { useWeb3AuthConnect } from '@web3auth/modal/react';
import { useSolanaWallet } from '@web3auth/modal/react/solana';
// Import our wrapper hook for Web3Auth transactions
import { useWeb3AuthTransactions } from './useWeb3AuthTransactions';

interface EnhancedWalletState {
  // Wallet connection state
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  
  // Wallet info
  publicKey: PublicKey | null;
  walletName: string | null;
  walletType: 'traditional' | 'web3auth' | null;
  
  // Connection utilities
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  
  // Transaction utilities - FIXED to work with both wallet types
  signAndSendTransaction: (transaction: any, connection: Connection) => Promise<string>;
  
  // State checks
  canTransact: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnecting' | 'disconnected';
  
  // ADDED: Web3Auth specific data
  web3AuthAccounts?: string[] | null;
  web3AuthConnection?: Connection | null;
}

/**
 * Enhanced wallet hook with Web3Auth integration - FIXED VERSION
 */
export function useEnhancedWallet(): EnhancedWalletState {
  // Traditional wallet hooks
  const {
    publicKey: traditionalPublicKey,
    connected: traditionalConnected,
    connecting: traditionalConnecting,
    disconnecting: traditionalDisconnecting,
    wallet: traditionalWallet,
    connect: traditionalConnect,
    disconnect: traditionalDisconnect,
    sendTransaction: traditionalSendTransaction
  } = useWallet();

  // FIXED: Web3Auth hooks
  const { 
    isConnected: web3AuthConnected, 
    connect: web3AuthConnect, 
    loading: web3AuthConnecting 
  } = useWeb3AuthConnect();
  
  const { 
    accounts: web3AuthAccounts, 
    connection: web3AuthConnection 
  } = useSolanaWallet();
  
  // FIXED: Use our wrapper hook for Web3Auth transactions
  const { 
    signAndSendTransaction: web3AuthSignAndSend,
    isLoading: web3AuthSigning 
  } = useWeb3AuthTransactions();

  // FIXED: Determine which wallet is connected and get unified data
  const walletState = useMemo(() => {
    if (traditionalConnected && traditionalPublicKey) {
      return {
        isConnected: true,
        walletType: 'traditional' as const,
        publicKey: traditionalPublicKey,
        walletName: traditionalWallet?.adapter.name || 'Traditional Wallet'
      };
    }
    
    if (web3AuthConnected && web3AuthAccounts?.[0]) {
      return {
        isConnected: true,
        walletType: 'web3auth' as const,
        publicKey: new PublicKey(web3AuthAccounts[0]),
        walletName: 'Social Login'
      };
    }
    
    return {
      isConnected: false,
      walletType: null,
      publicKey: null,
      walletName: null
    };
  }, [traditionalConnected, traditionalPublicKey, traditionalWallet, web3AuthConnected, web3AuthAccounts]);

  // Enhanced connection function
  const connect = useCallback(async () => {
    try {
      // For now, default to traditional wallet connect
      // In a real app, you might want to show a modal to choose wallet type
      if (!traditionalWallet) {
        throw new Error('No wallet selected');
      }
      await traditionalConnect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }, [traditionalWallet, traditionalConnect]);

  // Enhanced disconnection function
  const disconnect = useCallback(async () => {
    try {
      if (walletState.walletType === 'traditional') {
        await traditionalDisconnect();
      } else if (walletState.walletType === 'web3auth') {
        // Web3Auth disconnect is handled in header component
        // This could be improved by importing the disconnect hook here too
        window.location.reload(); // Temporary solution
      }
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      throw error;
    }
  }, [walletState.walletType, traditionalDisconnect]);

  // FIXED: Enhanced transaction sending that works with both wallet types
  const signAndSendTransaction = useCallback(async (
    transaction: any, // Use any to avoid version conflicts
    connection: Connection
  ): Promise<string> => {
    if (!walletState.isConnected || !walletState.publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      if (walletState.walletType === 'traditional') {
        // Use traditional wallet - cast to avoid version conflicts
        const signature = await traditionalSendTransaction(transaction, connection);
        console.log('Traditional wallet transaction sent:', signature);
        return signature;
        
      } else if (walletState.walletType === 'web3auth') {
        // FIXED: Use Web3Auth transaction wrapper
        if (!web3AuthConnection) {
          throw new Error('Web3Auth connection not available');
        }
        
        const result = await web3AuthSignAndSend(transaction, web3AuthConnection);
        
        if (!result.success) {
          throw new Error(result.error || 'Web3Auth transaction failed');
        }
        
        if (!result.signature) {
          throw new Error('No signature returned from Web3Auth transaction');
        }
        
        console.log('Web3Auth transaction completed:', result.signature);
        return result.signature;
        
      } else {
        throw new Error('No suitable wallet available for transaction signing');
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }, [
    walletState.isConnected, 
    walletState.publicKey, 
    walletState.walletType, 
    traditionalSendTransaction, 
    web3AuthSignAndSend,
    web3AuthConnection
  ]);

  // Computed connection status
  const connectionStatus = useMemo((): 'connected' | 'connecting' | 'disconnecting' | 'disconnected' => {
    const isConnecting = traditionalConnecting || web3AuthConnecting;
    const isDisconnecting = traditionalDisconnecting;
    
    if (isConnecting) return 'connecting';
    if (isDisconnecting) return 'disconnecting';
    if (walletState.isConnected) return 'connected';
    return 'disconnected';
  }, [traditionalConnecting, web3AuthConnecting, traditionalDisconnecting, walletState.isConnected]);

  // Check if wallet can perform transactions
  const canTransact = useMemo(() => {
    return walletState.isConnected && 
           walletState.publicKey !== null && 
           !traditionalConnecting && 
           !web3AuthConnecting && 
           !traditionalDisconnecting &&
           !web3AuthSigning;
  }, [
    walletState.isConnected, 
    walletState.publicKey, 
    traditionalConnecting, 
    web3AuthConnecting, 
    traditionalDisconnecting,
    web3AuthSigning
  ]);

  return {
    // Connection state
    isConnected: walletState.isConnected,
    isConnecting: traditionalConnecting || web3AuthConnecting,
    isDisconnecting: traditionalDisconnecting,
    
    // Wallet info
    publicKey: walletState.publicKey,
    walletName: walletState.walletName,
    walletType: walletState.walletType,
    
    // Actions
    connect,
    disconnect,
    signAndSendTransaction,
    
    // Computed state
    canTransact,
    connectionStatus,
    
    // Web3Auth specific data
    web3AuthAccounts: web3AuthAccounts || null,
    web3AuthConnection: web3AuthConnection || null
  };
}

/**
 * Hook for wallet connection status messages - UPDATED
 */
export function useWalletStatusMessage(): string {
  const { connectionStatus, walletName, walletType } = useEnhancedWallet();
  
  return useMemo(() => {
    const walletDisplayName = walletType === 'web3auth' ? 'Social Login' : walletName;
    
    switch (connectionStatus) {
      case 'connecting':
        return walletDisplayName ? `Connecting to ${walletDisplayName}...` : 'Connecting to wallet...';
      case 'disconnecting':
        return 'Disconnecting...';
      case 'connected':
        return walletDisplayName ? `Connected to ${walletDisplayName}` : 'Wallet connected';
      case 'disconnected':
      default:
        return 'Wallet not connected';
    }
  }, [connectionStatus, walletName, walletType]);
}

/**
 * Hook for wallet action buttons - UPDATED
 */
export function useWalletActions() {
  const { connect, disconnect, isConnected, canTransact, walletType } = useEnhancedWallet();
  
  const connectWithFeedback = useCallback(async () => {
    try {
      await connect();
      // You could show a success toast here
    } catch (error) {
      // You could show an error toast here
      console.error('Connection failed:', error);
    }
  }, [connect]);

  const disconnectWithFeedback = useCallback(async () => {
    try {
      await disconnect();
      // You could show a success toast here
    } catch (error) {
      // You could show an error toast here
      console.error('Disconnection failed:', error);
    }
  }, [disconnect]);

  return {
    connect: connectWithFeedback,
    disconnect: disconnectWithFeedback,
    isConnected,
    canTransact,
    walletType,
    getActionLabel: () => isConnected ? 'Disconnect' : 'Connect Wallet'
  };
}