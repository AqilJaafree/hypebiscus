// src/lib/meteora/meteoraChatCommands.ts
import { MeteoraDlmmService} from './meteoraDlmmService';
import { MeteoraPositionService } from './meteoraPositionService';
import { PublicKey } from '@solana/web3.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { BN } from 'bn.js';

// Command types
export enum CommandType {
  GET_POOLS,
  GET_POSITION,
  ADD_LIQUIDITY,
  REMOVE_LIQUIDITY,
  CLAIM_FEES,
  CLOSE_POSITION,
  SWAP,
  UNKNOWN
}

// Define the data types for different commands
export interface PoolInfo {
  name: string;
  address: string;
  price: string;
  binStep: string;
  tokenX?: string;
  tokenY?: string;
  activeBinId?: number;
}

export interface PositionInfo {
  id: string;
  bins: number;
  totalValue?: number;
  poolName?: string;
}

export interface CommandData {
  pools?: PoolInfo[];
  positions?: PositionInfo[];
  amount?: number;
  token?: string;
  fromToken?: string;
  toToken?: string;
  poolAddress?: string;
  positionId?: string;
  percentage?: number;
  estimatedYAmount?: string;
  useAutoFill?: boolean;
}

// Command result interface
export interface CommandResult {
  type: CommandType;
  success: boolean;
  message: string;
  data?: CommandData;
  error?: string;
}

// Parse command interface
export interface CommandParams {
  command: string;
  userPublicKey?: PublicKey;
  service: {
    dlmm: MeteoraDlmmService;
    position: MeteoraPositionService;
  };
}

/**
 * Parse a chat message to identify and execute DLMM commands
 */
