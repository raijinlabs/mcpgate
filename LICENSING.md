# Licensing

This repository uses a **dual-license** model, following the same pattern as
GitLab, PostHog, Cal.com, and other open-core projects.

## Open Source (MIT)

Everything **outside** the `cloud/` directory is licensed under the
[MIT License](./LICENSE). This includes:

- `apps/` — TrustGate API, MCPGate API, Control-Plane
- `modules/` — TrustGate, MCPGate, shared contracts
- `packages/` — gateway-core, metering, passport, observability
- `migrations/` — database schema
- `infra/` — LiteLLM configuration

You are free to use, modify, and distribute this code under the MIT terms.

## Proprietary (cloud/)

The `cloud/` directory contains **proprietary SaaS-only code** that is
NOT covered by the MIT License. See [`cloud/LICENSE`](./cloud/LICENSE).

This includes:

- `cloud/billing/` — Stripe billing integration
- `cloud/mcpgate-cloud/` — Nango OAuth adapter and SaaS-specific features

## Boundary Rules

- OSS code (`apps/`, `modules/`, `packages/`) **must never** import from `cloud/`.
- SaaS code (`cloud/`) **may** import from OSS code.
- The `apps/` entry points use **dynamic imports** to optionally load `cloud/`
  modules at runtime (e.g., NangoAdapter, Stripe billing routes).
- A CI check enforces that no static imports cross the OSS → cloud boundary.
