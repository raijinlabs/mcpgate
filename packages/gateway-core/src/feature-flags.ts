export const FEATURE_FLAGS = {
  FLUID_COMPUTE_ALPHA: false,
  AGENTAAS_ALPHA: false,
  MCPGATE_ENABLED: process.env.MCPGATE_ENABLED !== 'false',
} as const
