"use client";

import PageTemplate from "@/components/PageTemplate";
import React, { useState, useEffect } from "react";
// Add Transaction import at the top
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
// 🔥 ADD: Web3Auth imports
import { useWeb3AuthConnect } from '@web3auth/modal/react';
import { useSolanaWallet, useSignAndSendTransaction } from '@web3auth/modal/react/solana';

import DLMM from "@meteora-ag/dlmm";
import { RangeBar } from "@/components/profile-components/RangeBar";
import BN from "bn.js";
import { showToast } from "@/lib/utils/showToast";
import {
  ChartLineUpIcon,
  InfoIcon,
  SquaresFourIcon,
  TableIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import type { PositionType } from '@/lib/meteora/meteoraDlmmService'

// ===================== JUPITER LITE API INTEGRATION =====================
// This section uses the Jupiter Lite API (https://lite-api.jup.ag) to fetch
// token metadata (symbol, name, icon, usdPrice) for each token mint address.
// The results are cached in a local object to avoid redundant requests.
// ========================================================================

const tokenMetaCache: Record<string, TokenMeta> = {};

async function fetchTokenMeta(mint: string) {
  if (tokenMetaCache[mint]) return tokenMetaCache[mint];
  const res = await fetch(
    `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`
  );
  const data = await res.json();
  // The API returns an array, take the first match
  const token = data[0];
  tokenMetaCache[mint] = token;
  return token;
}

// Helper to format balance with dynamic superscript for leading zeros after decimal
function formatBalanceWithSub(balance: number, decimals = 6) {
  if (balance === 0) return "0";
  const str = balance.toFixed(decimals);
  // Match: int part, all zeros after decimal, rest
  const match = str.match(/^([0-9]+)\.(0+)(\d*)$/);
  if (!match) return str;
  const [, intPart, zeros, rest] = match;
  // Show the first zero after the decimal, then subscript the total count of zeros (not zeros.length - 1)
  return (
    <>
      {intPart}.0{sub(zeros.length)}
      {rest}
    </>
  );
  function sub(n: number | null) {
    return n && n > 1 ? (
      <sub style={{ fontSize: "0.7em", verticalAlign: "baseline" }}>{n}</sub>
    ) : null;
  }
}

// Define a type for token meta fetched from Jupiter API
interface TokenMeta {
  icon: string
  symbol: string
  usdPrice?: number
  [key: string]: unknown
}

// Minimal interfaces for pool and binData
interface PoolWithActiveId {
  activeId?: number
  tokenXMint?: unknown
  tokenYMint?: unknown
  [key: string]: unknown
}
type BinData = { binId: number; pricePerToken?: string | number }

type MaybeBase58 = { toBase58?: () => string }

// 🔥 ADD: Enhanced wallet info interface
interface WalletInfo {
  type: 'traditional' | 'web3auth' | null;
  publicKey: PublicKey | null;
  isConnected: boolean;
  canTransact: boolean;
  connection: Connection | null;
  sendTransaction: ((tx: Transaction) => Promise<string>) | null;
}

// Custom hook to fetch token meta for a pool
function useTokenMeta(pool: PoolWithActiveId) {
  const [tokenXMeta, setTokenXMeta] = React.useState<TokenMeta | null>(null);
  const [tokenYMeta, setTokenYMeta] = React.useState<TokenMeta | null>(null);
  React.useEffect(() => {
    if (!pool) return;
    const xMint = pool.tokenXMint && typeof (pool.tokenXMint as MaybeBase58).toBase58 === 'function'
      ? (pool.tokenXMint as MaybeBase58).toBase58!()
      : pool.tokenXMint;
    const yMint = pool.tokenYMint && typeof (pool.tokenYMint as MaybeBase58).toBase58 === 'function'
      ? (pool.tokenYMint as MaybeBase58).toBase58!()
      : pool.tokenYMint;
    fetchTokenMeta(xMint as string).then(setTokenXMeta);
    fetchTokenMeta(yMint as string).then(setTokenYMeta);
  }, [pool]);
  return { tokenXMeta, tokenYMeta };
}

// Custom hook for position actions - UPDATED for Web3Auth support
function usePositionActions(
  lbPairAddress: string,
  pos: PositionType,
  refreshPositions: () => void
) {
  const [closing, setClosing] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);
  
  // Traditional wallet
  const { publicKey: traditionalPublicKey, sendTransaction: traditionalSendTransaction } = useWallet();
  
  // 🔥 ADD: Web3Auth wallet hooks
  const { isConnected: web3AuthConnected } = useWeb3AuthConnect();
  const { accounts, connection: web3AuthConnection } = useSolanaWallet();
  const { signAndSendTransaction: web3AuthSignAndSend } = useSignAndSendTransaction();

  // 🔥 ADD: Unified wallet info
  const walletInfo: WalletInfo = React.useMemo(() => {
    // Check traditional wallet first
    if (traditionalPublicKey) {
      const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
      return {
        type: 'traditional',
        publicKey: traditionalPublicKey,
        isConnected: true,
        canTransact: true,
        connection,
        sendTransaction: async (tx: Transaction) => {
          return await traditionalSendTransaction(tx, connection);
        }
      };
    }
    
    // Check Web3Auth wallet
    if (web3AuthConnected && accounts?.[0] && web3AuthConnection) {
      try {
        const publicKey = new PublicKey(accounts[0]);
        return {
          type: 'web3auth',
          publicKey,
          isConnected: true,
          canTransact: !!web3AuthSignAndSend,
          connection: web3AuthConnection,
          sendTransaction: web3AuthSignAndSend ? async (tx: Transaction) => {
            return await web3AuthSignAndSend(tx);
          } : null
        };
      } catch (error) {
        console.error('Invalid Web3Auth account:', error);
      }
    }
    
    return {
      type: null,
      publicKey: null,
      isConnected: false,
      canTransact: false,
      connection: null,
      sendTransaction: null
    };
  }, [traditionalPublicKey, traditionalSendTransaction, web3AuthConnected, accounts, web3AuthConnection, web3AuthSignAndSend]);

  // 🔥 UPDATED: Close and withdraw function
  async function handleCloseAndWithdraw() {
    if (!walletInfo.isConnected || !walletInfo.canTransact) {
      showToast.error("Wallet Error", "Please connect your wallet to continue.");
      return;
    }
    
    setClosing(true);
    try {
      const posKey = pos.publicKey;
      const user = walletInfo.publicKey!;
      const lowerBinId = Number(pos.positionData.lowerBinId);
      const upperBinId = Number(pos.positionData.upperBinId);
      
      const dlmmPool = await DLMM.create(walletInfo.connection!, new PublicKey(lbPairAddress));
      
      const txOrTxs = await dlmmPool.removeLiquidity({
        user,
        position: posKey,
        fromBinId: lowerBinId,
        toBinId: upperBinId,
        bps: new BN(10000),
        shouldClaimAndClose: true,
      });
      
      // 🔥 UPDATED: Handle different wallet types
      if (Array.isArray(txOrTxs)) {
        for (const tx of txOrTxs) {
          await walletInfo.sendTransaction!(tx);
        }
      } else {
        await walletInfo.sendTransaction!(txOrTxs);
      }
      
      showToast.success(
        "Transaction successful",
        "Your position has been closed and your funds have been withdrawn."
      );
      
      setTimeout(() => {
        refreshPositions();
      }, 10000);
      
    } catch (err) {
      showToast.error("Failed to close position", (err as Error).message);
    } finally {
      setClosing(false);
    }
  }

  // 🔥 UPDATED: Claim fees function
  async function handleClaimFees() {
    if (!walletInfo.isConnected || !walletInfo.canTransact) {
      showToast.error("Wallet Error", "Please connect your wallet to continue.");
      return;
    }
    
    setClaiming(true);
    try {
      const posKey = pos.publicKey;
      const user = walletInfo.publicKey!;
      
      const dlmmPool = await DLMM.create(walletInfo.connection!, new PublicKey(lbPairAddress));
      const position = await dlmmPool.getPosition(posKey);
      
      const txOrTxs = await dlmmPool.claimSwapFee({
        owner: user,
        position,
      });
      
      if (txOrTxs) {
        // 🔥 UPDATED: Handle different wallet types
        if (Array.isArray(txOrTxs)) {
          for (const tx of txOrTxs) {
            await walletInfo.sendTransaction!(tx);
          }
        } else {
          await walletInfo.sendTransaction!(txOrTxs);
        }
        
        showToast.success("Transaction successful", "Your fees have been claimed.");
        setTimeout(() => refreshPositions(), 10000);
      } else {
        showToast.error("No fees to claim", "You don't have any fees to claim.");
      }
    } catch (err) {
      showToast.error("Failed to claim fees", (err as Error).message);
    } finally {
      setClaiming(false);
    }
  }
  
  return {
    closing,
    claiming,
    handleCloseAndWithdraw,
    handleClaimFees,
    walletInfo, // Return wallet info for button states
  };
}

