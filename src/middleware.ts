import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Handle CORS preflight requests for API routes
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    const response = new NextResponse(null, { status: 200 })
    
    // Set CORS headers for preflight
    const origin = request.headers.get('origin')
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? ['https://your-domain.com'] // Replace with your production domain
      : ['http://localhost:3000', 'http://127.0.0.1:3000']
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Max-Age', '86400')
    
    return response
  }

  // Add security headers to all responses
  const response = NextResponse.next()
  
  // FIXED: Content Security Policy with Web3Auth domains
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://terminal.jup.ag https://api.web3auth.io https://assets.web3auth.io https://auth.web3auth.io;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://sly-virulent-owl.solana-mainnet.quiknode.pro https://terminal.jup.ag https://lite-api.jup.ag https://dlmm-api.meteora.ag https://cdn.jsdelivr.net https://api.web3auth.io https://assets.web3auth.io wss:;
    frame-src 'self' https://auth.web3auth.io https://wallet.web3auth.io;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()

  response.headers.set('Content-Security-Policy', cspHeader)
  
  // Additional security headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN') // Changed from DENY for Web3Auth frames
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}