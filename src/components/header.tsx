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
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
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
  const { connected: traditionalConnected, publicKey: traditionalPublicKey, disconnect: traditionalDisconnect } = useWallet();
  
  // Web3Auth hooks
  const { isConnected: web3AuthConnected, web3Auth } = useWeb3Auth();
  const { connect: web3AuthConnect, loading: web3AuthLoading } = useWeb3AuthConnect();

  // Combined connection state
  const isAnyWalletConnected = traditionalConnected || web3AuthConnected;
  const connectedWalletType = traditionalConnected ? 'Traditional' : web3AuthConnected ? 'Web3Auth' : null;

  // Update mounted state after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Web3Auth disconnect
  const handleWeb3AuthDisconnect = async () => {
    if (web3Auth && web3AuthConnected) {
      try {
        // Web3Auth logout using the web3Auth instance
        await web3Auth.logout();
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

  // Get wallet address for display
  const getWalletAddress = () => {
    if (traditionalConnected && traditionalPublicKey) {
      return traditionalPublicKey.toBase58();
    }
    // For Web3Auth, you'd get the address from the provider
    // This would be implemented based on Web3Auth's Solana provider API
    return 'Web3Auth Connected';
  };

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
            {isAnyWalletConnected ? (
              // Connected State - Show wallet info and disconnect option
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-right text-xs">
                  <span className="text-white font-medium">
                    {connectedWalletType} Wallet
                  </span>
                  <span className="text-gray-400 truncate max-w-[120px]">
                    {getWalletAddress().slice(0, 4)}...{getWalletAddress().slice(-4)}
                  </span>
                </div>
                <Button
                  onClick={handleDisconnect}
                  variant="outline"
                  size="sm"
                  className="bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30"
                >
                  Disconnect
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