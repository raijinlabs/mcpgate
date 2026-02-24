# MCPGate

## What This Is
Open-source MCP tool gateway extracted from `lucid-plateform-core`. Routes AI agents to 88+ builtin MCP servers with RBAC, audit logging, session budgets, and semantic discovery.

## Quick Start
```bash
cp .env.example .env   # Set DATABASE_URL + credentials
npm install
npm run migrate
npm run dev            # http://localhost:4020
```

## Monorepo Structure
```
apps/mcpgate-api/      Fastify server, routes (agents, auth, audit, chains, mcp, plugins, servers, sessions, tools)
modules/mcpgate/       Core logic — auth adapters, identity, sessions, discovery, routing, registry, 88+ servers
packages/
  gateway-core/        Auth, DB, events, policy, quotas
  passport/            Passport matching engine (@raijinlabs/passport)
  metering/            Usage metering with outbox pattern
  observability/       Sentry + OTel tracing
migrations/            9 Postgres SQL migrations
scripts/
  check-oss-boundary.sh  CI guard: no static imports from OSS → cloud/
```

## Key Patterns
- **CredentialAdapter interface** (`modules/mcpgate/src/auth/credential-adapter.ts`): EnvVar, Database (AES-256-GCM), Composite adapters
- **Dynamic imports** for optional cloud/ modules (Nango, Stripe) — OSS code never statically imports cloud/
- **Circuit breaker** state machine on server registry
- **TF-IDF semantic search** for tool discovery across 1000+ tools
- **Chain executor** runs DAG of tool calls with variable interpolation
- **Session budgets** with hard/soft enforcement modes

## Conventions
- TypeScript strict, Zod validation, raw SQL (no ORM)
- Fastify 5, vitest 3, tsx for dev
- 93 tests across 14 files — run with `npm test`
- Each builtin server is a standalone module under `modules/mcpgate/src/servers/`

## Origin
Extracted from `lucid-plateform-core` (private). The parent repo also contains TrustGate (LLM proxy) and cloud/ (Nango OAuth, Stripe billing). This standalone repo contains only the OSS MCPGate components.

## Remote
`github.com/raijinlabs/mcpgate.git` — branch: main