type PositionInfoLike = {
  tokenX?: { mint?: { decimals?: number } }
  tokenY?: { mint?: { decimals?: number } }
  [key: string]: unknown
}

// Custom hook for extracting and formatting position display data
function usePositionDisplayData(
  pos: PositionType,
  pool: PoolWithActiveId,
  tokenXMeta: TokenMeta | null,
  tokenYMeta: TokenMeta | null,
  positionInfo?: PositionInfoLike
) {
  const binData = pos.positionData.positionBinData as BinData[];
  const minPrice =
    binData && binData.length > 0 && binData[0].pricePerToken !== undefined
      ? Number(binData[0].pricePerToken)
      : 0;
  const maxPrice =
    binData && binData.length > 0 && binData[binData.length - 1].pricePerToken !== undefined
      ? Number(binData[binData.length - 1].pricePerToken)
      : 0;
  let currentPrice = 0;
  if (binData && binData.length > 0 && pool.activeId !== undefined) {
    const activeBin = binData.find((b: BinData) => b.binId === pool.activeId);
    if (activeBin && activeBin.pricePerToken !== undefined) {
      currentPrice = Number(activeBin.pricePerToken);
    } else {
      const mid = Math.floor(binData.length / 2);
      currentPrice = binData[mid] && binData[mid].pricePerToken !== undefined
        ? Number(binData[mid].pricePerToken)
        : 0;
    }
  }
  // Improved fallback for decimals
  let xDecimals: number = 0;
  if (typeof pos.tokenXDecimals === 'number') xDecimals = pos.tokenXDecimals;
  else if (typeof pool.tokenXDecimals === 'number') xDecimals = pool.tokenXDecimals;
  else if (typeof positionInfo?.tokenX?.mint?.decimals === 'number') xDecimals = positionInfo.tokenX.mint.decimals;
  else xDecimals = 0;

  let yDecimals: number = 0;
  if (typeof pos.tokenYDecimals === 'number') yDecimals = pos.tokenYDecimals;
  else if (typeof pool.tokenYDecimals === 'number') yDecimals = pool.tokenYDecimals;
  else if (typeof positionInfo?.tokenY?.mint?.decimals === 'number') yDecimals = positionInfo.tokenY.mint.decimals;
  else yDecimals = 0;

  const xBalance = pos.positionData.totalXAmount
    ? Number(pos.positionData.totalXAmount) / Math.pow(10, xDecimals)
    : 0;
  const yBalance = pos.positionData.totalYAmount
    ? Number(pos.positionData.totalYAmount) / Math.pow(10, yDecimals)
    : 0;
  const xFee = pos.positionData.feeX
    ? Number(pos.positionData.feeX) / Math.pow(10, xDecimals)
    : 0;
  const yFee = pos.positionData.feeY
    ? Number(pos.positionData.feeY) / Math.pow(10, yDecimals)
    : 0;
  const totalLiquidityUSD =
    tokenXMeta && tokenYMeta
      ? xBalance * Number(tokenXMeta.usdPrice || 0) +
        yBalance * Number(tokenYMeta.usdPrice || 0)
      : 0;
  const claimedFeeX = pos.positionData.totalClaimedFeeXAmount
    ? Number(pos.positionData.totalClaimedFeeXAmount) / Math.pow(10, xDecimals)
    : 0;
  const claimedFeeY = pos.positionData.totalClaimedFeeYAmount
    ? Number(pos.positionData.totalClaimedFeeYAmount) / Math.pow(10, yDecimals)
    : 0;
  const claimedFeesUSD =
    tokenXMeta && tokenYMeta
      ? claimedFeeX * Number(tokenXMeta.usdPrice || 0) +
        claimedFeeY * Number(tokenYMeta.usdPrice || 0)
      : 0;
  return {
    minPrice,
    maxPrice,
    currentPrice,
    xBalance,
    yBalance,
    xFee,
    yFee,
    totalLiquidityUSD,
    claimedFeesUSD,
    xDecimals,
    yDecimals,
    claimedFeeX,
    claimedFeeY,
  };
}

