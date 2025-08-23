// src/components/dashboard-components/AddLiquidityModal.tsx
// 🔥 COMPLETE FIXED VERSION with Web3Auth Support

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Info, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

// Traditional wallet hooks
import { useWallet } from "@solana/wallet-adapter-react";

// Web3Auth hooks - CORRECTED IMPORTS
import { useWeb3AuthConnect } from '@web3auth/modal/react';
import { useSolanaWallet, useSignAndSendTransaction } from '@web3auth/modal/react/solana';

import { useMeteoraDlmmService } from "@/lib/meteora/meteoraDlmmService";
import { useMeteoraPositionService } from "@/lib/meteora/meteoraPositionService";
import type { ExistingBinRange } from "@/lib/meteora/meteoraPositionService";
import { BN } from 'bn.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { FormattedPool } from '@/lib/utils/poolUtils';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { showToast } from "@/lib/utils/showToast";
import { useTokenData } from '@/hooks/useTokenData';

interface AddLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: FormattedPool | null;
  userPortfolioStyle?: string | null;
}

interface BalanceInfo {
  solBalance: number;
  tokenBalance: number;
  hasEnoughSol: boolean;
  estimatedSolNeeded: number;
  shortfall: number;
}

interface StrategyOption {
  id: string;
  icon: string;
  label: string;
  subtitle: string;
  description: string;
  estimatedCost: number;
  riskLevel: 'low' | 'medium' | 'high';
  isDefault?: boolean;
}

// Enhanced wallet info interface
interface WalletInfo {
  type: 'traditional' | 'web3auth' | null;
  publicKey: PublicKey | null;
  isConnected: boolean;
  canTransact: boolean;
  connection: Connection | null;
  walletName: string;
}

// Simplified timing constants
const TIMING = {
  TRANSACTION_DELAY: 800,
  SUCCESS_DURATION: 5000,
  MODAL_CLOSE_DELAY: 5500,
  ERROR_DURATION: 4000
} as const;

