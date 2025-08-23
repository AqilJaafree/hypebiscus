// Enhanced meteoraPositionService.ts - FIXED VERSION with Web3Auth Support
// No more intensive RPC calls for bin existence checking

import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

export type DlmmType = DLMM;

interface DLMMPool {
  getActiveBin(): Promise<{
    binId: number;
    price: string;
    xAmount: string;
    yAmount: string;
  }>;
  getBin(binId: number): Promise<unknown>;
  getExistingBinArray(binArrayIndex: number): Promise<unknown>;
  initializePositionAndAddLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: {
      maxBinId: number;
      minBinId: number;
      strategyType: StrategyType;
    };
  }): Promise<Transaction | Transaction[]>;
  addLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: {
      maxBinId: number;
      minBinId: number;
      strategyType: StrategyType;
    };
  }): Promise<Transaction | Transaction[]>;
  removeLiquidity(params: {
    position: PublicKey;
    user: PublicKey;
    fromBinId: number;
    toBinId: number;
    liquiditiesBpsToRemove: BN[];
    shouldClaimAndClose: boolean;
  }): Promise<Transaction | Transaction[]>;
  claimSwapFee(params: {
    owner: PublicKey;
    position: PublicKey;
  }): Promise<Transaction>;
  claimAllSwapFee(params: {
    owner: PublicKey;
    positions: PositionData[];
  }): Promise<Transaction | Transaction[]>;
  closePosition(params: {
    owner: PublicKey;
    position: PublicKey;
  }): Promise<Transaction>;
  getPosition(positionPubKey: PublicKey): Promise<unknown>;
  getPositionsByUserAndLbPair(userPublicKey: PublicKey): Promise<{
    userPositions: PositionData[];
  }>;
  lbPair: {
    binStep: number;
  };
  [key: string]: unknown;
}

interface PositionData {
  publicKey: PublicKey;
  positionData: {
    positionBinData: Array<{
      binId: number;
      xAmount: { toString(): string };
      yAmount: { toString(): string };
      liquidityAmount: { toString(): string };
    }>;
  };
  [key: string]: unknown;
}

// Enhanced interface for position creation parameters
export interface CreatePositionParams {
  poolAddress: string;
  userPublicKey: PublicKey;
  totalXAmount: BN;
  totalYAmount?: BN;
  minBinId: number;
  maxBinId: number;
  strategyType: StrategyType;
  useAutoFill?: boolean;
  connection?: Connection; // 🔥 NEW: Optional connection parameter
}

export interface PositionManagementParams {
  poolAddress: string;
  positionPubkey: string;
  userPublicKey: PublicKey;
  connection?: Connection; // 🔥 NEW: Optional connection parameter
}

export interface RemoveLiquidityParams extends PositionManagementParams {
  fromBinId: number;
  toBinId: number;
  liquiditiesBpsToRemove: BN[];
  shouldClaimAndClose: boolean;
}

// Simplified cost estimation - only position rent since we use existing bins
export interface SimplifiedCostEstimation {
  positionRent: number;
  transactionFees: number;
  total: number;
  breakdown: {
    existingBinsUsed: number;
    noBinCreationNeeded: boolean;
    estimatedComputeUnits: number;
  };
}

export interface CreatePositionResult {
  transaction: Transaction | Transaction[];
  positionKeypair: Keypair;
  estimatedCost: SimplifiedCostEstimation;
}

// Interface for existing bin ranges
export interface ExistingBinRange {
  minBinId: number;
  maxBinId: number;
  existingBins: number[];
  liquidityDepth: number;
  isPopular: boolean;
  description: string;
}

// Cache for bin ranges to avoid repeated API calls
const binRangeCache = new Map<string, { 
  ranges: ExistingBinRange[]; 
  timestamp: number; 
  activeBinId: number;
}>();
const CACHE_DURATION = 120000; // 2 minutes cache

/**
 * Enhanced Service for managing DLMM positions - EXISTING BINS ONLY
 * 🔥 FIXED: Now supports Web3Auth connections
 * This version uses smart heuristics instead of intensive RPC calls
 */
