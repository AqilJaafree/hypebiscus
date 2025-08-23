// Enhanced meteoraDlmmService.ts - FIXED VERSION with Web3Auth Support
// Users can only interact with existing bins to prevent expensive bin creation

import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// Add interface definitions for proper typing
interface BinArray {
  account?: {
    index?: number;
  };
  [key: string]: unknown;
}

interface PoolBinArrays {
  getBinArrays?(): Promise<BinArray[]>;
  [key: string]: unknown;
}

// Enhanced error types
export enum DLMMErrorType {
  INSUFFICIENT_SOL = 'INSUFFICIENT_SOL',
  INSUFFICIENT_TOKEN = 'INSUFFICIENT_TOKEN',
  INVALID_POOL = 'INVALID_POOL',
  NO_EXISTING_BINS = 'NO_EXISTING_BINS',
  TRANSACTION_SIMULATION_FAILED = 'TRANSACTION_SIMULATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class DLMMError extends Error {
  constructor(
    public type: DLMMErrorType,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'DLMMError';
  }

  get userFriendlyMessage(): string {
    switch (this.type) {
      case DLMMErrorType.INSUFFICIENT_SOL:
        return 'Insufficient SOL balance. Please add more SOL to your wallet.';
      case DLMMErrorType.INSUFFICIENT_TOKEN:
        return 'Insufficient token balance. Please ensure you have enough tokens for this transaction.';
      case DLMMErrorType.INVALID_POOL:
        return 'Invalid pool configuration. Please try a different pool.';
      case DLMMErrorType.NO_EXISTING_BINS:
        return 'No existing price ranges available. Please wait for more liquidity or select a different pool.';
      case DLMMErrorType.TRANSACTION_SIMULATION_FAILED:
        return 'Transaction simulation failed. The existing bins might be full or have restrictions.';
      case DLMMErrorType.CONNECTION_ERROR:
        return 'Connection error. Please check your wallet connection and try again.';
      case DLMMErrorType.NETWORK_ERROR:
        return 'Network error. Please check your connection and try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}

// Simplified balance validation for existing bins only
export interface SimplifiedBalanceValidation {
  isValid: boolean;
  solBalance: number;
  requiredSol: number;
  error?: DLMMError;
}

// Rest of existing interfaces
export type DlmmType = DLMM;

export interface BinArrayType {
  publicKey: PublicKey;
  [key: string]: unknown;
}

export interface PositionType {
  publicKey: PublicKey;
  positionData: {
    positionBinData: BinDataType[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BinDataType {
  binId: number;
  xAmount: { toString(): string };
  yAmount: { toString(): string };
  liquidityAmount: { toString(): string };
  [key: string]: unknown;
}

export interface BinLiquidity {
  binId: number;
  xAmount: string;
  yAmount: string;
  liquidityAmount: string;
  price: string;
}

export interface DlmmPoolInfo {
  address: string;
  name: string;
  tokenX: string;
  tokenY: string;
  activeBinPrice: number;
  binStep: number;
  totalXAmount: string;
  totalYAmount: string;
}

export interface DlmmPositionInfo {
  pubkey: string;
  liquidityPerBin: {
    binId: number;
    xAmount: string;
    yAmount: string;
    liquidityAmount: string;
  }[];
  totalValue: number;
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  minOutAmount: string;
  fee: string;
  priceImpact: string;
  binArraysPubkey: PublicKey[];
}

export interface ActiveBin {
  binId: number;
  price: string;
  xAmount: string;
  yAmount: string;
}

// Define types for DLMM pool
interface DLMMPool {
  getActiveBin(): Promise<{
    binId: number;
    price: string;
    xAmount: string;
    yAmount: string;
  }>;
  getBin(binId: number): Promise<unknown>;
  getPositionsByUserAndLbPair(userPublicKey: PublicKey): Promise<{
    userPositions: PositionType[];
  }>;
  getSwapQuote(params: {
    inAmount: BN;
    swapForY: boolean;
    allowedSlippage: number;
  }): Promise<{
    amountOut?: BN;
    minAmountOut?: BN;
    fee?: BN;
    priceImpact?: number;
    binArraysPubkey?: PublicKey[];
  }>;
  swap(params: {
    user: PublicKey;
    inAmount: BN;
    minAmountOut: BN;
    swapForY: boolean;
  }): Promise<Transaction>;
  [key: string]: unknown;
}

/**
 * Enhanced Service to interact with Meteora DLMM - EXISTING BINS ONLY
 * This version prevents expensive bin creation by only using existing price ranges
 * 🔥 FIXED: Now supports Web3Auth connections
 */
export class MeteoraDlmmService {
  private _connection: Connection;
  private poolInstances: Map<string, DlmmType> = new Map();

  constructor(connection: Connection) {
    this._connection = connection;
  }

  get connection(): Connection {
    return this._connection;
  }

  /**
   * 🔥 NEW: Method to check if pool can be initialized with given connection
   */
  async validatePoolConnection(poolAddress: string, connection: Connection): Promise<boolean> {
    try {
      console.log('🔍 Validating pool connection:', {
        poolAddress: poolAddress.substring(0, 8) + '...',
        rpcEndpoint: connection.rpcEndpoint
      });

      const pubkey = new PublicKey(poolAddress);
      const pool = await DLMM.create(connection, pubkey);
      
      // Try to get basic pool info to validate connection works
      const typedPool = pool as unknown as DLMMPool;
      await typedPool.getActiveBin();
      
      console.log('✅ Pool connection validated successfully');
      return true;
    } catch (error) {
      console.error('❌ Pool connection validation failed:', error);
      return false;
    }
  }

  /**
   * 🔥 CRITICAL FIX: Enhanced pool initialization with Web3Auth support
   */
  async initializePool(poolAddress: string, customConnection?: Connection): Promise<DlmmType> {
    try {
      // Create cache key that includes connection info
      const connectionKey = customConnection ? 'custom' : 'default';
      const cacheKey = `${poolAddress}-${connectionKey}`;
      
      if (this.poolInstances.has(cacheKey)) {
        console.log('📋 Using cached pool instance for:', poolAddress.substring(0, 8) + '...');
        return this.poolInstances.get(cacheKey)!;
      }

      // Use custom connection if provided (for Web3Auth), otherwise use default
      const connectionToUse = customConnection || this._connection;
      
      console.log('🔧 Initializing DLMM pool with connection:', {
        poolAddress: poolAddress.substring(0, 8) + '...',
        rpcEndpoint: connectionToUse.rpcEndpoint,
        usingCustomConnection: !!customConnection,
        cacheKey
      });

      // Validate connection first
      const isValidConnection = await this.validatePoolConnection(poolAddress, connectionToUse);
      if (!isValidConnection) {
        throw new DLMMError(
          DLMMErrorType.CONNECTION_ERROR,
          'Unable to establish connection to DLMM pool'
        );
      }

      const pubkey = new PublicKey(poolAddress);
      const pool = await DLMM.create(connectionToUse, pubkey);
      
      // Cache the pool with connection-specific key
      this.poolInstances.set(cacheKey, pool);
      
      console.log('✅ DLMM pool initialized successfully');
      return pool;
    } catch (error) {
      console.error('❌ Failed to initialize DLMM pool:', error);
      
      if (error instanceof DLMMError) {
        throw error;
      }
      
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to initialize DLMM pool',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Simplified balance validation for existing bins strategy
   */
  async validateUserBalance(
    userPublicKey: PublicKey,
    requiredSolAmount: number,
    customConnection?: Connection
  ): Promise<SimplifiedBalanceValidation> {
    try {
      const connectionToUse = customConnection || this._connection;
      const solBalanceLamports = await connectionToUse.getBalance(userPublicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      // Only need position rent + transaction fees (no bin creation costs)
      const requiredSolWithBuffer = requiredSolAmount + 0.072; // 0.057 position rent + 0.015 tx fees
      
      if (solBalance < requiredSolWithBuffer) {
        return {
          isValid: false,
          solBalance,
          requiredSol: requiredSolWithBuffer,
          error: new DLMMError(
            DLMMErrorType.INSUFFICIENT_SOL,
            `Insufficient SOL balance. Required: ${requiredSolWithBuffer.toFixed(4)}, Available: ${solBalance.toFixed(4)}`
          )
        };
      }

      return {
        isValid: true,
        solBalance,
        requiredSol: requiredSolWithBuffer
      };
    } catch (error) {
      return {
        isValid: false,
        solBalance: 0,
        requiredSol: requiredSolAmount,
        error: new DLMMError(
          DLMMErrorType.NETWORK_ERROR,
          'Failed to validate balances',
          error instanceof Error ? error.message : String(error)
        )
      };
    }
  }

  /**
   * 🔥 UPDATED: Get active bin with connection support
   */
  async getActiveBin(poolAddress: string, customConnection?: Connection): Promise<ActiveBin> {
    try {
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      const activeBin = await typedPool.getActiveBin();
      
      return {
        binId: activeBin.binId,
        price: activeBin.price,
        xAmount: activeBin.xAmount?.toString() || '0',
        yAmount: activeBin.yAmount?.toString() || '0',
      };
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to get active bin information',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 🔥 UPDATED: Check existing bins with connection support
   */
  async checkExistingBins(
    poolAddress: string, 
    minBinId: number, 
    maxBinId: number,
    customConnection?: Connection
  ): Promise<number[]> {
    try {
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      
      const existingBins: number[] = [];
      
      try {
        // Try to get bin arrays to check which bins exist
        const binArrays = await (typedPool as unknown as PoolBinArrays).getBinArrays?.();
        
        if (binArrays && binArrays.length > 0) {
          // Check which bins in our range fall within existing bin arrays
          for (let binId = minBinId; binId <= maxBinId; binId++) {
            const binArrayIndex = Math.floor(binId / 70); // Approximate bins per array
            
            // Check if this bin array exists
            const binArrayExists = binArrays.some((binArray: BinArray) => 
              binArray.account?.index === binArrayIndex
            );
            
            if (binArrayExists) {
              existingBins.push(binId);
            }
          }
        }
      } catch {
        // Fallback: use a conservative approach
        console.log('Using conservative bin detection fallback');
        
        // Assume bins around the active bin exist
        const activeBin = await typedPool.getActiveBin();
        const activeBinId = activeBin.binId;
        
        // Add bins in a conservative range around active bin
        for (let offset = -5; offset <= 5; offset++) {
          const binId = activeBinId + offset;
          if (binId >= minBinId && binId <= maxBinId) {
            existingBins.push(binId);
          }
        }
      }
      
      console.log(`Found ${existingBins.length} existing bins in range ${minBinId}-${maxBinId}`);
      return existingBins.sort((a, b) => a - b);
    } catch (error) {
      console.error('Error checking existing bins:', error);
      
      // Ultra-conservative fallback
      const conservativeBins: number[] = [];
      const centerBin = Math.floor((minBinId + maxBinId) / 2);
      for (let i = -2; i <= 2; i++) {
        const binId = centerBin + i;
        if (binId >= minBinId && binId <= maxBinId) {
          conservativeBins.push(binId);
        }
      }
      return conservativeBins;
    }
  }

  /**
   * Calculate balanced Y amount using existing autoFill functionality
   */
  calculateBalancedYAmount(
    activeBinId: number,
    binStep: number,
    totalXAmount: BN,
    activeBinXAmount: string,
    activeBinYAmount: string,
    minBinId: number,
    maxBinId: number,
    strategyType: StrategyType
  ): BN {
    try {
      const activeBinXAmountBN = new BN(activeBinXAmount || '0');
      const activeBinYAmountBN = new BN(activeBinYAmount || '0');
      
      return autoFillYByStrategy(
        activeBinId,
        binStep,
        totalXAmount,
        activeBinXAmountBN,
        activeBinYAmountBN,
        minBinId,
        maxBinId,
        strategyType
      );
    } catch (error) {
      console.error('Error calculating balanced Y amount:', error);
      return new BN(0);
    }
  }

  /**
   * 🔥 UPDATED: Simplified transaction simulation with connection support
   */
  async simulateTransaction(
    transaction: Transaction,
    customConnection?: Connection
  ): Promise<{ success: boolean; error?: DLMMError }> {
    try {
      const connectionToUse = customConnection || this._connection;
      const simulation = await connectionToUse.simulateTransaction(transaction, []);
      
      if (simulation.value.err) {
        const errorMessage = JSON.stringify(simulation.value.err);
        
        if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
          return {
            success: false,
            error: new DLMMError(
              DLMMErrorType.INSUFFICIENT_SOL,
              'Transaction simulation failed due to insufficient funds'
            )
          };
        }
        
        return {
          success: false,
          error: new DLMMError(
            DLMMErrorType.TRANSACTION_SIMULATION_FAILED,
            'Transaction simulation failed - existing bins might be full',
            errorMessage
          )
        };
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new DLMMError(
          DLMMErrorType.NETWORK_ERROR,
          'Failed to simulate transaction',
          error instanceof Error ? error.message : String(error)
        )
      };
    }
  }

  /**
   * 🔥 UPDATED: Get all pools with connection support
   */
  async getAllPools(): Promise<DlmmPoolInfo[]> {
    try {
      const response = await fetch('https://dlmm-api.meteora.ag/pair/all');
      if (!response.ok) {
        throw new Error('Failed to fetch DLMM pools');
      }
      
      const data = await response.json();
      const pools: DlmmPoolInfo[] = [];
      
      for (const pool of data.pairs || []) {
        pools.push({
          address: pool.address,
          name: pool.name,
          tokenX: pool.token_x.symbol,
          tokenY: pool.token_y.symbol,
          activeBinPrice: parseFloat(pool.price),
          binStep: parseFloat(pool.bin_step),
          totalXAmount: pool.token_x_amount,
          totalYAmount: pool.token_y_amount
        });
      }
      
      return pools;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.NETWORK_ERROR,
        'Failed to fetch DLMM pools',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 🔥 UPDATED: Get user positions with connection support
   */
  async getUserPositions(
    poolAddress: string, 
    userPublicKey: PublicKey,
    customConnection?: Connection
  ): Promise<DlmmPositionInfo[]> {
    try {
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(userPublicKey);
      
      const positions: DlmmPositionInfo[] = [];
      
      for (const position of userPositions) {
        const typedPosition = position as PositionType;
        const bins = typedPosition.positionData.positionBinData.map((bin) => ({
          binId: bin.binId,
          xAmount: bin.xAmount.toString(),
          yAmount: bin.yAmount.toString(),
          liquidityAmount: bin.liquidityAmount.toString()
        }));
        
        positions.push({
          pubkey: typedPosition.publicKey.toString(),
          liquidityPerBin: bins,
          totalValue: 0
        });
      }
      
      return positions;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.INVALID_POOL,
        'Failed to fetch user positions',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 🔥 UPDATED: Get swap quote with connection support
   */
  async getSwapQuote(
    poolAddress: string,
    amountIn: BN,
    swapForY: boolean,
    customConnection?: Connection
  ): Promise<SwapQuote> {
    try {
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      
      const quote = await typedPool.getSwapQuote({
        inAmount: amountIn,
        swapForY,
        allowedSlippage: 0.5, // 0.5% slippage
      });
      
      return {
        amountIn: amountIn.toString(),
        amountOut: quote.amountOut?.toString() || '0',
        minOutAmount: quote.minAmountOut?.toString() || '0',
        fee: quote.fee?.toString() || '0',
        priceImpact: quote.priceImpact?.toString() || '0',
        binArraysPubkey: quote.binArraysPubkey || []
      };
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.NETWORK_ERROR,
        'Failed to get swap quote',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 🔥 UPDATED: Execute swap with connection support
   */
  async swap(
    poolAddress: string,
    userPublicKey: PublicKey,
    amountIn: BN,
    minAmountOut: BN,
    swapForY: boolean,
    customConnection?: Connection
  ): Promise<Transaction> {
    try {
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      
      const swapTx = await typedPool.swap({
        user: userPublicKey,
        inAmount: amountIn,
        minAmountOut,
        swapForY,
      });
      
      return swapTx;
    } catch (error) {
      throw new DLMMError(
        DLMMErrorType.TRANSACTION_SIMULATION_FAILED,
        'Failed to create swap transaction',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 🔥 UPDATED: Validate existing bins with connection support
   */
  async validateExistingBinsOnly(
    poolAddress: string,
    minBinId: number,
    maxBinId: number,
    customConnection?: Connection
  ): Promise<{ isValid: boolean; existingBins: number[]; error?: string }> {
    try {
      const existingBins = await this.checkExistingBins(poolAddress, minBinId, maxBinId, customConnection);
      
      if (existingBins.length === 0) {
        return {
          isValid: false,
          existingBins: [],
          error: 'No existing bins found in the specified range. Please select a range with existing liquidity.'
        };
      }
      
      // Require at least 3 existing bins for safety
      if (existingBins.length < 3) {
        return {
          isValid: false,
          existingBins,
          error: `Only ${existingBins.length} existing bins found. At least 3 existing bins required for safe liquidity provision.`
        };
      }
      
      return {
        isValid: true,
        existingBins
      };
    } catch (error) {
      return {
        isValid: false,
        existingBins: [],
        error: 'Failed to validate existing bins: ' + (error instanceof Error ? error.message : String(error))
      };
    }
  }

  /**
   * 🔥 NEW: Clear cache (useful for connection changes)
   */
  clearCache(): void {
    console.log('🗑️ Clearing DLMM service cache');
    this.poolInstances.clear();
  }

  /**
   * 🔥 NEW: Get cache statistics
   */
  getCacheStats(): { totalPools: number; cacheKeys: string[] } {
    return {
      totalPools: this.poolInstances.size,
      cacheKeys: Array.from(this.poolInstances.keys())
    };
  }
}

// 🔥 UPDATED: Enhanced hook with Web3Auth validation
export function useMeteoraDlmmService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraDlmmService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
    
    // 🔥 NEW: Helper function to handle DLMM errors
    handleDLMMError: (error: unknown): string => {
      if (error instanceof DLMMError) {
        return error.userFriendlyMessage;
      }
      return 'An unexpected error occurred. Please try again.';
    },
    
    // 🔥 UPDATED: Helper to validate existing bins with custom connection
    validateExistingBinsRange: async (
      poolAddress: string,
      minBinId: number,
      maxBinId: number,
      customConnection?: Connection
    ) => {
      return await service.validateExistingBinsOnly(poolAddress, minBinId, maxBinId, customConnection);
    },
    
    // 🔥 NEW: Helper to validate pool connection
    validatePoolConnection: async (poolAddress: string, customConnection?: Connection) => {
      try {
        const connectionToUse = customConnection || connection;
        return await service.validatePoolConnection(poolAddress, connectionToUse);
      } catch (error) {
        console.error('Pool connection validation failed:', error);
        return false;
      }
    },
    
    // 🔥 NEW: Clear service cache
    clearCache: () => service.clearCache(),
    
    // 🔥 NEW: Get cache stats
    getCacheStats: () => service.getCacheStats()
  };
}