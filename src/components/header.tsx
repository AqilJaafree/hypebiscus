// src/components/header.tsx - Updated with proper Web3Auth Modal integration
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {HouseIcon, LightningAIcon, WalletIcon, ListIcon} from "@phosphor-icons/react"
import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
// Updated Web3Auth imports for modal package
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";
import { useSolanaWallet } from "@web3auth/modal/react/solana";
import { Button } from "@/components/ui/button";

// Dynamically import WalletMultiButton with ssr disabled
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const Header = () => {
  // State to handle component mounting to avoid hydration issues
  const [mounted, setMounted] = useState(false);
  
  // Traditional wallet adapter hooks
  const { 
    connected: traditionalConnected, 
    publicKey: traditionalPublicKey, 
    disconnect: traditionalDisconnect 
  } = useWallet();
  
  // Web3Auth Modal hooks - Updated imports
  const { 
    isConnected: web3AuthConnected, 
    connect: web3AuthConnect, 
    loading: web3AuthLoading 
  } = useWeb3AuthConnect();
  
  const { 
    disconnect: web3AuthDisconnect, 
    loading: disconnectLoading 
  } = useWeb3AuthDisconnect();
  
  const { userInfo } = useWeb3AuthUser();
  
  // Access to Solana wallet data from Web3Auth Modal
  const { accounts: web3AuthAccounts } = useSolanaWallet();

  // Combined connection state
  const isAnyWalletConnected = traditionalConnected || web3AuthConnected;

  // Update mounted state after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Web3Auth disconnect properly
  const handleWeb3AuthDisconnect = async () => {
    if (web3AuthConnected) {
      try {
        await web3AuthDisconnect();
      } catch (error) {
        console.error('Web3Auth disconnect error:', error);
      }
    }
  };

  // Handle unified disconnect
  const handleDisconnect = async () => {
    if (traditionalConnected) {
      await traditionalDisconnect();
    } else if (web3AuthConnected) {
      await handleWeb3AuthDisconnect();
    }
  };

  // Get actual wallet address
  const getWalletAddress = () => {
    if (traditionalConnected && traditionalPublicKey) {
      return traditionalPublicKey.toBase58();
    }
    // Return actual Solana address from Web3Auth Modal
    if (web3AuthConnected && web3AuthAccounts?.[0]) {
      return web3AuthAccounts[0];
    }
    return 'Not connected';
  };

  // Get display info for connected wallet
  const getWalletDisplayInfo = () => {
    if (traditionalConnected) {
      return {
        type: 'Traditional Wallet',
        address: getWalletAddress(),
        canShowAddress: true
      };
    }
    if (web3AuthConnected) {
      return {
        type: 'Social Login',
        address: getWalletAddress(),
        canShowAddress: !!web3AuthAccounts?.[0],
        userInfo: userInfo
      };
    }
    return null;
  };

  const walletInfo = getWalletDisplayInfo();

  return (
    <div className="flex justify-between items-center lg:px-[70px] px-4 lg:pt-4 pt-2 lg:pb-0 pb-2">
      <Image src="/hypebiscus_logo.png" alt="Hypebiscus" width={70} height={70} unoptimized/>
      
      <div className="flex items-center gap-4">
        {/* Mobile Navigation Menu */}
        <NavigationMenu className="lg:hidden block">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="flex items-center gap-2"><ListIcon /></NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="flex flex-col gap-y-4 p-2">
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/">
                        <HouseIcon className="text-primary"/> Home
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/wallet">
                        <WalletIcon className="text-primary"/> Wallet
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link href="/bridge">
                        <LightningAIcon className="text-primary"/> Bridge
                      </Link>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Wallet Connection Section */}
        {mounted && (
          <div className="flex items-center gap-3">
            {isAnyWalletConnected && walletInfo ? (
              // Connected State - Show wallet info and disconnect option
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-right text-xs">
                  <span className="text-white font-medium">
                    {walletInfo.type}
                  </span>
                  {walletInfo.canShowAddress && (
                    <span className="text-gray-400 truncate max-w-[120px]">
                      {walletInfo.address.slice(0, 4)}...{walletInfo.address.slice(-4)}
                    </span>
                  )}
                  {/* Show user email for social login */}
                  {walletInfo.userInfo?.email && (
                    <span className="text-gray-400 text-xs truncate max-w-[120px]">
                      {String(walletInfo.userInfo.email)}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleDisconnect}
                  disabled={disconnectLoading}
                  variant="outline"
                  size="sm"
                  className="bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30"
                >
                  {disconnectLoading ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            ) : (
              // Disconnected State - Show connection options
              <div className="flex items-center gap-2">
                {/* Web3Auth Social Login Button */}
                <Button
                  onClick={web3AuthConnect}
                  disabled={web3AuthLoading}
                  variant="secondary"
                  size="sm"
                  className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500 text-blue-400 hover:from-blue-600/30 hover:to-purple-600/30 hidden sm:flex"
                >
                  {web3AuthLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Social Login"
                  )}
                </Button>

                {/* Traditional Wallet Button */}
                <WalletMultiButton
                  style={{
                    backgroundColor: "var(--primary)",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    fontSize: "14px",
                    fontFamily: "var(--font-sans)",
                    height: "100%",
                    lineHeight: "100%",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;