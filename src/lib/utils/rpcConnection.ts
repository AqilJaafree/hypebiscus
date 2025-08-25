import { Connection } from '@solana/web3.js'

// RPC endpoint validation and security
const ALLOWED_RPC_HOSTS = [
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com', 
  'api.testnet.solana.com',
  'solana-mainnet.g.alchemy.com',
  'mainnet.helius-rpc.com',
  'sly-virulent-owl.solana-mainnet.quiknode.pro', // QuikNode (should be replaced)
  'rpc.ankr.com'
]

/**
 * Validate RPC URL for security
 */
function validateRpcUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    
    // Must use HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
      console.warn('RPC URL must use HTTPS in production')
      return false
    }
    
    // Check if host is in allowed list
    const isAllowed = ALLOWED_RPC_HOSTS.some(allowedHost => 
      parsedUrl.hostname === allowedHost || parsedUrl.hostname.endsWith(`.${allowedHost}`)
    )
    
    if (!isAllowed) {
      console.warn(`RPC URL host not in allowed list: ${parsedUrl.hostname}`)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Invalid RPC URL format:', error)
    return false
  }
}

/**
 * Get secure RPC URL with fallback
 */
function getSecureRpcUrl(): string {
  const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  
  // If environment RPC URL is provided and valid, use it
  if (envRpcUrl && validateRpcUrl(envRpcUrl)) {
    return envRpcUrl
  }
  
  // Fallback to public endpoint
  const fallbackUrl = 'https://api.mainnet-beta.solana.com'
  
  if (envRpcUrl && !validateRpcUrl(envRpcUrl)) {
    console.warn(`Invalid RPC URL in environment, falling back to: ${fallbackUrl}`)
  }
  
  return fallbackUrl
}

/**
 * Connection configuration with security and performance settings
 */
const CONNECTION_CONFIG = {
  commitment: 'confirmed' as const,
  confirmTransactionInitialTimeout: 60000,
  wsEndpoint: undefined, // Disable WebSocket in production for security
  httpHeaders: {
    'User-Agent': 'Hypebiscus/1.0'
  }
}

/**
 * Create a secure, configured Solana connection
 */
export function createSecureConnection(): Connection {
  const rpcUrl = getSecureRpcUrl()
  
  return new Connection(rpcUrl, CONNECTION_CONFIG)
}

/**
 * Singleton connection instance for reuse
 */
let connectionInstance: Connection | null = null

/**
 * Get shared connection instance
 */
export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = createSecureConnection()
  }
  
  return connectionInstance
}

/**
 * Reset connection (useful for testing or changing networks)
 */
export function resetConnection(): void {
  connectionInstance = null
}

/**
 * Test connection health
 */
export async function testConnection(connection?: Connection): Promise<boolean> {
  try {
    const conn = connection || getConnection()
    
    // Test basic connectivity
    const slot = await conn.getSlot()
    
    if (typeof slot !== 'number' || slot < 0) {
      return false
    }
    
    // Test that we can get recent blockhash (required for transactions)
    const { blockhash } = await conn.getLatestBlockhash()
    
    if (!blockhash || blockhash.length === 0) {
      return false
    }
    
    return true
  } catch (error) {
    console.error('Connection test failed:', error)
    return false
  }
}

/**
 * Connection health monitoring
 */
export class ConnectionMonitor {
  private connection: Connection
  private healthCheckInterval: NodeJS.Timeout | null = null
  private isHealthy = true
  
  constructor(connection?: Connection) {
    this.connection = connection || getConnection()
  }
  
  startMonitoring(intervalMs: number = 30000): void {
    this.healthCheckInterval = setInterval(async () => {
      const healthy = await testConnection(this.connection)
      
      if (healthy !== this.isHealthy) {
        this.isHealthy = healthy
        console.log(`RPC connection health changed: ${healthy ? 'healthy' : 'unhealthy'}`)
        
        // Reset connection if unhealthy
        if (!healthy) {
          resetConnection()
          this.connection = getConnection()
        }
      }
    }, intervalMs)
  }
  
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }
  
  getHealthStatus(): boolean {
    return this.isHealthy
  }
}

// Export for backward compatibility with existing code
export { getSecureRpcUrl as getRpcUrl }