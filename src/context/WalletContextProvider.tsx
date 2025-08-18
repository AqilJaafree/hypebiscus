'use client'

import { FC, ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { TorusWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { Web3AuthProvider } from '@web3auth/modal/react'
import { WEB3AUTH_NETWORK } from '@web3auth/modal'
import type { Web3AuthContextConfig } from '@web3auth/modal/react'

import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

// Simplified Web3Auth Configuration
const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
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
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
  
  const wallets = [
    new TorusWalletAdapter()
  ]

  if (!process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID) {
    console.error('NEXT_PUBLIC_WEB3AUTH_CLIENT_ID environment variable is required')
  }

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider 
          wallets={wallets} 
          autoConnect
          onError={(error) => {
            console.warn('Wallet connection error:', error.message)
          }}
        >
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </Web3AuthProvider>
  )
}
