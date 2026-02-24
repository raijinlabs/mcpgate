import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Packages and modules with their own vitest config
  'modules/mcpgate/vitest.config.ts',
  'packages/metering/vitest.config.ts',
  'packages/passport/vitest.config.ts',
  'apps/control-plane/vitest.config.ts',
  // Default: all other test files
  {
    test: {
      include: [
        'packages/gateway-core/src/__tests__/**/*.test.ts',
        'modules/trustgate/src/**/__tests__/**/*.test.ts',
        'apps/mcpgate-api/src/__tests__/integration.test.ts',
        'cloud/**/src/__tests__/**/*.test.ts',
      ],
    },
  },
])
