import { useWallet } from '@solana/wallet-adapter-react'
import { useCallback, useMemo } from 'react'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react'
import { useSolanaWallet } from '@web3auth/modal/react/solana'

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
  userInfo?: any
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

  // Web3Auth hooks
  const { isConnected: web3AuthConnected, connect: web3AuthConnect } = useWeb3AuthConnect()
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect()
  const { userInfo } = useWeb3AuthUser()
  const { accounts, connection: web3AuthConnection } = useSolanaWallet()

  // Determine active wallet
  const walletState = useMemo(() => {
    if (traditionalConnected && traditionalPublicKey) {
      return {
        isConnected: true,
        walletType: 'traditional' as const,
        publicKey: traditionalPublicKey
      }
    }
    
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

  // Connect function
  const connect = useCallback(async () => {
    if (!traditionalWallet) {
      throw new Error('No wallet selected')
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

  // FIXED: Simplified transaction signing
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
      // FIXED: Use Web3Auth's native connection - this WORKS in v10.1!
      if (!web3AuthConnection) {
        throw new Error('Web3Auth connection not available')
      }
      
      // This is the correct way to send transactions with Web3Auth v10.1
      return await web3AuthConnection.sendTransaction(transaction, [])
    }
    
    throw new Error('No suitable wallet for transactions')
  }, [
    walletState.isConnected, 
    walletState.publicKey, 
    walletState.walletType, 
    traditionalSendTransaction,
    web3AuthConnection
  ])

  const canTransact = useMemo(() => {
    return walletState.isConnected && 
           walletState.publicKey !== null && 
           (
             (walletState.walletType === 'traditional') ||
             (walletState.walletType === 'web3auth' && !!web3AuthConnection)
           )
  }, [walletState.isConnected, walletState.publicKey, walletState.walletType, web3AuthConnection])

  return {
    isConnected: walletState.isConnected,
    publicKey: walletState.publicKey,
    walletType: walletState.walletType,
    connect,
    disconnect,
    signAndSendTransaction,
    canTransact,
    userInfo
  }
}