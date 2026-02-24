# MCPGate

Open-source MCP (Model Context Protocol) tool gateway. Route AI agents to 88+ builtin tool servers with RBAC, audit logging, session budgets, and semantic discovery.

## Features

- **88+ Builtin MCP Servers** — Finance, SaaS, DevOps, communication, and more. Each server exposes tools via the [MCP protocol](https://modelcontextprotocol.io).
- **Credential Adapters** — EnvVar, encrypted database (AES-256-GCM), or composite fallback chains. Bring your own adapter.
- **Agent Identity** — Register agents, plugins, and delegation chains. Scope permissions per-agent.
- **Session Budgets** — Cap tool calls, cost, or duration per session with hard/soft enforcement.
- **Semantic Discovery** — TF-IDF search across 1000+ tools to find the right server automatically.
- **Chain Executor** — DAG-based multi-step tool chains with variable interpolation.
- **Circuit Breaker** — Automatic fault isolation for unhealthy servers.
- **Audit Logging** — Every tool call logged with caller identity, latency, and result status.
- **Rate Limiting** — Per-agent, per-server, or global rate limits.
- **Metering** — Usage tracking with outbox pattern for reliable event delivery.

## Quick Start

```bash
# Clone
git clone https://github.com/raijinlabs/mcpgate.git
cd mcpgate

# Configure
cp .env.example .env
# Edit .env — set DATABASE_URL and any server credentials

# Run migrations
npm run migrate

# Start
npm run dev   # http://localhost:4020
```

## Architecture

```
apps/
  mcpgate-api/         Fastify API server (:4020)
modules/
  mcpgate/
    auth/              Credential adapters (EnvVar, Database, Composite)
    identity/          Agent, plugin, MCP identity services
    session/           Session budgets and quota enforcement
    discovery/         Semantic TF-IDF tool search
    router/            Tool router, chain executor, rate limiter
    registry/          Tool registry, circuit breaker, server health
    builtin/           Builtin server registry
    servers/           88+ server integrations + shared utilities
    audit/             Audit logger and query interface
    metering/          Tool call metering
    mcp-client/        MCP transport and session management
    schemas/           Request/response schemas
packages/
  gateway-core/        Auth, DB, events, policy, quotas
  passport/            Passport matching engine
  metering/            Usage metering with outbox pattern
  observability/       Sentry, tracing, structured logging
migrations/            9 SQL migrations (Postgres)
```

## Builtin Servers

97 server integrations across domains:

| Category | Servers |
|----------|---------|
| **Finance/Crypto** | Aave, Binance, Coinbase, DeFiLlama, Etherscan, Jupiter, Kraken, Lido, 1inch, Phantom, Polymarket, Solscan, Stripe, Uniswap, Zapper |
| **Collaboration** | Slack, Teams, Discord, Telegram, Notion, Confluence, Jira, Linear, Asana, Monday, ClickUp, Trello |
| **Google Suite** | Drive, Docs, Sheets, Calendar, Gmail |
| **DevOps** | GitHub, GitLab, Vercel, Railway |
| **Design** | Figma |
| **Automation** | Zapier |
| ...and 60+ more | |

Each server is a standalone module under `modules/mcpgate/src/servers/`.

## Credential Management

MCPGate supports pluggable credential adapters:

```
EnvVarAdapter      — Read tokens from environment variables (simplest)
DatabaseAdapter    — AES-256-GCM encrypted credential store in Postgres
CompositeAdapter   — Chain multiple adapters with fallback priority
```

Implement the `CredentialAdapter` interface to add your own (e.g., Vault, AWS Secrets Manager).

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tools/call` | Execute a tool call |
| GET | `/tools/search` | Semantic tool discovery |
| GET | `/servers` | List registered servers |
| POST | `/agents` | Register an agent |
| POST | `/sessions` | Create a session with budget |
| POST | `/chains` | Execute a tool chain |
| GET | `/audit` | Query audit logs |
| GET | `/health` | Health check |

## Testing

```bash
npm test              # Run all tests (vitest)
npm run check:boundary  # Verify OSS/cloud boundary
```

93 tests across 14 test files.

## Self-Hosting

```bash
docker build -t mcpgate .
docker run -p 4020:4020 --env-file .env mcpgate
```

Requires Postgres. See `.env.example` for configuration.

## License

[MIT](./LICENSE) — see [LICENSING.md](./LICENSING.md) for details.

Built by [RaijinLabs](https://github.com/raijinlabs).
