import { useWallet } from '@solana/wallet-adapter-react'
import { useCallback, useMemo } from 'react'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react'
// CORRECT: Use the official Solana hooks from Web3Auth Modal
import { useSolanaWallet, useSignAndSendTransaction } from '@web3auth/modal/react/solana'

interface SimpleWalletState {
  // Basic state
  isConnected: boolean
  publicKey: PublicKey | null
  walletType: 'traditional' | 'web3auth' | null
  
  // Actions
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signAndSendTransaction: (transaction: Transaction, connection?: Connection) => Promise<string>
  
  // Additional info
  canTransact: boolean
  userInfo?: Record<string, unknown> | null // FIXED: Allow null to match Web3Auth type
  web3AuthConnection?: Connection | null
}

export function useEnhancedWallet(): SimpleWalletState {
  // Traditional wallet
  const {
    publicKey: traditionalPublicKey,
    connected: traditionalConnected,
    wallet: traditionalWallet,
    connect: traditionalConnect,
    disconnect: traditionalDisconnect,
    sendTransaction: traditionalSendTransaction
  } = useWallet()

  // Web3Auth hooks - CORRECT: Use the official pattern
  const { isConnected: web3AuthConnected } = useWeb3AuthConnect()
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect()
  const { userInfo } = useWeb3AuthUser()
  
  // CORRECT: Use official Solana hooks from Web3Auth
  const { accounts, connection: web3AuthConnection } = useSolanaWallet()
  const { signAndSendTransaction: web3AuthSignAndSend } = useSignAndSendTransaction()

  // Determine active wallet
  const walletState = useMemo(() => {
    if (traditionalConnected && traditionalPublicKey) {
      return {
        isConnected: true,
        walletType: 'traditional' as const,
        publicKey: traditionalPublicKey
      }
    }
    
    // CORRECT: Check Web3Auth using accounts array
    if (web3AuthConnected && accounts?.[0]) {
      return {
        isConnected: true,
        walletType: 'web3auth' as const,
        publicKey: new PublicKey(accounts[0])
      }
    }
    
    return {
      isConnected: false,
      walletType: null,
      publicKey: null
    }
  }, [traditionalConnected, traditionalPublicKey, web3AuthConnected, accounts])

  // Connect function - only works for traditional wallets
  const connect = useCallback(async () => {
    if (!traditionalWallet) {
      throw new Error('No wallet selected. Web3Auth connects automatically.')
    }
    await traditionalConnect()
  }, [traditionalWallet, traditionalConnect])

  // Disconnect function
  const disconnect = useCallback(async () => {
    if (walletState.walletType === 'traditional') {
      await traditionalDisconnect()
    } else if (walletState.walletType === 'web3auth') {
      await web3AuthDisconnect()
    }
  }, [walletState.walletType, traditionalDisconnect, web3AuthDisconnect])

  // CORRECT: Transaction signing using official Web3Auth hooks
  const signAndSendTransaction = useCallback(async (
    transaction: Transaction,
    connection?: Connection
  ): Promise<string> => {
    if (!walletState.isConnected || !walletState.publicKey) {
      throw new Error('Wallet not connected')
    }

    if (walletState.walletType === 'traditional') {
      // Use traditional wallet
      const conn = connection || new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      )
      return await traditionalSendTransaction(transaction, conn)
      
    } else if (walletState.walletType === 'web3auth') {
      // CORRECT: Use the official Web3Auth hook for signing and sending
      try {
        // The official hook returns { data, error, loading }
        // We need to call it and wait for the result
        const result = await web3AuthSignAndSend(transaction)
        return result // This should be the transaction signature
      } catch (error) {
        console.error('Web3Auth transaction failed:', error)
        throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    throw new Error('No suitable wallet for transactions')
  }, [
    walletState.isConnected, 
    walletState.publicKey, 
    walletState.walletType, 
    traditionalSendTransaction,
    web3AuthSignAndSend
  ])

  const canTransact = useMemo(() => {
    return walletState.isConnected && 
           walletState.publicKey !== null && 
           (
             (walletState.walletType === 'traditional') ||
             (walletState.walletType === 'web3auth' && !!web3AuthSignAndSend && web3AuthConnection !== null)
           )
  }, [walletState.isConnected, walletState.publicKey, walletState.walletType, web3AuthSignAndSend, web3AuthConnection])

  return {
    isConnected: walletState.isConnected,
    publicKey: walletState.publicKey,
    walletType: walletState.walletType,
    connect,
    disconnect,
    signAndSendTransaction,
    canTransact,
    userInfo,
    web3AuthConnection
  }
}