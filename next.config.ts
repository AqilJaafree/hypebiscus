import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
  
  // Comprehensive webpack configuration to handle MetaMask delegation toolkit
  webpack: (config, { isServer, dev }) => {
    // Handle the MetaMask delegation toolkit issue completely
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@metamask/delegation-toolkit': false,
        'viem/account-abstraction': false,
      };

      // Exclude from bundling entirely
      config.externals = config.externals || [];
      config.externals.push({
        '@metamask/delegation-toolkit': 'false',
        'viem/account-abstraction': 'false',
      });

      // Add module resolution rules to ignore problematic imports
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      
      config.module.rules.push({
        test: /@metamask\/delegation-toolkit/,
        use: 'null-loader'
      });

      // Create alias to empty module
      config.resolve.alias = {
        ...config.resolve.alias,
        '@metamask/delegation-toolkit': false,
        'viem/account-abstraction': false,
      };

      // Suppress warnings
      config.ignoreWarnings = [
        /Module not found: Can't resolve '@metamask\/delegation-toolkit'/,
        /Module not found: Can't resolve 'viem\/account-abstraction'/,
        /export .* was not found in/,
        /Can't resolve 'viem\/account-abstraction'/,
      ];
    }

    return config;
  },
  
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'production' 
              ? [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' https://terminal.jup.ag https://cdn.jsdelivr.net https://*.web3auth.io",
                  "style-src 'self' 'unsafe-inline'", 
                  "img-src 'self' data: https:",
                  "font-src 'self' data:",
                  "connect-src 'self' https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://sly-virulent-owl.solana-mainnet.quiknode.pro https://terminal.jup.ag https://lite-api.jup.ag https://dlmm-api.meteora.ag https://cdn.jsdelivr.net https://*.web3auth.io wss:",
                  "frame-src 'self' https://auth.web3auth.io https://*.web3auth.io",
                  "worker-src 'self'",
                  "object-src 'none'",
                  "base-uri 'self'"
                ].join('; ')
              : [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://terminal.jup.ag https://cdn.jsdelivr.net https://*.web3auth.io",
                  "style-src 'self' 'unsafe-inline'",
                  "img-src 'self' data: https:",
                  "font-src 'self' data:",
                  "connect-src 'self' https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://sly-virulent-owl.solana-mainnet.quiknode.pro https://terminal.jup.ag https://lite-api.jup.ag https://dlmm-api.meteora.ag https://cdn.jsdelivr.net https://*.web3auth.io wss:",
                  "frame-src 'self' https://auth.web3auth.io https://*.web3auth.io",
                  "worker-src 'self' blob:",
                  "object-src 'none'",
                  "base-uri 'self'"
                ].join('; ')
          }
        ],
      },
      {
        // API routes specific headers
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'production' 
              ? 'https://your-domain.com' // Replace with your production domain
              : 'http://localhost:3000'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400'
          }
        ],
      }
    ]
  },
};

export default nextConfig;