export async function parseDlmmCommand(params: CommandParams): Promise<CommandResult> {
  const { command, userPublicKey, service } = params;
  const lowerCommand = command.toLowerCase().trim();

  // Check if user is connected for non-query commands
  if (!userPublicKey && !isQueryCommand(lowerCommand)) {
    return {
      type: CommandType.UNKNOWN,
      success: false,
      message: "Please connect your wallet to perform DLMM operations.",
      error: "No wallet connected"
    };
  }

  try {
    // Handle get pools command
    if (lowerCommand.includes('list pools') || lowerCommand.includes('show pools') || lowerCommand.includes('get pools')) {
      return await handleGetPoolsCommand(service.dlmm);
    }
    
    // Handle get position command
    else if (lowerCommand.includes('my position') || lowerCommand.includes('show position') || lowerCommand.includes('list position')) {
      if (!userPublicKey) {
        return {
          type: CommandType.GET_POSITION,
          success: false,
          message: "Please connect your wallet to view your positions.",
          error: "No wallet connected"
        };
      }
      
      const poolAddress = extractPoolAddress(lowerCommand);
      return await handleGetPositionCommand(service.dlmm, userPublicKey, poolAddress);
    }
    
    // Handle add liquidity command
    else if (lowerCommand.includes('add liquidity') || lowerCommand.match(/add\s+\d+(\.\d+)?\s+to\s+pool/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: false,
          message: "Please connect your wallet to add liquidity.",
          error: "No wallet connected"
        };
      }
      
      const { amount, token, poolAddress } = extractLiquidityParams(lowerCommand);
      
      if (!amount || !poolAddress) {
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: false,
          message: "Please specify the amount and pool for adding liquidity. Example: 'Add 10 SOL to pool [address]'",
          error: "Invalid parameters"
        };
      }
      
      // Enhanced response with estimated Y amount calculation
      try {
        const activeBin = await service.dlmm.getActiveBin(poolAddress);
        const bnAmount = new BN(amount * Math.pow(10, 9)); // Assuming 9 decimals
        
        // Calculate estimated Y amount for balanced position
        const estimatedY = service.dlmm.calculateBalancedYAmount(
          activeBin.binId,
          50, // Default bin step
          bnAmount,
          activeBin.xAmount,
          activeBin.yAmount,
          activeBin.binId - 10,
          activeBin.binId + 10,
          StrategyType.BidAsk
        );
        
        const estimatedYFormatted = (estimatedY.toNumber() / Math.pow(10, 9)).toFixed(6);
        
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: true,
          message: `Preparing to add ${amount} ${token || ''} to pool ${poolAddress.substring(0, 8)}... Estimated paired amount: ${estimatedYFormatted}`,
          data: { 
            amount, 
            token,
            poolAddress,
            estimatedYAmount: estimatedYFormatted,
            useAutoFill: true
          }
        };
      } catch {
        // Remove unused _error parameter
        return {
          type: CommandType.ADD_LIQUIDITY,
          success: true,
          message: `Preparing to add ${amount} ${token || ''} to pool ${poolAddress.substring(0, 8)}...`,
          data: { amount, token, poolAddress }
        };
      }
    }
    
    // Handle remove liquidity command
    else if (lowerCommand.includes('remove liquidity') || lowerCommand.match(/remove\s+\d+(\.\d+)?%?\s+from\s+position/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.REMOVE_LIQUIDITY,
          success: false,
          message: "Please connect your wallet to remove liquidity.",
          error: "No wallet connected"
        };
      }
      
      const { percentage, positionId } = extractRemoveLiquidityParams(lowerCommand);
      
      if (!percentage || !positionId) {
        return {
          type: CommandType.REMOVE_LIQUIDITY,
          success: false,
          message: "Please specify the percentage and position for removing liquidity. Example: 'Remove 50% from position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.REMOVE_LIQUIDITY,
        success: true,
        message: `Preparing to remove ${percentage}% from position ${positionId.substring(0, 8)}...`,
        data: { percentage, positionId }
      };
    }
    
    // Handle claim fees command
    else if (lowerCommand.includes('claim fee') || lowerCommand.includes('collect fee')) {
      if (!userPublicKey) {
        return {
          type: CommandType.CLAIM_FEES,
          success: false,
          message: "Please connect your wallet to claim fees.",
          error: "No wallet connected"
        };
      }
      
      const positionId = extractPositionId(lowerCommand);
      
      if (!positionId) {
        return {
          type: CommandType.CLAIM_FEES,
          success: false,
          message: "Please specify the position to claim fees from. Example: 'Claim fees from position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.CLAIM_FEES,
        success: true,
        message: `Preparing to claim fees from position ${positionId.substring(0, 8)}...`,
        data: { positionId }
      };
    }
    
    // Handle close position command
    else if (lowerCommand.includes('close position')) {
      if (!userPublicKey) {
        return {
          type: CommandType.CLOSE_POSITION,
          success: false,
          message: "Please connect your wallet to close a position.",
          error: "No wallet connected"
        };
      }
      
      const positionId = extractPositionId(lowerCommand);
      
      if (!positionId) {
        return {
          type: CommandType.CLOSE_POSITION,
          success: false,
          message: "Please specify the position to close. Example: 'Close position [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.CLOSE_POSITION,
        success: true,
        message: `Preparing to close position ${positionId.substring(0, 8)}...`,
        data: { positionId }
      };
    }
    
    // Handle swap command
    else if (lowerCommand.includes('swap') || lowerCommand.match(/swap\s+\d+(\.\d+)?\s+[a-z]+\s+for\s+[a-z]+/i)) {
      if (!userPublicKey) {
        return {
          type: CommandType.SWAP,
          success: false,
          message: "Please connect your wallet to perform a swap.",
          error: "No wallet connected"
        };
      }
      
      const { amount, fromToken, toToken, poolAddress } = extractSwapParams(lowerCommand);
      
      if (!amount || !fromToken || !toToken) {
        return {
          type: CommandType.SWAP,
          success: false,
          message: "Please specify the amount, tokens, and pool for swapping. Example: 'Swap 10 SOL for USDC in pool [address]'",
          error: "Invalid parameters"
        };
      }
      
      return {
        type: CommandType.SWAP,
        success: true,
        message: `Preparing to swap ${amount} ${fromToken} for ${toToken}${poolAddress ? ` in pool ${poolAddress.substring(0, 8)}` : ''}...`,
        data: { amount, fromToken, toToken, poolAddress }
      };
    }
    
    // Unknown command
    else {
      return {
        type: CommandType.UNKNOWN,
        success: false,
        message: "I didn't recognize that as a DLMM command. Try commands like 'list pools', 'show my positions', 'add liquidity', 'remove liquidity', 'claim fees', 'close position', or 'swap'.",
        error: "Unknown command"
      };
    }
  } catch (error) {
    return {
      type: CommandType.UNKNOWN,
      success: false,
      message: "An error occurred while processing your command.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if command is just a query (no wallet needed)
 */
function isQueryCommand(command: string): boolean {
  return command.includes('list pools') || 
         command.includes('show pools') || 
         command.includes('get pools');
}

/**
 * Handle get pools command - IMPROVED
 */
async function handleGetPoolsCommand(service: MeteoraDlmmService): Promise<CommandResult> {
  try {
    const pools = await service.getAllPools();
    
    if (pools.length === 0) {
      return {
        type: CommandType.GET_POOLS,
        success: true,
        message: "No DLMM pools found.",
        data: { pools: [] }
      };
    }
    
    // Enhanced pool information with active bin data
    const poolsInfo: PoolInfo[] = [];
    
    // Get active bin data for first 5 pools to avoid too many requests
    for (const pool of pools.slice(0, 5)) {
      try {
        const activeBin = await service.getActiveBin(pool.address);
        poolsInfo.push({
          name: pool.name,
          address: pool.address,
          price: activeBin.price,
          binStep: pool.binStep.toString(),
          tokenX: pool.tokenX,
          tokenY: pool.tokenY,
          activeBinId: activeBin.binId
        });
      } catch {
        // Remove unused _error parameter
        // Fallback to basic info if active bin fetch fails
        poolsInfo.push({
          name: pool.name,
          address: pool.address,
          price: pool.activeBinPrice.toFixed(6),
          binStep: pool.binStep.toString(),
          tokenX: pool.tokenX,
          tokenY: pool.tokenY
        });
      }
    }
    
    return {
      type: CommandType.GET_POOLS,
      success: true,
      message: `Found ${pools.length} DLMM pools (showing top 5 with details).`,
      data: { pools: poolsInfo }
    };
  } catch (error) {
    return {
      type: CommandType.GET_POOLS,
      success: false,
      message: "Failed to retrieve pools information.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Handle get position command - IMPROVED
 */
async function handleGetPositionCommand(
  service: MeteoraDlmmService,
  userPublicKey: PublicKey,
  poolAddress?: string
): Promise<CommandResult> {
  try {
    let allPositions: PositionInfo[] = [];
    
    if (poolAddress) {
      // Get positions for specific pool
      const positions = await service.getUserPositions(poolAddress, userPublicKey);
      allPositions = positions.map(position => ({
        id: position.pubkey,
        bins: position.liquidityPerBin.length,
        totalValue: position.totalValue,
        poolName: 'Specified Pool'
      }));
    } else {
      // Get positions across all pools (limited to prevent timeout)
      const pools = await service.getAllPools();
      
      for (const pool of pools.slice(0, 10)) { // Limit to first 10 pools
        try {
          const positions = await service.getUserPositions(pool.address, userPublicKey);
          const poolPositions = positions.map(position => ({
            id: position.pubkey,
            bins: position.liquidityPerBin.length,
            totalValue: position.totalValue,
            poolName: pool.name
          }));
          allPositions.push(...poolPositions);
        } catch {
          // Remove unused _error parameter
          // Skip pools that fail to fetch
          continue;
        }
      }
    }
    
    if (allPositions.length === 0) {
      return {
        type: CommandType.GET_POSITION,
        success: true,
        message: poolAddress 
          ? "You don't have any positions in this pool." 
          : "You don't have any DLMM positions.",
        data: { positions: [] }
      };
    }
    
    return {
      type: CommandType.GET_POSITION,
      success: true,
      message: `Found ${allPositions.length} position(s) across ${poolAddress ? '1 pool' : 'multiple pools'}.`,
      data: { positions: allPositions }
    };
  } catch (error) {
    return {
      type: CommandType.GET_POSITION,
      success: false,
      message: "Failed to retrieve position information.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract pool address from command
 */
function extractPoolAddress(command: string): string | undefined {
  // Look for patterns like "pool XYZ123..." or "in XYZ123..."
  const poolMatch = command.match(/(?:pool|in)\s+([a-zA-Z0-9]{32,})/i);
  return poolMatch ? poolMatch[1] : undefined;
}

/**
 * Extract position ID from command
 */
function extractPositionId(command: string): string | undefined {
  // Look for patterns like "position XYZ123..." or "from XYZ123..."
  const positionMatch = command.match(/(?:position|from)\s+([a-zA-Z0-9]{32,})/i);
  return positionMatch ? positionMatch[1] : undefined;
}

/**
 * Extract liquidity parameters from command - IMPROVED
 */
function extractLiquidityParams(command: string): { amount?: number; token?: string; poolAddress?: string } {
  // Extract amount with better regex
  const amountMatch = command.match(/(?:add|deposit)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;
  const token = amountMatch && amountMatch[2] ? amountMatch[2].toUpperCase() : undefined;
  
  // Extract pool address
  const poolAddress = extractPoolAddress(command);
  
  return { amount, token, poolAddress };
}

/**
 * Extract remove liquidity parameters from command - IMPROVED
 */
function extractRemoveLiquidityParams(command: string): { percentage?: number; positionId?: string } {
  // Extract percentage with better regex
  const percentageMatch = command.match(/(?:remove|withdraw)\s+(\d+(?:\.\d+)?)\s*(%)?/i);
  let percentage = percentageMatch ? parseFloat(percentageMatch[1]) : undefined;
  
  // If percentage doesn't have % symbol and is greater than 1, assume it's meant to be a percentage
  if (percentage && percentage > 1 && !percentageMatch?.[2]) {
    percentage = Math.min(percentage, 100); // Cap at 100%
  }
  
  // Extract position ID
  const positionId = extractPositionId(command);
  
  return { percentage, positionId };
}

/**
 * Extract swap parameters from command - IMPROVED
 */
function extractSwapParams(command: string): { 
  amount?: number; fromToken?: string; toToken?: string; poolAddress?: string 
} {
  // Extract amount and tokens with better regex
  const swapMatch = command.match(/swap\s+(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(?:for|to)\s+([a-zA-Z]+)/i);
  const amount = swapMatch ? parseFloat(swapMatch[1]) : undefined;
  const fromToken = swapMatch ? swapMatch[2].toUpperCase() : undefined;
  const toToken = swapMatch ? swapMatch[3].toUpperCase() : undefined;
  
  // Extract pool address
  const poolAddress = extractPoolAddress(command);
  
  return { amount, fromToken, toToken, poolAddress };
}