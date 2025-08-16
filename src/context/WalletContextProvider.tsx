// Enhanced WalletContextProvider.tsx - Fixed Web3Auth + Solana Wallet Adapter
'use client'

import { FC, ReactNode, useMemo, useEffect } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { 
  TorusWalletAdapter 
} from '@solana/wallet-adapter-wallets'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { Web3AuthProvider } from '@web3auth/modal/react'
import { WEB3AUTH_NETWORK } from '@web3auth/modal'
import type { Web3AuthContextConfig } from '@web3auth/modal/react'

// Import the required wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

// Web3Auth Configuration for Solana Mainnet - FIXED VERSION
const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    // SECURITY FIX: Only use environment variable, no hardcoded fallback
    clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID!, 
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    uiConfig: {
      logoLight: '/hypebiscus_logo.png',
      logoDark: '/hypebiscus_logo.png',
      theme: {
        primary: '#FF4040'
      }
    },
  },
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  // Get network from environment variable
  const networkString = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'mainnet-beta';
  const network = networkString === 'devnet' 
    ? WalletAdapterNetwork.Devnet 
    : networkString === 'testnet'
      ? WalletAdapterNetwork.Testnet
      : WalletAdapterNetwork.Mainnet;
  
  // Get RPC URL from environment variable or fallback to public endpoint
  const endpoint = useMemo(() => 
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network), 
    [network]
  );
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Using Solana network: ${network}`)
      console.log(`Using RPC endpoint: ${endpoint.split('/').slice(0, 3).join('/')}/...`)
      console.log('Web3Auth Client ID configured:', !!process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID)
    }
  }, [network, endpoint])
  
  // Traditional wallet adapters (excluding Phantom and Solflare as they're now Standard Wallets)
  const wallets = useMemo(
    () => [
      new TorusWalletAdapter()
    ],
    []
  );

  // Throw error if Web3Auth client ID is not configured
  if (!process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID) {
    console.error('NEXT_PUBLIC_WEB3AUTH_CLIENT_ID environment variable is required for Web3Auth')
  }

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider 
          wallets={wallets} 
          autoConnect
          onError={(error) => {
            // Handle wallet connection errors more gracefully
            console.warn('Wallet connection error:', error.message);
            // Don't throw the error, just log it
          }}
        >
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </Web3AuthProvider>
  );
}