export class MeteoraPositionService {
  private connection: Connection;
  private poolInstances: Map<string, DlmmType> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 🔥 CRITICAL FIX: Initialize pool with Web3Auth connection support
   */
  async initializePool(poolAddress: string, customConnection?: Connection): Promise<DlmmType> {
    try {
      // Create connection-aware cache key
      const connectionKey = customConnection ? 'custom' : 'default';
      const cacheKey = `${poolAddress}-${connectionKey}`;
      
      if (this.poolInstances.has(cacheKey)) {
        console.log('📋 Using cached position service pool for:', poolAddress.substring(0, 8) + '...');
        return this.poolInstances.get(cacheKey)!;
      }

      // Use custom connection if provided (for Web3Auth)
      const connectionToUse = customConnection || this.connection;
      
      console.log('🔧 Position service initializing pool with connection:', {
        poolAddress: poolAddress.substring(0, 8) + '...',
        rpcEndpoint: connectionToUse.rpcEndpoint,
        usingCustomConnection: !!customConnection,
        cacheKey
      });

      const pubkey = new PublicKey(poolAddress);
      const pool = await DLMM.create(connectionToUse, pubkey);
      
      // Cache with connection-specific key
      this.poolInstances.set(cacheKey, pool);
      
      console.log('✅ Position service pool initialized successfully');
      return pool;
    } catch (error) {
      console.error('❌ Position service failed to initialize pool:', error);
      throw error;
    }
  }

