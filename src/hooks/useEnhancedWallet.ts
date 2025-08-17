// src/hooks/useEnhancedWallet.ts - Updated with proper Web3Auth Modal integration

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
// Updated Web3Auth imports for modal package
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react';
import { useSolanaWallet } from '@web3auth/modal/react/solana';
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
  
  // Transaction utilities - Works with both wallet types
  signAndSendTransaction: (transaction: any, connection: Connection) => Promise<string>;
  
  // State checks
  canTransact: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnecting' | 'disconnected';
  
  // Web3Auth specific data
  web3AuthAccounts?: string[] | null;
  web3AuthConnection?: Connection | null;
  userInfo?: any;
}

/**
 * Enhanced wallet hook with proper Web3Auth Modal integration
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

  // Web3Auth Modal hooks - Updated imports
  const { 
    isConnected: web3AuthConnected, 
    connect: web3AuthConnect, 
    loading: web3AuthConnecting 
  } = useWeb3AuthConnect();
  
  const { 
    disconnect: web3AuthDisconnect, 
    loading: web3AuthDisconnecting 
  } = useWeb3AuthDisconnect();
  
  const { userInfo } = useWeb3AuthUser();
  
  const { 
    accounts: web3AuthAccounts, 
    connection: web3AuthConnection
  } = useSolanaWallet();

  // Web3Auth transaction helper
  const { signAndSendTransaction: web3AuthSignAndSend, isAvailable: web3AuthTxAvailable } = useWeb3AuthTransactions();

  // Determine which wallet is connected and get unified data
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
      // You could show a modal to choose wallet type here
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
        await web3AuthDisconnect();
      }
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      throw error;
    }
  }, [walletState.walletType, traditionalDisconnect, web3AuthDisconnect]);

  // Enhanced transaction sending that works with both wallet types
  const signAndSendTransaction = useCallback(async (
    transaction: any,
    connection: Connection
  ): Promise<string> => {
    if (!walletState.isConnected || !walletState.publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      if (walletState.walletType === 'traditional') {
        // Use traditional wallet
        const signature = await traditionalSendTransaction(transaction, connection);
        console.log('Traditional wallet transaction sent:', signature);
        return signature;
        
      } else if (walletState.walletType === 'web3auth') {
        // Note: Web3Auth Modal v10.1 has limited transaction signing support
        // For now, we'll throw an informative error
        throw new Error('Web3Auth transaction signing is not fully supported in v10.1. Please use traditional wallets for transactions or upgrade to a newer Web3Auth version.');
        
        /* 
        // Uncomment and modify this section when Web3Auth v10.1 transaction signing is properly configured
        if (!web3AuthConnection || !web3AuthTxAvailable) {
          throw new Error('Web3Auth connection or transaction capability not available');
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
        */
        
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
    web3AuthConnection,
    web3AuthSignAndSend,
    web3AuthTxAvailable
  ]);

  // Computed connection status
  const connectionStatus = useMemo((): 'connected' | 'connecting' | 'disconnecting' | 'disconnected' => {
    const isConnecting = traditionalConnecting || web3AuthConnecting;
    const isDisconnecting = traditionalDisconnecting || web3AuthDisconnecting;
    
    if (isConnecting) return 'connecting';
    if (isDisconnecting) return 'disconnecting';
    if (walletState.isConnected) return 'connected';
    return 'disconnected';
  }, [traditionalConnecting, web3AuthConnecting, traditionalDisconnecting, web3AuthDisconnecting, walletState.isConnected]);

  // Check if wallet can perform transactions
  const canTransact = useMemo(() => {
    // For now, only traditional wallets can transact due to Web3Auth v10.1 limitations
    return walletState.isConnected && 
           walletState.publicKey !== null && 
           walletState.walletType === 'traditional' && // Only traditional wallets for now
           !traditionalConnecting && 
           !web3AuthConnecting && 
           !traditionalDisconnecting &&
           !web3AuthDisconnecting;
  }, [
    walletState.isConnected, 
    walletState.publicKey, 
    walletState.walletType,
    traditionalConnecting, 
    web3AuthConnecting, 
    traditionalDisconnecting,
    web3AuthDisconnecting
  ]);

  return {
    // Connection state
    isConnected: walletState.isConnected,
    isConnecting: traditionalConnecting || web3AuthConnecting,
    isDisconnecting: traditionalDisconnecting || web3AuthDisconnecting,
    
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
    web3AuthConnection: web3AuthConnection || null,
    userInfo
  };
}

/**
 * Hook for wallet connection status messages
 */
export function useWalletStatusMessage(): string {
  const { connectionStatus, walletName, walletType, userInfo } = useEnhancedWallet();
  
  return useMemo(() => {
    const walletDisplayName = walletType === 'web3auth' 
      ? `Social Login${userInfo?.email ? ` (${userInfo.email})` : ''}` 
      : walletName;
    
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
  }, [connectionStatus, walletName, walletType, userInfo]);
}

/**
 * Hook to get transaction capability message
 */
export function useTransactionCapabilityMessage(): string {
  const { walletType, isConnected, canTransact } = useEnhancedWallet();
  
  return useMemo(() => {
    if (!isConnected) {
      return 'Please connect a wallet to perform transactions';
    }
    
    if (walletType === 'web3auth') {
      return 'Web3Auth transactions require a traditional wallet. Please connect Phantom, Solflare, or another Solana wallet to perform transactions.';
    }
    
    if (!canTransact) {
      return 'Wallet is not ready for transactions';
    }
    
    return 'Ready to transact';
  }, [walletType, isConnected, canTransact]);
}

/**
 * Hook for wallet action buttons
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