// Cache for bin ranges
const binRangesCache = new Map<string, { 
  data: ExistingBinRange[]; 
  timestamp: number; 
  activeBinId: number;
}>();
const CACHE_DURATION = 60000;

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({ 
  isOpen, 
  onClose,
  pool,
  userPortfolioStyle = 'conservative'
}) => {
  const actualPortfolioStyle = userPortfolioStyle || 'conservative';
  
  // Traditional wallet hooks
  const { 
    publicKey: traditionalPublicKey, 
    connected: traditionalConnected,
    sendTransaction: traditionalSendTransaction 
  } = useWallet();
  
  // Web3Auth hooks - Complete setup
  const { isConnected: web3AuthConnected } = useWeb3AuthConnect();
  const { accounts, connection: web3AuthConnection } = useSolanaWallet();
  const { signAndSendTransaction, loading: signAndSendLoading, error: signAndSendError } = useSignAndSendTransaction();

  const { service: dlmmService } = useMeteoraDlmmService();
  const { service: positionService } = useMeteoraPositionService();
  const tokens = useTokenData();
  
  // 🔥 CORRECTED WALLET DETECTION LOGIC with enhanced connection handling
  const walletInfo: WalletInfo = useMemo(() => {
    // Check traditional wallet first
    if (traditionalConnected && traditionalPublicKey) {
      console.log('✅ Traditional wallet detected:', traditionalPublicKey.toBase58());
      return {
        type: 'traditional',
        publicKey: traditionalPublicKey,
        isConnected: true,
        canTransact: true,
        connection: new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'),
        walletName: 'Traditional Wallet'
      };
    }
    
    // Check Web3Auth wallet - CORRECTED LOGIC
    if (web3AuthConnected && accounts && accounts.length > 0 && web3AuthConnection) {
      try {
        const publicKey = new PublicKey(accounts[0]);
        console.log('✅ Web3Auth wallet detected:', {
          publicKey: publicKey.toBase58(),
          connectionEndpoint: web3AuthConnection.rpcEndpoint,
          hasSignFunction: !!signAndSendTransaction,
          signLoading: signAndSendLoading
        });
        
        // 🔥 KEY FIX: Enhanced transaction capability check
        const canTransact = !!signAndSendTransaction && 
                           !!web3AuthConnection && 
                           !signAndSendLoading &&
                           !signAndSendError;
        
        return {
          type: 'web3auth',
          publicKey,
          isConnected: true,
          canTransact,
          connection: web3AuthConnection, // 🔥 This is the critical fix
          walletName: 'Web3Auth Wallet'
        };
      } catch (error) {
        console.error('❌ Invalid Web3Auth account format:', error);
      }
    }
    
    console.log('❌ No wallet connected');
    
    return {
      type: null,
      publicKey: null,
      isConnected: false,
      canTransact: false,
      connection: null,
      walletName: 'None'
    };
  }, [
    traditionalConnected, 
    traditionalPublicKey, 
    web3AuthConnected, 
    accounts, 
    web3AuthConnection, 
    signAndSendTransaction, 
    signAndSendLoading,
    signAndSendError
  ]);

  // State management
  const [amount, setAmount] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [currentBinId, setCurrentBinId] = useState<number | null>(null);
  const [existingBinRanges, setExistingBinRanges] = useState<ExistingBinRange[]>([]);
  const [isLoadingBins, setIsLoadingBins] = useState(false);
  const [binRangesLoaded, setBinRangesLoaded] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  
  // UI state
  const [showDetails, setShowDetails] = useState(false);
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [isUpdatingAmount, setIsUpdatingAmount] = useState(false);

  // Refs
  const findingBinsRef = useRef(false);
  const poolAddressRef = useRef<string | null>(null);

  // Enhanced debug output
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 AddLiquidityModal Wallet State:', {
        walletType: walletInfo.type,
        isConnected: walletInfo.isConnected,
        canTransact: walletInfo.canTransact,
        publicKey: walletInfo.publicKey?.toBase58(),
        walletName: walletInfo.walletName,
        hasConnection: !!walletInfo.connection,
        connectionEndpoint: walletInfo.connection?.rpcEndpoint,
        web3AuthDebug: {
          connected: web3AuthConnected,
          hasAccounts: !!accounts?.length,
          hasConnection: !!web3AuthConnection,
          hasSignFunction: !!signAndSendTransaction,
          signLoading: signAndSendLoading,
          signError: signAndSendError?.message
        }
      });
    }
  }, [walletInfo, web3AuthConnected, accounts, web3AuthConnection, signAndSendTransaction, signAndSendLoading, signAndSendError]);

  // Get token names from pool
  const getTokenNames = useCallback(() => {
    if (!pool) return { tokenX: 'BTC', tokenY: 'SOL' };
    const [tokenX, tokenY] = pool.name.split('-');
    return { 
      tokenX: tokenX.replace('WBTC', 'wBTC'), 
      tokenY 
    };
  }, [pool]);

  const { tokenX } = getTokenNames();

  // Strategy options
  const strategyOptions: StrategyOption[] = useMemo(() => {
    if (existingBinRanges.length === 0) return [];
    
    const strategies = {
      conservative: {
        icon: '🛡️',
        label: 'Conservative',
        subtitle: 'Lower risk, steady returns',
        description: 'Best for long-term holders'
      },
      moderate: {
        icon: '⚖️', 
        label: 'Moderate',
        subtitle: 'Balanced risk and returns',
        description: 'Good for most users'
      },
      aggressive: {
        icon: '🚀',
        label: 'Aggressive', 
        subtitle: 'Higher risk, higher returns',
        description: 'For experienced traders'
      }
    };
    
    const style = strategies[actualPortfolioStyle.toLowerCase() as keyof typeof strategies] || strategies.moderate;
    
    return [{
      id: 'selected-strategy',
      ...style,
      estimatedCost: 0.06,
      riskLevel: actualPortfolioStyle.toLowerCase() as 'low' | 'medium' | 'high',
      isDefault: true
    }];
  }, [actualPortfolioStyle, existingBinRanges]);

  // Set default strategy
  useEffect(() => {
    if (strategyOptions.length > 0 && !selectedStrategy) {
      setSelectedStrategy(strategyOptions[0].id);
    }
  }, [strategyOptions, selectedStrategy]);

  const selectedStrategyOption = strategyOptions.find(opt => opt.id === selectedStrategy);

  // Token balance fetching with connection support
  const fetchUserTokenBalance = useCallback(async () => {
    if (!walletInfo.publicKey || !pool || !walletInfo.connection) {
      console.log('⏭️ Skipping token balance fetch:', {
        hasPublicKey: !!walletInfo.publicKey,
        hasPool: !!pool,
        hasConnection: !!walletInfo.connection
      });
      return;
    }

    try {
      console.log('💰 Fetching user token balance with connection:', {
        walletType: walletInfo.type,
        connectionEndpoint: walletInfo.connection.rpcEndpoint,
        tokenSymbol: tokenX
      });

      const { tokenX } = getTokenNames();
      
      // Define known token mint addresses
      const TOKEN_MINTS: Record<string, string> = {
        'wBTC': '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
        'zBTC': 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg',
        'cbBTC': 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
        'SOL': 'So11111111111111111111111111111111111111112'
      };

      // Get the target token mint address
      let targetTokenMint: string | undefined = TOKEN_MINTS[tokenX];
      
      // Fallback: if not in our predefined list, try to find via token registry
      if (!targetTokenMint && tokens.length > 0) {
        const tokenInfo = tokens.find(t => 
          t.symbol === tokenX || 
          t.symbol === tokenX.toUpperCase() ||
          t.symbol === tokenX.toLowerCase()
        );
        targetTokenMint = tokenInfo?.address;
      }

      if (!targetTokenMint) {
        console.warn(`Could not determine mint address for token: ${tokenX} in pool: ${pool.name}`);
        setUserTokenBalance(0);
        return;
      }

      // 🔥 KEY FIX: Use the wallet's connection
      const tokenAccounts = await walletInfo.connection.getParsedTokenAccountsByOwner(
        walletInfo.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Find the specific token account that matches our target mint
      const targetAccount = tokenAccounts.value.find(account => {
        const mintAddress = account.account.data.parsed.info.mint;
        return mintAddress === targetTokenMint;
      });

      if (targetAccount) {
        const balance = targetAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
        console.log(`✅ Found ${tokenX} balance:`, balance);
        setUserTokenBalance(balance);
      } else {
        console.log(`ℹ️ No ${tokenX} token account found`);
        setUserTokenBalance(0);
      }

    } catch (error) {
      console.error('❌ Error fetching token balance:', error);
      setUserTokenBalance(0);
    }
  }, [walletInfo.publicKey, walletInfo.connection, walletInfo.type, pool, tokens, getTokenNames, tokenX]);

  // 🔥 CORRECTED: Find existing bin ranges with proper connection handling
  const findExistingBinRanges = useCallback(async (poolAddress: string) => {
    if (findingBinsRef.current || !poolAddress || !walletInfo.connection) {
      console.log('⏭️ Skipping bin range search:', {
        alreadyFinding: findingBinsRef.current,
        hasPoolAddress: !!poolAddress,
        hasConnection: !!walletInfo.connection
      });
      return;
    }

    const cached = binRangesCache.get(poolAddress);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      setExistingBinRanges(cached.data);
      setCurrentBinId(cached.activeBinId);
      setBinRangesLoaded(true);
      return;
    }

    findingBinsRef.current = true;
    setIsLoadingBins(true);
    setBinRangesLoaded(false);
    
    try {
      console.log('🔍 Finding bin ranges with connection:', {
        poolAddress: poolAddress.substring(0, 8) + '...',
        walletType: walletInfo.type,
        connectionEndpoint: walletInfo.connection.rpcEndpoint
      });

      // 🔥 KEY FIX: Pass the correct connection to both services
      const dlmmPool = await dlmmService.initializePool(poolAddress, walletInfo.connection);
      const activeBin = await dlmmPool.getActiveBin();
      setCurrentBinId(activeBin.binId);
      
      // 🔥 KEY FIX: Pass connection to position service
      const existingRanges = await positionService.findExistingBinRanges(
        poolAddress, 
        69, 
        actualPortfolioStyle,
        walletInfo.connection // Pass the connection here
      );
      
      let finalRanges: ExistingBinRange[];
      
      if (existingRanges.length > 0) {
        finalRanges = existingRanges;
      } else {
        const fallbackRange: ExistingBinRange = {
          minBinId: activeBin.binId - 30,
          maxBinId: activeBin.binId + 30,
          existingBins: Array.from({length: 61}, (_, i) => activeBin.binId - 30 + i),
          liquidityDepth: 61,
          isPopular: false,
          description: 'Safe price range around current market price'
        };
        finalRanges = [fallbackRange];
      }
      
      setExistingBinRanges(finalRanges);
      setBinRangesLoaded(true);
      
      binRangesCache.set(poolAddress, {
        data: finalRanges,
        timestamp: now,
        activeBinId: activeBin.binId
      });

      console.log('✅ Successfully found bin ranges:', {
        rangeCount: finalRanges.length,
        activeBinId: activeBin.binId
      });
      
    } catch (error) {
      console.error('❌ Error finding price ranges:', error);
      
      // Enhanced error context
      if (error instanceof Error) {
        console.error('Error context:', {
          message: error.message,
          stack: error.stack,
          poolAddress: poolAddress.substring(0, 8) + '...',
          walletType: walletInfo.type,
          hasConnection: !!walletInfo.connection,
          connectionEndpoint: walletInfo.connection?.rpcEndpoint
        });
        
        // Check if it's a connection-related error
        if (error.message.includes('Failed to initialize DLMM pool')) {
          console.error('💡 This appears to be a connection initialization issue');
          showToast.error('Connection Issue', 
            'Unable to connect to the liquidity pool. Please try refreshing or check your wallet connection.'
          );
        }
      }
      
      // Fallback range
      const fallbackRange: ExistingBinRange = {
        minBinId: currentBinId ? currentBinId - 30 : 0,
        maxBinId: currentBinId ? currentBinId + 30 : 60,
        existingBins: currentBinId ? Array.from({length: 61}, (_, i) => currentBinId - 30 + i) : Array.from({length: 61}, (_, i) => i),
        liquidityDepth: 61,
        isPopular: false,
        description: 'Safe price range around current market price'
      };
      setExistingBinRanges([fallbackRange]);
      setBinRangesLoaded(true);
    } finally {
      setIsLoadingBins(false);
      findingBinsRef.current = false;
    }
  }, [actualPortfolioStyle, dlmmService, positionService, currentBinId, walletInfo.connection, walletInfo.type]);

  // Effects
  useEffect(() => {
    if (isOpen && pool && pool.address !== poolAddressRef.current && !binRangesLoaded && !isLoadingBins) {
      poolAddressRef.current = pool.address;
      findExistingBinRanges(pool.address);
    }
  }, [isOpen, pool, binRangesLoaded, isLoadingBins, findExistingBinRanges]);

  useEffect(() => {
    if (!isOpen) {
      setBinRangesLoaded(false);
      setExistingBinRanges([]);
      setCurrentBinId(null);
      setBalanceInfo(null);
      setValidationError('');
      setAmount('');
      setSelectedStrategy('');
      setUserTokenBalance(0);
      setActivePercentage(null);
      setIsUpdatingAmount(false);
      poolAddressRef.current = null;
      findingBinsRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && walletInfo.publicKey && pool) {
      fetchUserTokenBalance();
    }
  }, [isOpen, walletInfo.publicKey, pool, fetchUserTokenBalance]);

  // Input handlers
  const handlePercentageClick = useCallback((percentage: number) => {
    if (isUpdatingAmount) return;
    
    if (userTokenBalance <= 0) {
      showToast.warning('No Balance', `You don't have any ${tokenX} tokens to add.`);
      return;
    }
    
    setIsUpdatingAmount(true);
    setActivePercentage(percentage);
    
    const newAmount = (userTokenBalance * percentage / 100).toFixed(6);
    setAmount(newAmount);
    
    showToast.success('Amount Updated', `Set to ${percentage}% of your balance`);
    
    setTimeout(() => {
      setIsUpdatingAmount(false);
    }, 300);
  }, [userTokenBalance, isUpdatingAmount, tokenX]);

  const handleMaxClick = useCallback(() => {
    if (isUpdatingAmount) return;
    
    if (userTokenBalance <= 0) {
      showToast.warning('No Balance', `You don't have any ${tokenX} tokens to add.`);
      return;
    }
    
    setIsUpdatingAmount(true);
    setActivePercentage(100);
    
    const newAmount = userTokenBalance.toFixed(6);
    setAmount(newAmount);
    
    showToast.success('Amount Updated', `Set to maximum: ${newAmount} ${tokenX}`);
    
    setTimeout(() => {
      setIsUpdatingAmount(false);
    }, 300);
  }, [userTokenBalance, tokenX, isUpdatingAmount]);

  // Balance checking with connection support
  const checkUserBalances = useCallback(async () => {
    if (!walletInfo.publicKey || !pool || !amount || parseFloat(amount) <= 0 || !selectedStrategyOption || !walletInfo.connection) {
      return;
    }

    setIsCheckingBalance(true);
    setValidationError('');

    try {
      console.log('💰 Checking user balances with connection:', {
        walletType: walletInfo.type,
        connectionEndpoint: walletInfo.connection.rpcEndpoint
      });

      // 🔥 KEY FIX: Use the wallet's connection for balance check
      const solBalanceLamports = await walletInfo.connection.getBalance(walletInfo.publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
      
      const estimatedSolNeeded = selectedStrategyOption.estimatedCost;
      const hasEnoughSol = solBalance >= estimatedSolNeeded;
      const shortfall = Math.max(0, estimatedSolNeeded - solBalance);

      const balanceInfo: BalanceInfo = {
        solBalance,
        tokenBalance: 0,
        hasEnoughSol,
        estimatedSolNeeded,
        shortfall
      };

      setBalanceInfo(balanceInfo);

      if (!hasEnoughSol) {
        setValidationError(
          `You need ${shortfall.toFixed(3)} more SOL to complete this transaction.`
        );
      }

      console.log('✅ Balance check completed:', {
        solBalance: solBalance.toFixed(4),
        required: estimatedSolNeeded.toFixed(4),
        hasEnough: hasEnoughSol
      });

    } catch (error) {
      console.error('❌ Error checking balances:', error);
      setValidationError('Unable to check account balances. Please try again.');
    } finally {
      setIsCheckingBalance(false);
    }
  }, [walletInfo.publicKey, walletInfo.connection, walletInfo.type, pool, amount, selectedStrategyOption]);

  useEffect(() => {
    if (amount && parseFloat(amount) > 0 && walletInfo.publicKey && pool && selectedStrategyOption) {
      checkUserBalances();
    } else {
      setBalanceInfo(null);
      setValidationError('');
    }
  }, [amount, walletInfo.publicKey, pool, selectedStrategyOption, checkUserBalances]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      setAmount(value);
    }
  };

  // 🔥 CORRECTED TRANSACTION HANDLER with full Web3Auth support
  const handleAddLiquidity = async () => {
    console.log('🚀 Starting transaction with wallet:', {
      type: walletInfo.type,
      isConnected: walletInfo.isConnected,
      canTransact: walletInfo.canTransact,
      hasConnection: !!walletInfo.connection,
      publicKey: walletInfo.publicKey?.toBase58()
    });

    if (!walletInfo.isConnected) {
      showToast.error('Wallet Not Connected', 'Please connect your wallet first.');
      return;
    }

    if (!walletInfo.canTransact) {
      showToast.error('Cannot Transact', `${walletInfo.walletName} is not ready for transactions.`);
      return;
    }

    if (!pool || !walletInfo.publicKey || !amount || parseFloat(amount) <= 0) {
      showToast.error('Invalid Input', 'Please check all fields and try again.');
      return;
    }

    if (!currentBinId || !selectedStrategyOption || existingBinRanges.length === 0) {
      showToast.error('Not Ready', 'Position configuration is not ready. Please wait.');
      return;
    }

    if (balanceInfo && !balanceInfo.hasEnoughSol) {
      showToast.error('Insufficient SOL', 
        validationError || 'You need more SOL to complete this transaction.'
      );
      return;
    }

    if (!walletInfo.connection) {
      showToast.error('Connection Error', 'No connection available for transactions.');
      return;
    }

    if (signAndSendLoading) {
      showToast.warning('Transaction in Progress', 'Please wait for the current transaction to complete.');
      return;
    }

    setIsLoading(true);
    
    try {
      const decimals = 8;
      const bnAmount = new BN(parseFloat(amount) * Math.pow(10, decimals));
      const selectedRange = existingBinRanges[0];
      
      console.log('📝 Creating position with connection:', {
        poolAddress: pool.address.substring(0, 8) + '...',
        walletType: walletInfo.type,
        connectionEndpoint: walletInfo.connection.rpcEndpoint,
        amount: amount,
        bnAmount: bnAmount.toString()
      });

      // 🔥 KEY FIX: Pass the connection to position service
      const result = await positionService.createPositionWithExistingBins({
        poolAddress: pool.address,
        userPublicKey: walletInfo.publicKey,
        totalXAmount: bnAmount,
        totalYAmount: new BN(0),
        minBinId: selectedRange.minBinId,
        maxBinId: selectedRange.maxBinId,
        strategyType: StrategyType.Spot,
        useAutoFill: false,
        connection: walletInfo.connection // 🔥 Pass the connection here
      }, selectedRange);
      
      console.log('✅ Position created, processing transactions...');
      
      // 🔥 CORRECTED TRANSACTION HANDLING
      if (walletInfo.type === 'traditional') {
        console.log('💳 Processing with traditional wallet...');
        
        if (Array.isArray(result.transaction)) {
          for (const tx of result.transaction) {
            const signature = await traditionalSendTransaction(tx, walletInfo.connection, {
              signers: [result.positionKeypair]
            });
            console.log('✅ Traditional transaction signature:', signature);
          }
        } else {
          const signature = await traditionalSendTransaction(result.transaction, walletInfo.connection, {
            signers: [result.positionKeypair]
          });
          console.log('✅ Traditional transaction signature:', signature);
        }
        
      } else if (walletInfo.type === 'web3auth') {
        console.log('🔐 Processing with Web3Auth...');
        
        if (!signAndSendTransaction) {
          throw new Error('Web3Auth signing function not available');
        }
        
        if (!web3AuthConnection) {
          throw new Error('Web3Auth connection not available');
        }
        
        // Enhanced Web3Auth transaction handling
        if (Array.isArray(result.transaction)) {
          for (const tx of result.transaction) {
            try {
              // Ensure transaction has required fields
              if (!tx.recentBlockhash) {
                const block = await web3AuthConnection.getLatestBlockhash("finalized");
                tx.recentBlockhash = block.blockhash;
                tx.lastValidBlockHeight = block.lastValidBlockHeight;
              }
              if (!tx.feePayer) {
                tx.feePayer = walletInfo.publicKey;
              }
              
              // 🔥 Add the position keypair as a signer
              if (result.positionKeypair) {
                tx.partialSign(result.positionKeypair);
              }
              
              const signature = await signAndSendTransaction(tx);
              console.log('✅ Web3Auth transaction signature:', signature);
              
              // Wait for confirmation
              const confirmation = await web3AuthConnection.confirmTransaction(signature, 'confirmed');
              if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
              }
            } catch (txError) {
              console.error('❌ Web3Auth transaction error:', txError);
              throw txError;
            }
          }
        } else {
          try {
            // Ensure transaction has required fields
            if (!result.transaction.recentBlockhash) {
              const block = await web3AuthConnection.getLatestBlockhash("finalized");
              result.transaction.recentBlockhash = block.blockhash;
              result.transaction.lastValidBlockHeight = block.lastValidBlockHeight;
            }
            if (!result.transaction.feePayer) {
              result.transaction.feePayer = walletInfo.publicKey;
            }
            
            // 🔥 Add the position keypair as a signer
            if (result.positionKeypair) {
              result.transaction.partialSign(result.positionKeypair);
            }
            
            const signature = await signAndSendTransaction(result.transaction);
            console.log('✅ Web3Auth transaction signature:', signature);
            
            // Wait for confirmation
            const confirmation = await web3AuthConnection.confirmTransaction(signature, 'confirmed');
            if (confirmation.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }
          } catch (txError) {
            console.error('❌ Web3Auth transaction error:', txError);
            throw txError;
          }
        }
      }
      
      console.log('🎉 All transactions completed successfully');
      
      setTimeout(() => {
        showToast.success('Success!', `Your ${amount} ${tokenX} has been added to the pool. You'll start earning fees from trading activity.`);
      }, TIMING.TRANSACTION_DELAY);
      
      setTimeout(() => {
        onClose();
        setAmount('');
        setActivePercentage(null);
      }, TIMING.MODAL_CLOSE_DELAY);
      
    } catch (error) {
      console.error('💥 Transaction failed:', error);
      
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (walletInfo.type === 'web3auth') {
          if (errorMessage.includes('User rejected') || errorMessage.includes('user denied')) {
            showToast.warning('Transaction Cancelled', 'You cancelled the transaction. Your funds are safe.');
            return;
          }
          
          if (signAndSendError) {
            errorMessage = signAndSendError.message;
          }
        }
        
        // Enhanced error handling
        if (errorMessage.includes('Failed to initialize DLMM pool')) {
          showToast.error('Pool Connection Failed', 
            'Unable to connect to the liquidity pool with your wallet. Please try refreshing or switching wallets.'
          );
        } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient lamports')) {
          showToast.error('Insufficient Funds', 
            `You need about ${selectedStrategyOption?.estimatedCost.toFixed(2) || '0.06'} SOL to complete this transaction.`
          );
        } else if (errorMessage.includes('User rejected') || errorMessage.includes('user denied')) {
          showToast.warning('Transaction Cancelled', 'You cancelled the transaction. Your funds are safe.');
        } else if (errorMessage.includes('Connection')) {
          showToast.error('Connection Issue', 'There was a problem with your wallet connection. Please try reconnecting.');
        } else {
          showToast.error('Transaction Failed', `Something went wrong: ${errorMessage}`);
        }
      } else {
        showToast.error('Transaction Failed', 'An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isAnyWalletConnected = walletInfo.isConnected;
  const canTransact = walletInfo.canTransact;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'conservative': return 'text-green-400';
      case 'moderate': return 'text-blue-400';  
      case 'aggressive': return 'text-orange-400';
      default: return 'text-blue-400';
    }
  };

  return (
    <>
      <Dialog open={isOpen && !!pool} onOpenChange={onClose}>
        <DialogContent className="bg-[#161616] border-border text-white max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-white text-xl">Add Liquidity</DialogTitle>
            <DialogDescription className="text-sm text-sub-text">
              Start earning fees from {pool?.name} trading activity
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-6">
            {/* Amount Input */}
            <div className="space-y-3">
              <label className="text-sm text-sub-text block font-medium">
                How much {tokenX} do you want to add?
              </label>
              
              {walletInfo.publicKey && (
                <div className="flex justify-between items-center text-xs text-sub-text">
                  <span>Available:</span>
                  <span className="font-medium">
                    {userTokenBalance.toFixed(6)} {tokenX}
                  </span>
                </div>
              )}
              
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.0"
                  className="w-full bg-[#0f0f0f] border border-border rounded-lg p-4 text-white pr-20 text-lg font-medium"
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-secondary/30 px-3 py-1.5 rounded text-sm font-medium">
                  {tokenX}
                </div>
                {isCheckingBalance && (
                  <div className="absolute right-24 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                )}
              </div>
              
              {/* Percentage Buttons */}
              {walletInfo.publicKey && userTokenBalance > 0 && (
                <div className="flex gap-2 mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePercentageClick(25)}
                    disabled={isUpdatingAmount}
                    className={`flex-1 text-xs transition-all duration-200 ${
                      activePercentage === 25
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                    }`}
                  >
                    25%
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePercentageClick(50)}
                    disabled={isUpdatingAmount}
                    className={`flex-1 text-xs transition-all duration-200 ${
                      activePercentage === 50
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                    }`}
                  >
                    50%
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePercentageClick(75)}
                    disabled={isUpdatingAmount}
                    className={`flex-1 text-xs transition-all duration-200 ${
                      activePercentage === 75
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                    }`}
                  >
                    75%
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMaxClick}
                    disabled={isUpdatingAmount}
                    className={`flex-1 text-xs transition-all duration-200 ${
                      activePercentage === 100
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-transparent border-border hover:border-green-500 hover:bg-green-500/20 hover:text-green-400 text-white'
                    }`}
                  >
                    MAX
                  </Button>
                </div>
              )}
              
              {/* No Balance Warning */}
              {walletInfo.publicKey && userTokenBalance === 0 && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 mt-3">
                  <div className="flex items-center gap-2 text-yellow-200 text-sm">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>No {tokenX} found in your wallet</span>
                  </div>
                </div>
              )}
            </div>

            {/* Strategy Display */}
            {strategyOptions.length > 0 && (
              <div className="space-y-4">
                <label className="text-sm text-sub-text block font-medium">
                  Your Strategy
                </label>
                
                <div className="p-4 border border-primary bg-primary/10 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{selectedStrategyOption?.icon}</span>
                        <div>
                          <div className="font-medium text-white text-sm">
                            {selectedStrategyOption?.label}
                          </div>
                          <div className={`text-xs ${getRiskColor(actualPortfolioStyle)}`}>
                            {selectedStrategyOption?.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-sub-text">
                        {selectedStrategyOption?.description}
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 ml-2" />
                  </div>
                </div>
              </div>
            )}

            {/* Cost Information */}
            <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-sub-text">Cost to start:</span>
                <span className="text-white font-medium">
                  ~{selectedStrategyOption ? selectedStrategyOption.estimatedCost.toFixed(2) : '0.06'} SOL
                </span>
              </div>
              <div className="text-xs text-green-400 mt-1">
                You get this back when you exit
              </div>
            </div>

            {/* Balance Check Results */}
            {balanceInfo && (
              <div className="bg-[#0f0f0f] border border-border rounded-lg p-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-sub-text">Your SOL Balance:</span>
                  <span className={`font-medium ${balanceInfo.hasEnoughSol ? 'text-green-400' : 'text-red-400'}`}>
                    {balanceInfo.solBalance.toFixed(3)} SOL
                  </span>
                </div>
                {balanceInfo.shortfall > 0 && (
                  <div className="flex justify-between items-center text-sm mt-2">
                    <span className="text-sub-text">Need:</span>
                    <span className="text-red-400 font-medium">
                      {balanceInfo.shortfall.toFixed(3)} more SOL
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-200">{validationError}</div>
              </div>
            )}

            {/* Web3Auth Specific Error Display */}
            {signAndSendError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm text-red-200 font-medium">Web3Auth Transaction Error:</div>
                  <div className="text-xs text-red-300 mt-1">{signAndSendError.message}</div>
                </div>
              </div>
            )}

            {/* Loading States */}
            {isLoadingBins && (
              <div className="bg-[#0f0f0f] border border-border rounded-lg p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-sub-text">Finding safe price ranges...</p>
              </div>
            )}

            {/* Success State */}
            {existingBinRanges.length > 0 && binRangesLoaded && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-green-400 font-medium">Ready to earn</span>
                </div>
                <p className="text-sm text-white">
                  Safe price range found. You&apos;ll start earning fees when people trade this pair.
                </p>
              </div>
            )}

            {/* Advanced Details (Collapsible) */}
            <div className="bg-[#0f0f0f] border border-border rounded-lg">
              <div 
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => setShowDetails(!showDetails)}
              >
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-sm text-sub-text font-medium">How it works</span>
                </div>
                {showDetails ? (
                  <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </div>
              
              {showDetails && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-3 border-t border-border pt-4 text-sm text-sub-text">
                    <div>
                      <div className="font-medium text-white mb-1">What happens next:</div>
                      <div>• Your {tokenX} will be added to the {pool?.name} trading pool</div>
                      <div>• You&apos;ll automatically earn fees when people trade this pair</div>
                      <div>• You can withdraw your funds anytime</div>
                      <div>• The ~0.06 SOL cost gets refunded when you exit</div>
                    </div>
                    <div>
                      <div className="font-medium text-white mb-1">Risk level: {selectedStrategyOption?.subtitle}</div>
                      <div>• {actualPortfolioStyle === 'conservative' ? 'Lower risk with steady returns over time' : 
                               actualPortfolioStyle === 'moderate' ? 'Balanced approach with moderate returns' :
                               'Higher potential returns with increased risk'}</div>
                      <div>• Your tokens may lose some value if prices move significantly</div>
                      <div>• Trading fees help offset any potential losses</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Debug Panel (Development Only) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
                <div className="text-sm text-blue-200 mb-2">Debug Panel (Development Only)</div>
                <div className="text-xs text-blue-200 space-y-1">
                  <div>Wallet Type: {walletInfo.type}</div>
                  <div>Is Connected: {walletInfo.isConnected ? '✅' : '❌'}</div>
                  <div>Can Transact: {walletInfo.canTransact ? '✅' : '❌'}</div>
                  <div>Has Connection: {!!walletInfo.connection ? '✅' : '❌'}</div>
                  <div>Connection Endpoint: {walletInfo.connection?.rpcEndpoint || 'None'}</div>
                  <div>Sign Function: {typeof signAndSendTransaction === 'function' ? '✅' : '❌'}</div>
                  <div>Sign Loading: {signAndSendLoading ? '⏳' : '✅'}</div>
                  <div>Sign Error: {signAndSendError ? '❌' : '✅'}</div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button 
              onClick={handleAddLiquidity} 
              disabled={
                !amount || 
                parseFloat(amount) <= 0 || 
                isLoading || 
                signAndSendLoading ||
                isCheckingBalance ||
                isLoadingBins ||
                existingBinRanges.length === 0 ||
                !canTransact ||
                (balanceInfo ? !balanceInfo.hasEnoughSol : false)
              }
              className="bg-primary hover:bg-primary/80 w-full sm:w-auto order-1 sm:order-2"
            >
              {isLoading || signAndSendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {signAndSendLoading ? 'Signing & Sending...' : 'Adding Liquidity...'}
                </>
              ) : isLoadingBins ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : !isAnyWalletConnected ? (
                'Connect Wallet First'
              ) : !canTransact ? (
                `${walletInfo.walletName} Not Ready`
              ) : (
                'Add Liquidity'
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={isLoading || isLoadingBins || signAndSendLoading}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AddLiquidityModal;