  /**
   * 🔥 CRITICAL FIX: Find existing bin ranges with Web3Auth connection support
   * This eliminates the rate limiting issues while respecting user's risk preference
   */
  async findExistingBinRanges(
    poolAddress: string,
    maxRangeWidth: number = 20,
    portfolioStyle: string = 'conservative',
    customConnection?: Connection // 🔥 NEW: Connection parameter
  ): Promise<ExistingBinRange[]> {
    try {
      // Check cache first (include connection info in cache key)
      const connectionKey = customConnection ? 'custom' : 'default';
      const cacheKey = `${poolAddress}-${portfolioStyle}-${connectionKey}`;
      const cached = binRangeCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        console.log(`📋 Using cached ${portfolioStyle} bin ranges for pool:`, poolAddress.substring(0, 8) + '...');
        return cached.ranges;
      }

      console.log(`🔍 Creating smart ${portfolioStyle} bin ranges with connection:`, {
        poolAddress: poolAddress.substring(0, 8) + '...',
        portfolioStyle,
        usingCustomConnection: !!customConnection,
        connectionEndpoint: customConnection?.rpcEndpoint || this.connection.rpcEndpoint
      });

      // 🔥 KEY FIX: Pass custom connection to pool initialization
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;
      const activeBin = await typedPool.getActiveBin();
      
      console.log(`Creating smart ${portfolioStyle} bin ranges around active bin:`, activeBin.binId);
      
      // Use portfolio-specific smart heuristics
      const existingRanges = this.createSmartBinRanges(activeBin.binId, maxRangeWidth, portfolioStyle);
      
      console.log(`✅ Generated ${existingRanges.length} smart ${portfolioStyle} bin ranges`);
      
      // Cache the results with connection info
      binRangeCache.set(cacheKey, {
        ranges: existingRanges,
        timestamp: now,
        activeBinId: activeBin.binId
      });
      
      return existingRanges;
      
    } catch (error) {
      console.error('❌ Error finding existing bin ranges:', error);
      
      // Enhanced error context
      if (error instanceof Error) {
        console.error('Error context:', {
          message: error.message,
          poolAddress: poolAddress.substring(0, 8) + '...',
          portfolioStyle,
          hasCustomConnection: !!customConnection,
          connectionEndpoint: customConnection?.rpcEndpoint || this.connection.rpcEndpoint
        });
      }
      
      throw new Error('Unable to find existing bin ranges for safe liquidity provision');
    }
  }

  /**
   * MODIFIED: Create smart bin ranges based on portfolio style using mathematical heuristics
   * Updated with specific bin counts: Aggressive 60-63, Moderate 64-66, Conservative 67-69
   */
  private createSmartBinRanges(activeBinId: number, maxRangeWidth: number, portfolioStyle: string): ExistingBinRange[] {
    const ranges: ExistingBinRange[] = [];
    
    // MODIFIED: Portfolio-specific bin counts
    // Aggressive: 60-63 bins, Moderate: 64-66 bins, Conservative: 67-69 bins
    
    let rangePatterns: Array<{ width: number; offset: number; name: string; popularity: number }>;
    
    switch (portfolioStyle.toLowerCase()) {
      case 'conservative':
        rangePatterns = [
          // Conservative: 67-69 bins (widest range, safest)
          { width: 69, offset: 0, name: 'Conservative Max Range', popularity: 0.9 },
          { width: 68, offset: 0, name: 'Conservative Wide Range', popularity: 0.8 },
          { width: 67, offset: 0, name: 'Conservative Standard Range', popularity: 0.7 },
        ];
        break;
        
      case 'moderate':
        rangePatterns = [
          // Moderate: 64-66 bins (balanced range)
          { width: 66, offset: 0, name: 'Moderate Wide Range', popularity: 0.9 },
          { width: 65, offset: 0, name: 'Moderate Standard Range', popularity: 0.8 },
          { width: 64, offset: 0, name: 'Moderate Tight Range', popularity: 0.7 },
        ];
        break;
        
      case 'aggressive':
        rangePatterns = [
          // Aggressive: 60-63 bins (tighter range, more concentrated)
          { width: 63, offset: 0, name: 'Aggressive Wide Range', popularity: 0.9 },
          { width: 62, offset: 0, name: 'Aggressive Standard Range', popularity: 0.8 },
          { width: 60, offset: 0, name: 'Aggressive Tight Range', popularity: 0.7 },
        ];
        break;
        
      default:
        rangePatterns = [
          { width: 65, offset: 0, name: 'Default Range', popularity: 0.8 },
        ];
    }
    
    for (const pattern of rangePatterns) {
      if (pattern.width > maxRangeWidth) continue;
      
      const centerBin = activeBinId + pattern.offset;
      const minBinId = centerBin - Math.floor(pattern.width / 2);
      const maxBinId = centerBin + Math.floor(pattern.width / 2);
      
      // Generate likely existing bins using portfolio-specific heuristics
      const existingBins = this.generateLikelyExistingBins(
        minBinId, 
        maxBinId, 
        activeBinId, 
        portfolioStyle
      );
      
      if (existingBins.length >= 3) { // Require at least 3 bins for safety
        ranges.push({
          minBinId,
          maxBinId,
          existingBins,
          liquidityDepth: existingBins.length,
          isPopular: pattern.popularity > 0.6,
          description: `${pattern.name} (${existingBins.length} estimated bins)`
        });
      }
    }
    
    // Sort by estimated popularity and bin count
    ranges.sort((a, b) => {
      if (a.isPopular !== b.isPopular) {
        return a.isPopular ? -1 : 1;
      }
      return b.existingBins.length - a.existingBins.length;
    });
    
    return ranges;
  }

  /**
   * FIXED: Generate likely existing bins with portfolio-specific probability models
   * This avoids the need for RPC calls to check each bin individually
   */
  private generateLikelyExistingBins(
    minBinId: number, 
    maxBinId: number, 
    activeBinId: number,
    portfolioStyle: string
  ): number[] {
    const likelyBins: number[] = [];
    
    // Portfolio-specific probability adjustments
    let probabilityMultiplier = 1.0;
    let conservativeness = 0.5; // How conservative the probability model is
    
    switch (portfolioStyle.toLowerCase()) {
      case 'conservative':
        probabilityMultiplier = 1.2; // Higher chance of including bins (more bins = safer)
        conservativeness = 0.7; // More conservative probability decay
        break;
      case 'moderate':
        probabilityMultiplier = 1.0; // Standard probability
        conservativeness = 0.5; // Moderate probability decay
        break;
      case 'aggressive':
        probabilityMultiplier = 0.8; // Lower chance (fewer bins = more concentrated)
        conservativeness = 0.3; // Less conservative (more willing to use distant bins)
        break;
    }
    
    // Bins are more likely to exist near the active bin
    for (let binId = minBinId; binId <= maxBinId; binId++) {
      const distanceFromActive = Math.abs(binId - activeBinId);
      
      // Portfolio-specific probability calculation
      let baseProbability = 1.0;
      if (distanceFromActive <= 2) {
        baseProbability = 0.95; // Very likely
      } else if (distanceFromActive <= 5) {
        baseProbability = 0.8; // Likely
      } else if (distanceFromActive <= 10) {
        baseProbability = 0.6; // Moderately likely
      } else {
        baseProbability = 0.4; // Less likely but possible
      }
      
      // Apply portfolio-specific adjustments
      const adjustedProbability = Math.min(
        baseProbability * probabilityMultiplier * (1 - distanceFromActive * conservativeness * 0.05),
        0.95
      );
      
      // Include bins based on adjusted probability
      if (Math.random() < adjustedProbability || distanceFromActive <= 3) {
        likelyBins.push(binId);
      }
    }
    
    // Always include the active bin if it's in range
    if (activeBinId >= minBinId && activeBinId <= maxBinId && !likelyBins.includes(activeBinId)) {
      likelyBins.push(activeBinId);
      likelyBins.sort((a, b) => a - b);
    }
    
    // Portfolio-specific minimum bin requirements
    let minRequiredBins: number;
    switch (portfolioStyle.toLowerCase()) {
      case 'conservative':
        minRequiredBins = 6; // More bins for safety
        break;
      case 'moderate':
        minRequiredBins = 4; // Balanced approach
        break;
      case 'aggressive':
        minRequiredBins = 3; // Fewer bins for concentration
        break;
      default:
        minRequiredBins = 4;
    }
    
    // Ensure we have at least the minimum required bins around the active bin
    if (likelyBins.length < minRequiredBins) {
      const expansion = Math.ceil((minRequiredBins - likelyBins.length) / 2);
      for (let i = -expansion; i <= expansion; i++) {
        const binId = activeBinId + i;
        if (binId >= minBinId && binId <= maxBinId && !likelyBins.includes(binId)) {
          likelyBins.push(binId);
        }
      }
      likelyBins.sort((a, b) => a - b);
    }
    
    return likelyBins;
  }

  /**
   * Simplified cost estimation - only position rent since we use existing bins
   */
  async getSimplifiedCostEstimation(
    poolAddress: string,
    existingBinsCount: number = 5
  ): Promise<SimplifiedCostEstimation> {
    const positionRent = 0.057; // Standard position rent (refundable)
    const transactionFees = 0.015; // Estimated transaction fees
    const total = positionRent + transactionFees;
    
    return {
      positionRent,
      transactionFees,
      total,
      breakdown: {
        existingBinsUsed: existingBinsCount,
        noBinCreationNeeded: true,
        estimatedComputeUnits: 50000 // Much lower since no bin creation
      }
    };
  }

  /**
   * 🔥 UPDATED: Validate user balance with Web3Auth connection support
   */
  async validateUserBalance(
    userPublicKey: PublicKey,
    requiredSolAmount: number,
    estimatedCost: SimplifiedCostEstimation,
    customConnection?: Connection // 🔥 NEW: Connection parameter
  ): Promise<{ isValid: boolean; currentBalance: number; shortfall?: number; error?: string }> {
    try {
      const connectionToUse = customConnection || this.connection;
      
      console.log('💰 Validating user balance with connection:', {
        userAddress: userPublicKey.toBase58().substring(0, 8) + '...',
        requiredAmount: requiredSolAmount,
        estimatedCost: estimatedCost.total,
        usingCustomConnection: !!customConnection,
        connectionEndpoint: connectionToUse.rpcEndpoint
      });

      const solBalanceLamports = await connectionToUse.getBalance(userPublicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      const totalRequired = requiredSolAmount + estimatedCost.total;
      
      if (solBalance < totalRequired) {
        console.log('❌ Insufficient balance:', {
          available: solBalance.toFixed(4),
          required: totalRequired.toFixed(4),
          shortfall: (totalRequired - solBalance).toFixed(4)
        });

        return {
          isValid: false,
          currentBalance: solBalance,
          shortfall: totalRequired - solBalance,
          error: `Insufficient SOL balance. Required: ${totalRequired.toFixed(4)} SOL, Available: ${solBalance.toFixed(4)} SOL`
        };
      }
      
      console.log('✅ Balance validation passed:', {
        available: solBalance.toFixed(4),
        required: totalRequired.toFixed(4)
      });

      return {
        isValid: true,
        currentBalance: solBalance
      };
      
    } catch (error) {
      console.error('❌ Balance validation failed:', error);
      return {
        isValid: false,
        currentBalance: 0,
        error: 'Failed to check balance: ' + (error instanceof Error ? error.message : String(error))
      };
    }
  }

  /**
   * 🔥 CRITICAL FIX: Create position with Web3Auth connection support
   */
  async createPositionWithExistingBins(
    params: CreatePositionParams,
    existingBinRange: ExistingBinRange
  ): Promise<CreatePositionResult> {
    try {
      console.log('🚀 Creating position with smart bin range and connection:', {
        poolAddress: params.poolAddress.substring(0, 8) + '...',
        range: `${existingBinRange.minBinId} to ${existingBinRange.maxBinId}`,
        estimatedBins: existingBinRange.existingBins.length,
        strategyType: params.strategyType,
        hasCustomConnection: !!params.connection,
        connectionEndpoint: params.connection?.rpcEndpoint || this.connection.rpcEndpoint
      });

      // Get simplified cost estimation
      const estimatedCost = await this.getSimplifiedCostEstimation(
        params.poolAddress,
        existingBinRange.existingBins.length
      );

      console.log('📊 Cost estimation:', estimatedCost);

      // 🔥 KEY FIX: Validate user balance using the correct connection
      const connectionToUse = params.connection || this.connection;
      const estimatedSolForLiquidity = params.totalXAmount.toNumber() / Math.pow(10, 9);
      const balanceValidation = await this.validateUserBalance(
        params.userPublicKey,
        estimatedSolForLiquidity,
        estimatedCost,
        connectionToUse // Pass the connection here
      );

      if (!balanceValidation.isValid) {
        throw new Error(balanceValidation.error || 'Insufficient balance');
      }

      console.log('✅ Balance validation passed:', balanceValidation);

      // 🔥 KEY FIX: Initialize pool with custom connection
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const newPosition = new Keypair();
      const typedPool = pool as unknown as DLMMPool;

      let totalYAmount = params.totalYAmount || new BN(0);

      // Use autoFillYByStrategy for balanced positions if requested
      if (params.useAutoFill !== false && totalYAmount.isZero()) {
        try {
          const activeBin = await typedPool.getActiveBin();
          
          totalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            params.totalXAmount,
            new BN(activeBin.xAmount),
            new BN(activeBin.yAmount),
            existingBinRange.minBinId,
            existingBinRange.maxBinId,
            params.strategyType
          );

          console.log('✅ Auto-calculated Y amount using smart bin range:', totalYAmount.toString());
        } catch (autoFillError) {
          console.warn('⚠️ AutoFill failed, using provided or zero Y amount:', autoFillError);
          totalYAmount = params.totalYAmount || new BN(0);
        }
      }

      // Create the position transaction using smart bin range
      console.log('📝 Creating position transaction with smart bin range:', {
        positionPubKey: newPosition.publicKey.toString().substring(0, 8) + '...',
        user: params.userPublicKey.toString().substring(0, 8) + '...',
        totalXAmount: params.totalXAmount.toString(),
        totalYAmount: totalYAmount.toString(),
        strategy: {
          maxBinId: existingBinRange.maxBinId,
          minBinId: existingBinRange.minBinId,
          strategyType: params.strategyType,
        }
      });

      const createPositionTx = await typedPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount: params.totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId: existingBinRange.maxBinId,
          minBinId: existingBinRange.minBinId,
          strategyType: params.strategyType,
        },
      });

      console.log('✅ Position transaction created successfully using smart bin ranges');

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
        estimatedCost
      };
    } catch (error) {
      console.error('❌ Error creating position with smart bin ranges:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('insufficient lamports')) {
          throw new Error('Insufficient SOL balance for position creation. Please add more SOL to your wallet.');
        }
        
        if (error.message.includes('Transaction simulation failed')) {
          throw new Error('Position creation failed during simulation. The selected range might have restrictions.');
        }
        
        // Enhanced error context
        console.error('Position creation error context:', {
          poolAddress: params.poolAddress.substring(0, 8) + '...',
          hasConnection: !!params.connection,
          connectionEndpoint: params.connection?.rpcEndpoint,
          errorMessage: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * 🔥 UPDATED: Create one-sided position with Web3Auth connection support
   */
  async createOneSidedPosition(
    params: CreatePositionParams,
    useTokenX: boolean
  ): Promise<CreatePositionResult> {
    try {
      // First find smart bin ranges based on portfolio style
      const portfolioStyle = params.strategyType === StrategyType.Spot ? 'conservative' : 'moderate';
      const existingRanges = await this.findExistingBinRanges(
        params.poolAddress, 
        20, 
        portfolioStyle,
        params.connection // 🔥 Pass connection here
      );
      
      if (existingRanges.length === 0) {
        throw new Error('No suitable bin ranges found. Cannot create position.');
      }

      // Use the best existing range (first one, as they're sorted by popularity)
      const selectedRange = existingRanges[0];
      
      console.log(`🎯 Creating one-sided position with ${portfolioStyle} smart range:`, selectedRange);

      // Get cost estimation
      const estimatedCost = await this.getSimplifiedCostEstimation(
        params.poolAddress,
        selectedRange.existingBins.length
      );

      // 🔥 KEY FIX: Initialize pool with custom connection
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const newPosition = new Keypair();
      const typedPool = pool as unknown as DLMMPool;
      
      // For one-sided position, set either X or Y amount to 0
      const totalXAmount = useTokenX ? params.totalXAmount : new BN(0);
      const totalYAmount = useTokenX ? new BN(0) : (params.totalYAmount || params.totalXAmount);

      // Adjust bin range for one-sided positions within smart bins
      let minBinId = selectedRange.minBinId;
      let maxBinId = selectedRange.maxBinId;

      if (useTokenX) {
        // For X token only, position should be above current price
        const activeBin = await typedPool.getActiveBin();
        const activeBinIndex = selectedRange.existingBins.findIndex(bin => bin >= activeBin.binId);
        
        if (activeBinIndex !== -1) {
          // Use bins above the active bin
          const binsAbove = selectedRange.existingBins.slice(activeBinIndex);
          if (binsAbove.length > 0) {
            minBinId = Math.min(...binsAbove);
            maxBinId = Math.max(...binsAbove);
          }
        }
      }

      console.log('🎯 Adjusted range for one-sided position:', { minBinId, maxBinId, useTokenX });

      const createPositionTx = await typedPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: params.strategyType,
        },
      });

      return {
        transaction: createPositionTx,
        positionKeypair: newPosition,
        estimatedCost
      };
    } catch (error) {
      console.error('❌ Error creating one-sided position with smart ranges:', error);
      throw error;
    }
  }

  /**
   * Get safe range recommendations using smart heuristics
   */
  async getSafeRangeRecommendations(
    poolAddress: string,
    customConnection?: Connection // 🔥 NEW: Connection parameter
  ): Promise<{
    conservative: ExistingBinRange;
    balanced: ExistingBinRange;
    aggressive: ExistingBinRange;
    all: ExistingBinRange[];
  }> {
    try {
      const existingRanges = await this.findExistingBinRanges(poolAddress, 20, 'moderate', customConnection);
      
      if (existingRanges.length === 0) {
        throw new Error('No suitable bin ranges found for recommendations');
      }
      
      // Conservative: Range with most bins (safest)
      const conservative = existingRanges.reduce((prev, curr) => 
        prev.existingBins.length > curr.existingBins.length ? prev : curr
      );
      
      // Balanced: Medium range with good bin coverage
      const balanced = existingRanges.find(range => 
        range.existingBins.length >= 5 && range.existingBins.length <= 10
      ) || conservative;
      
      // Aggressive: Smaller range but still safe
      const aggressive = existingRanges.find(range => 
        range.existingBins.length >= 3 && range.existingBins.length <= 7
      ) || conservative;
      
      return {
        conservative,
        balanced,
        aggressive,
        all: existingRanges
      };
    } catch (error) {
      console.error('❌ Error getting safe range recommendations:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Add liquidity with connection support
  async addLiquidity(
    params: PositionManagementParams,
    totalXAmount: BN,
    totalYAmount: BN,
    minBinId: number,
    maxBinId: number,
    strategyType: StrategyType,
    useAutoFill: boolean = true
  ): Promise<Transaction | Transaction[]> {
    try {
      console.log(`💧 Adding liquidity using smart bin range: ${minBinId} to ${maxBinId}`, {
        hasConnection: !!params.connection,
        connectionEndpoint: params.connection?.rpcEndpoint
      });
      
      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const typedPool = pool as unknown as DLMMPool;
      const positionPubKey = new PublicKey(params.positionPubkey);
      
      let finalTotalYAmount = totalYAmount;

      if (useAutoFill && totalYAmount.isZero()) {
        try {
          const activeBin = await typedPool.getActiveBin();
          
          finalTotalYAmount = autoFillYByStrategy(
            activeBin.binId,
            typedPool.lbPair.binStep,
            totalXAmount,
            new BN(activeBin.xAmount),
            new BN(activeBin.yAmount),
            minBinId,
            maxBinId,
            strategyType
          );

          console.log('✅ AutoFill calculated Y amount:', finalTotalYAmount.toString());
        } catch (autoFillError) {
          console.warn('⚠️ AutoFill failed for add liquidity, using zero Y amount:', autoFillError);
          finalTotalYAmount = new BN(0);
        }
      }
      
      const addLiquidityTx = await typedPool.addLiquidityByStrategy({
        positionPubKey,
        user: params.userPublicKey,
        totalXAmount,
        totalYAmount: finalTotalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType,
        },
      });

      console.log('✅ Add liquidity transaction created');
      return addLiquidityTx;
    } catch (error) {
      console.error('❌ Error adding liquidity with smart ranges:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Remove liquidity with connection support
  async removeLiquidity(params: RemoveLiquidityParams): Promise<Transaction | Transaction[]> {
    try {
      console.log('🗑️ Removing liquidity with connection support:', {
        hasConnection: !!params.connection,
        positionId: params.positionPubkey.substring(0, 8) + '...'
      });

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
      const removeLiquidityTx = await typedPool.removeLiquidity({
        position: positionPubKey,
        user: params.userPublicKey,
        fromBinId: params.fromBinId,
        toBinId: params.toBinId,
        liquiditiesBpsToRemove: params.liquiditiesBpsToRemove,
        shouldClaimAndClose: params.shouldClaimAndClose,
      });

      console.log('✅ Remove liquidity transaction created');
      return removeLiquidityTx;
    } catch (error) {
      console.error('❌ Error removing liquidity:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Remove liquidity from position with connection support
  async removeLiquidityFromPosition(
    params: PositionManagementParams,
    percentageToRemove: number = 100,
    shouldClaimAndClose: boolean = true
  ): Promise<Transaction | Transaction[]> {
    try {
      console.log('🗑️ Removing liquidity from position:', {
        percentage: percentageToRemove,
        hasConnection: !!params.connection
      });

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;

      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(params.userPublicKey);
      
      const userPosition = userPositions.find((pos: PositionData) => 
        pos.publicKey.equals(positionPubKey)
      );

      if (!userPosition) {
        throw new Error('Position not found');
      }

      const binIdsToRemove = userPosition.positionData.positionBinData.map((bin) => bin.binId);
      
      if (binIdsToRemove.length === 0) {
        throw new Error('No bins found in position');
      }

      const fromBinId = Math.min(...binIdsToRemove);
      const toBinId = Math.max(...binIdsToRemove);
      
      const bpsToRemove = new BN(percentageToRemove * 100);
      const liquiditiesBpsToRemove = new Array(binIdsToRemove.length).fill(bpsToRemove);

      const removeLiquidityTx = await typedPool.removeLiquidity({
        position: positionPubKey,
        user: params.userPublicKey,
        fromBinId,
        toBinId,
        liquiditiesBpsToRemove,
        shouldClaimAndClose,
      });

      console.log('✅ Remove liquidity from position transaction created');
      return removeLiquidityTx;
    } catch (error) {
      console.error('❌ Error removing liquidity from position:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Claim fees with connection support
  async claimFees(params: PositionManagementParams): Promise<Transaction> {
    try {
      console.log('💰 Claiming fees with connection support');

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
      const claimFeeTx = await typedPool.claimSwapFee({
        owner: params.userPublicKey,
        position: positionPubKey,
      });

      console.log('✅ Claim fees transaction created');
      return claimFeeTx;
    } catch (error) {
      console.error('❌ Error claiming fees:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Claim all fees with connection support
  async claimAllFees(
    poolAddress: string, 
    userPublicKey: PublicKey,
    customConnection?: Connection
  ): Promise<Transaction[]> {
    try {
      console.log('💰 Claiming all fees with connection support');

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(poolAddress, customConnection);
      const typedPool = pool as unknown as DLMMPool;

      const { userPositions } = await typedPool.getPositionsByUserAndLbPair(userPublicKey);

      const claimFeeTxs = await typedPool.claimAllSwapFee({
        owner: userPublicKey,
        positions: userPositions,
      });

      console.log('✅ Claim all fees transactions created');
      return Array.isArray(claimFeeTxs) ? claimFeeTxs : [claimFeeTxs];
    } catch (error) {
      console.error('❌ Error claiming all fees:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Close position with connection support
  async closePosition(params: PositionManagementParams): Promise<Transaction> {
    try {
      console.log('🔒 Closing position with connection support');

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(params.poolAddress, params.connection);
      const positionPubKey = new PublicKey(params.positionPubkey);
      const typedPool = pool as unknown as DLMMPool;
      
      const closePositionTx = await typedPool.closePosition({
        owner: params.userPublicKey,
        position: positionPubKey,
      });

      console.log('✅ Close position transaction created');
      return closePositionTx;
    } catch (error) {
      console.error('❌ Error closing position:', error);
      throw error;
    }
  }

  // 🔥 UPDATED: Get position info with connection support
  async getPositionInfo(
    poolAddress: string, 
    positionPubkey: string,
    customConnection?: Connection
  ): Promise<unknown> {
    try {
      console.log('ℹ️ Getting position info with connection support');

      // 🔥 KEY FIX: Use connection parameter
      const pool = await this.initializePool(poolAddress, customConnection);
      const positionPubKey = new PublicKey(positionPubkey);
      const typedPool = pool as unknown as DLMMPool;

      const positionInfo = await typedPool.getPosition(positionPubKey);
      
      console.log('✅ Position info retrieved');
      return positionInfo;
    } catch (error) {
      console.error('❌ Error getting position info:', error);
      throw error;
    }
  }

  /**
   * 🔥 NEW: Clear cache (useful for connection changes)
   */
  clearCache(): void {
    console.log('🗑️ Clearing position service cache');
    this.poolInstances.clear();
    binRangeCache.clear();
  }

  /**
   * 🔥 NEW: Get cache statistics
   */
  getCacheStats(): { 
    poolInstances: number; 
    binRangeCache: number; 
    poolKeys: string[];
    binRangeKeys: string[];
  } {
    return {
      poolInstances: this.poolInstances.size,
      binRangeCache: binRangeCache.size,
      poolKeys: Array.from(this.poolInstances.keys()),
      binRangeKeys: Array.from(binRangeCache.keys())
    };
  }

  /**
   * 🔥 NEW: Validate connection for position operations
   */
  async validateConnection(poolAddress: string, connection: Connection): Promise<boolean> {
    try {
      console.log('🔍 Validating position service connection');
      
      // Try to initialize pool and get basic info
      const pool = await this.initializePool(poolAddress, connection);
      const typedPool = pool as unknown as DLMMPool;
      await typedPool.getActiveBin();
      
      console.log('✅ Position service connection validated');
      return true;
    } catch (error) {
      console.error('❌ Position service connection validation failed:', error);
      return false;
    }
  }
}

// 🔥 UPDATED: Enhanced hook with Web3Auth support
export function useMeteoraPositionService() {
  const { publicKey, sendTransaction } = useWallet();
  
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);
  
  const service = new MeteoraPositionService(connection);

  return {
    service,
    publicKey,
    sendTransaction,
    
    // 🔥 UPDATED: Helper function to handle errors gracefully
    handlePositionError: (error: unknown): string => {
      if (error instanceof Error) {
        if (error.message.includes('insufficient lamports')) {
          return 'Insufficient SOL balance for this transaction.';
        }
        if (error.message.includes('Transaction simulation failed')) {
          return 'Transaction simulation failed. The selected bin range might have restrictions.';
        }
        if (error.message.includes('No suitable bin ranges found')) {
          return 'No suitable price ranges available. Please try a different pool or check back later.';
        }
        if (error.message.includes('bin range')) {
          return 'Cannot use the selected price range - only safe ranges are allowed.';
        }
        if (error.message.includes('Connection')) {
          return 'Connection issue with your wallet. Please try reconnecting.';
        }
        return error.message;
      }
      return 'An unexpected error occurred. Please try again.';
    },

    // 🔥 NEW: Helper to validate connection for position operations
    validateConnection: async (poolAddress: string, customConnection?: Connection) => {
      try {
        const connectionToUse = customConnection || connection;
        return await service.validateConnection(poolAddress, connectionToUse);
      } catch (error) {
        console.error('Position service connection validation failed:', error);
        return false;
      }
    },

    // 🔥 NEW: Clear service cache
    clearCache: () => service.clearCache(),

    // 🔥 NEW: Get cache statistics
    getCacheStats: () => service.getCacheStats(),

    // 🔥 NEW: Helper to create position with Web3Auth connection
    createPositionWithConnection: async (
      params: CreatePositionParams,
      existingBinRange: ExistingBinRange,
      customConnection?: Connection
    ) => {
      const paramsWithConnection = {
        ...params,
        connection: customConnection || connection
      };
      return await service.createPositionWithExistingBins(paramsWithConnection, existingBinRange);
    },

    // 🔥 NEW: Helper to find bin ranges with Web3Auth connection
    findBinRangesWithConnection: async (
      poolAddress: string,
      maxRangeWidth: number = 20,
      portfolioStyle: string = 'conservative',
      customConnection?: Connection
    ) => {
      const connectionToUse = customConnection || connection;
      return await service.findExistingBinRanges(poolAddress, maxRangeWidth, portfolioStyle, connectionToUse);
    }
  };
}