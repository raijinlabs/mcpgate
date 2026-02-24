/**
 * HMAC signing utilities for CEX APIs.
 * Used by: Binance (SHA-256), Kraken (SHA-512), Coinbase (SHA-256), Polymarket
 */

import { createHmac, createHash } from 'node:crypto'

/** Binance: HMAC-SHA256 of query string */
export function signBinance(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex')
}

/** Coinbase: HMAC-SHA256 of (timestamp + method + path + body) */
export function signCoinbase(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secret: string,
): string {
  const message = timestamp + method.toUpperCase() + path + body
  return createHmac('sha256', secret).update(message).digest('hex')
}

/** Kraken: nonce-based HMAC-SHA512 with SHA-256 prehash */
export function signKraken(
  path: string,
  nonce: string,
  postData: string,
  secret: string,
): string {
  const secretBuf = Buffer.from(secret, 'base64')
  const sha256Hash = createHash('sha256')
    .update(nonce + postData)
    .digest()
  const message = Buffer.concat([Buffer.from(path), sha256Hash])
  return createHmac('sha512', secretBuf).update(message).digest('base64')
}

/** Generic HMAC signer for custom schemes */
export function signHmac(
  algo: 'sha256' | 'sha512',
  message: string,
  secret: string,
  encoding: 'hex' | 'base64' = 'hex',
): string {
  return createHmac(algo, secret).update(message).digest(encoding)
}