// ===================== POSITION ITEM COMPONENT =====================
// A unified component that can render as either a card or table row
// based on the viewMode prop. This eliminates code duplication while
// maintaining the Rules of Hooks compliance.
// ===============================================================

function PositionItem({
  lbPairAddress,
  positionInfo,
  refreshPositions,
  viewMode,
}: {
  lbPairAddress: string;
  positionInfo: {
    lbPair: PoolWithActiveId;
    lbPairPositionsData: PositionType[];
    [key: string]: unknown;
  };
  refreshPositions: () => void;
  viewMode: "table" | "card";
}) {
  const pos = positionInfo.lbPairPositionsData[0];
  const pool = positionInfo.lbPair;
  const { tokenXMeta, tokenYMeta } = useTokenMeta(pool);
  
  // Use shared hook for actions
  const {
    closing,
    claiming,
    handleCloseAndWithdraw,
    handleClaimFees,
    walletInfo,
  } = usePositionActions(lbPairAddress, pos, refreshPositions);
  
  // Use shared hook for display data
  const {
    minPrice,
    maxPrice,
    currentPrice,
    xBalance,
    yBalance,
    xFee,
    yFee,
    totalLiquidityUSD,
    claimedFeesUSD,
  } = usePositionDisplayData(pos, pool, tokenXMeta, tokenYMeta, positionInfo);

  // Shared token pair display
  const TokenPairDisplay = () => (
    <div className="flex items-center gap-2">
      {tokenXMeta && (
        <Image
          src={tokenXMeta.icon}
          alt={tokenXMeta.symbol}
          width={24}
          height={24}
          className="rounded-full border-2 border-border"
          unoptimized
        />
      )}
      {tokenYMeta && (
        <Image
          src={tokenYMeta.icon}
          alt={tokenYMeta.symbol}
          width={24}
          height={24}
          className="rounded-full border-2 border-border"
          unoptimized 
        />
      )}
      <span className={`font-semibold ml-2 ${viewMode === "card" ? "text-lg" : ""}`}>
        {tokenXMeta && tokenYMeta
          ? `${tokenXMeta.symbol} / ${tokenYMeta.symbol}`
          : ""}
      </span>
    </div>
  );

  // Shared balance display
  const BalanceDisplay = ({ showIcons = false, size = "text-lg" }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenXMeta && (
          <Image    
            src={tokenXMeta.icon}
            alt={tokenXMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-mono font-semibold ${size}`}>
          {xBalance === 0 ? "0" : formatBalanceWithSub(xBalance, 6)}{" "}
          {tokenXMeta ? tokenXMeta.symbol : ""}
        </span>
        {tokenXMeta && xBalance !== 0 && (
          <span className="text-xs text-gray-500 ml-1">
            (${(xBalance * Number(tokenXMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && (
          <Image
            src={tokenYMeta.icon}
            alt={tokenYMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-mono font-semibold ${size}`}>
          {yBalance === 0 ? "0" : formatBalanceWithSub(yBalance, 6)}{" "}
          {tokenYMeta ? tokenYMeta.symbol : ""}
        </span>
        {tokenYMeta && yBalance !== 0 && (
          <span className="text-xs text-gray-500 ml-1">
            (${(yBalance * Number(tokenYMeta.usdPrice || 0)).toFixed(2)})
          </span>
        )}
      </div>
    </>
  );

  // Shared fee display
  const FeeDisplay = ({ showIcons = false, size = "text-lg" }: { showIcons?: boolean; size?: string }) => (
    <>
      <div className="flex items-center gap-2 mb-1">
        {showIcons && tokenXMeta && (
          <Image
            src={tokenXMeta.icon}
            alt={tokenXMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-mono font-semibold ${size}`}>
          {xFee === 0 ? "0" : formatBalanceWithSub(xFee, 6)}{" "}
          {tokenXMeta ? tokenXMeta.symbol : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {showIcons && tokenYMeta && (
          <Image
            src={tokenYMeta.icon}
            alt={tokenYMeta.symbol}
            width={20}
            height={20}
            className="rounded-full border-2 border-border"
            unoptimized
          />
        )}
        <span className={`font-mono font-semibold ${size}`}>
          {yFee === 0 ? "0" : formatBalanceWithSub(yFee, 6)}{" "}
          {tokenYMeta ? tokenYMeta.symbol : ""}
        </span>
      </div>
    </>
  );

  // Shared action buttons
  const ActionButtons = ({ size = "text-sm" }: { size?: string }) => (
    <div className={`flex ${viewMode === "card" ? "flex-col md:flex-row" : ""} justify-end gap-2 ${viewMode === "card" ? "mt-6" : ""}`}>
      <Button
        variant="secondary"
        className={size}
        onClick={handleClaimFees}
        disabled={claiming || !walletInfo.canTransact}
      >
        {claiming ? "Claiming..." : "Claim Fees"}
      </Button>
      <Button
        className={size}
        onClick={handleCloseAndWithdraw}
        disabled={closing || !walletInfo.canTransact}
      >
        {closing ? "Closing..." : "Close & Withdraw"}
      </Button>
    </div>
  );

  if (viewMode === "card") {
    return (
      <div className="rounded-lg shadow-sm overflow-hidden p-4 mb-4 border border-border">
        {/* Position/Pool Section */}
        <div className="flex items-center gap-2 mb-4">
          <TokenPairDisplay />
        </div>
        
        {/* Summary Cards */}
        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div>
            <div className="text-sm text-gray-400 mb-1">Total Liquidity</div>
            <div className="text-2xl font-semibold text-white">
              ${totalLiquidityUSD.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">
              Fees Earned (Claimed)
            </div>
            <div className="text-2xl font-semibold text-white">
              ${claimedFeesUSD.toFixed(8)}
            </div>
          </div>
        </div>
        
        {/* Range */}
        <div className="mb-4">
          <span className="block font-semibold mb-1">Range</span>
          <RangeBar min={minPrice} max={maxPrice} current={currentPrice} />
        </div>
        
        {/* Position Liquidity Section */}
        <div className="bg-card-foreground border border-border rounded-lg p-4">
          <div className="text-lg font-semibold mb-2">Position Liquidity</div>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Current Balance */}
            <div>
              <div className="text-sm text-gray-500 mb-1">Current Balance</div>
              <BalanceDisplay showIcons={true} />
            </div>
            {/* Unclaimed Swap Fee */}
            <div>
              <div className="text-sm text-gray-500 mb-1">
                Your Unclaimed Swap Fee
              </div>
              <FeeDisplay showIcons={true} />
            </div>
          </div>
          <ActionButtons />
        </div>
      </div>
    );
  }

  // Table row format
  return (
    <tr key={lbPairAddress}>
      <td className="px-4 py-3 whitespace-nowrap">
        <TokenPairDisplay />
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-mono">
        ${totalLiquidityUSD.toFixed(4)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-mono">
        ${claimedFeesUSD.toFixed(8)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <BalanceDisplay size="text-sm" />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <FeeDisplay size="text-sm" />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <RangeBar min={minPrice} max={maxPrice} current={currentPrice} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex justify-center gap-2">
          <ActionButtons size="text-xs" />
        </div>
      </td>
    </tr>
  );
}

const WalletPage = () => {
  // Traditional wallet
  const { connected: traditionalConnected } = useWallet();
  
  // 🔥 ADD: Web3Auth wallet
  const { isConnected: web3AuthConnected } = useWeb3AuthConnect();
  const { accounts } = useSolanaWallet();
  
  // 🔥 UPDATED: Combined connection check
  const isAnyWalletConnected = traditionalConnected || (web3AuthConnected && accounts && accounts.length > 0);
  
  const [positions, setPositions] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "card">(
    typeof window !== "undefined" && window.innerWidth < 640 ? "card" : "table"
  );

  // Responsive: switch to card view on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) setViewMode("card");
      else setViewMode("table");
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 🔥 UPDATED: Get current wallet's public key
  const { publicKey: traditionalPublicKey } = useWallet();
  
  const getCurrentWalletPublicKey = React.useCallback((): PublicKey | null => {
    // Check traditional wallet first
    if (traditionalPublicKey) return traditionalPublicKey;
    
    // Check Web3Auth wallet
    if (web3AuthConnected && accounts?.[0]) {
      try {
        return new PublicKey(accounts[0]);
      } catch (error) {
        console.error('Invalid Web3Auth account:', error);
      }
    }
    
    return null;
  }, [traditionalPublicKey, web3AuthConnected, accounts]);

  // 🔥 UPDATED: Fetch positions function
  const fetchPositions = React.useCallback(async () => {
    const currentPublicKey = getCurrentWalletPublicKey();
    if (!currentPublicKey) return;
    
    try {
      setLoading(true);
      setError("");

      // Use your QuickNode RPC endpoint
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          "https://api.mainnet-beta.solana.com"
      );

      // Test the connection
      const version = await connection.getVersion();
      console.log("Solana RPC version:", version);

      // Continue with your logic...
      const userPositions = await DLMM.getAllLbPairPositionsByUser(
        connection,
        currentPublicKey
      );

      setPositions(userPositions);
    } catch (err) {
      setError("Failed to fetch positions: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getCurrentWalletPublicKey]);

  const refreshPositions = () => {
    fetchPositions();
  };

  // 🔥 UPDATED: Effect to fetch positions when any wallet connects
  useEffect(() => {
    if (isAnyWalletConnected) {
      fetchPositions();
    } else {
      setPositions(new Map());
    }
  }, [isAnyWalletConnected, fetchPositions]);

  const positionsArray = Array.from(positions.entries());

  return (
    <PageTemplate>
      <div className="p-0 md:p-6">
        <div className="mx-auto">
          {/* View Toggle */}
          <div className="flex justify-between mb-4">
            <h1 className="text-2xl font-bold">Your Positions</h1>
            <div className="inline-flex gap-4" role="group">
              <button
                type="button"
                className={`text-sm flex items-center gap-2 ${
                  viewMode === "table" ? "font-semibold" : "font-normal"
                }`}
                onClick={() => setViewMode("table")}
              >
                <TableIcon size={21} /> Table
              </button>
              <button
                type="button"
                className={`text-sm flex items-center gap-2 ${
                  viewMode === "card" ? "font-semibold" : "font-normal"
                }`}
                onClick={() => setViewMode("card")}
              >
                <SquaresFourIcon size={21} /> Card
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2">
                <InfoIcon className="w-5 h-5 text-primary" />
                <span className="text-primary">{error}</span>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="rounded-lg shadow-sm p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sub-text">Loading positions...</p>
            </div>
          )}

          {/* Positions List */}
          {!loading &&
            isAnyWalletConnected &&
            positionsArray.length > 0 &&
            (viewMode === "table" ? (
              <div className="overflow-x-auto styled-scrollbar">
                <table className="min-w-full divide-y divide-border border border-border rounded-xl">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Position/Pool
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Total Liquidity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Fees Earned (Claimed)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Current Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Unclaimed Swap Fee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Range
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="border-b border-border">
                    {positionsArray.map(([lbPairAddress, positionInfo]) => (
                      <PositionItem
                        key={lbPairAddress}
                        lbPairAddress={lbPairAddress}
                        positionInfo={positionInfo}
                        refreshPositions={refreshPositions}
                        viewMode={viewMode}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {positionsArray.map(([lbPairAddress, positionInfo]) => (
                  <PositionItem
                    key={lbPairAddress}
                    lbPairAddress={lbPairAddress}
                    positionInfo={positionInfo}
                    refreshPositions={refreshPositions}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            ))}

          {/* Empty State */}
          {!loading && isAnyWalletConnected && positionsArray.length === 0 && (
            <div className="rounded-lg shadow-sm p-8 text-center">
              <ChartLineUpIcon className="w-12 h-12 text-white mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                No Positions Found
              </h3>
              <p className="text-sub-text">
                You don&apos;t have any LB pair positions yet.
              </p>
            </div>
          )}

          {/* 🔥 UPDATED: Not Connected State */}
          {!isAnyWalletConnected && (
            <div className="rounded-lg shadow-sm p-8 text-center">
              <WalletIcon className="w-12 h-12 text-white mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                Connect Your Wallet
              </h3>
              <p className="text-sub-text">
                Please connect your wallet (traditional or social login) to view your LB pair positions.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageTemplate>
  );
};

export default WalletPage;