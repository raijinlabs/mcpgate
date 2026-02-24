/**
 * Shared chain ID constants and Zod schema for multi-chain tools.
 */

import { z } from 'zod'

export const CHAINS = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  avalanche: 43114,
  bsc: 56,
  fantom: 250,
  gnosis: 100,
  zksync: 324,
  linea: 59144,
  scroll: 534352,
  solana: -1, // Not EVM
} as const

export const chainIdSchema = z
  .number()
  .int()
  .describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 10=Optimism, 8453=Base, 56=BSC)')

export const chainNameSchema = z
  .enum([
    'ethereum', 'polygon', 'arbitrum', 'optimism', 'base',
    'avalanche', 'bsc', 'fantom', 'gnosis', 'zksync', 'linea', 'scroll',
  ])
  .describe('Blockchain network name')

export function chainIdToName(id: number): string {
  for (const [name, cid] of Object.entries(CHAINS)) {
    if (cid === id) return name
  }
  return `chain-${id}`
}
