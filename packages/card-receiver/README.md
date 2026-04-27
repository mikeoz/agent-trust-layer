# @opnli/card-receiver

**CARD Receiver SDK** — Join the Opnli Trust Network as a CARD Acceptor.

Your platform defines its rules. The SDK enforces them. Three functions, your team can audit every line.

## Install

```
npm install @opnli/card-receiver
```

## Quick Start

```js
const {
  defineServiceRules,
  validateCardSet,
  createSessionToken,
  auditAccess
} = require('@opnli/card-receiver');

// Step 1: Define your rules (CARD Issuer — do this once)
const { policy, cardStack, nhbInvitation } = defineServiceRules({
  serviceName: 'MedGraph',
  serviceId: 'medgraph-001',
  minimumShieldLevel: 'green',
  allowedResources: ['medical_records'],
  maxAccessLevel: 'read',
  allowedActions: ['summarize', 'search', 'compare'],
  rateLimit: { requestsPerWindow: 30, windowSeconds: 60 },
  retention: 'session_only',
  sessionTtlSeconds: 3600,
  nhbSummary: {
    entity: 'BigCROC (your CROCbox AI agent)',
    data: 'Your medical records stored in MedGraph',
    use: 'Read and summarize your lab results',
    boundary: 'This session only — no data retained'
  }
});

// Step 2: Validate an incoming CARD Set (CARD Receiver)
const result = await validateCardSet(cardSet, policy, {
  veEndpoint: 'https://ve-staging.opn.li/verify',
  timeout: 3000,
  requireVE: true
});

if (result.valid) {
  // Step 3: Issue a scoped session token
  const session = await createSessionToken(result.session_scope, 3600, {
    serviceRules: cardStack,
    persistSession: async (record) => {
      // Store in your database (Supabase, Postgres, etc.)
      await db.insert('agent_sessions', record);
    }
  });

  console.log('Access granted:', session.token);
} else {
  console.log('Access denied:', result.errors);
}

// Step 4: Audit every access (no data content — IDs only)
await auditAccess(session.token, {
  action: 'record_read',
  target_type: 'timeline_event',
  target_id: recordId  // ID only, never content
}, {
  persistAudit: async (entry) => {
    await db.insert('audit_events', entry);
  }
});
```

## The CARD Issuer/Receiver Model

Every platform plays two roles:

**CARD Issuer** — You define what CARDs agents must present. "I require Green Shield, read-only, session-only, no retention." This is `defineServiceRules()`. Your rules. Your sovereignty.

**CARD Receiver** — When an agent presents CARDs, you validate them against the Opnli Verification Endpoint and your rules. This is `validateCardSet()` → `createSessionToken()` → `auditAccess()`.

## API

### defineServiceRules(config)

Define your platform's CARD requirements. Returns `{ policy, cardStack, nhbInvitation }`.

- `policy` — Pass to `validateCardSet()` on every request
- `cardStack` — Your service's rule definition (include in session responses)
- `nhbInvitation` — Four lines for the CARD Issuance Invitation UI (Entity, Data, Use, Boundary)

### validateCardSet(cardSet, policy, options?)

Validate all four CARDs against your rules and the VE.

Options:
- `veEndpoint` — URL of the Opnli Verification Endpoint
- `timeout` — VE request timeout in ms (default: 5000)
- `requireVE` — If true, VE is mandatory; no VE = denied (fail-closed)

### createSessionToken(sessionScope, ttlSeconds?, options?)

Create a session token scoped to the validated CARD Set.

Options:
- `persistSession` — `async (record) => void` to store the session in your database
- `serviceRules` — Include your service rules in the response

If `persistSession` throws, the session is NOT issued (fail-closed).

### auditAccess(token, action, options?)

Log an access event with SHA-256 hash chain.

**Critical: audit entries contain action and target ID only. Never include data content, titles, filenames, or summaries. This is a healthcare-grade privacy requirement.**

Options:
- `persistAudit` — `async (entry) => void` to store audit entries
- `auditChain` — Custom chain from `createAuditChain()` (default: in-memory)

### cardReceiverMiddleware(config)

Express middleware that validates session tokens on every request.

```js
const { cardReceiverMiddleware } = require('@opnli/card-receiver');

app.use('/api/records', cardReceiverMiddleware({
  lookupSession: async (token) => {
    return await db.query('agent_sessions', { session_token: token });
  },
  auditOptions: {
    persistAudit: async (entry) => { await db.insert('audit_events', entry); }
  }
}));
```

## Templates

See the `templates/` directory for complete CARD Set examples:
- `medgraph-health.json` — Healthcare data access
- `reddit-consumer.json` — Social media read access

## Tests

```
cd packages/card-receiver
node test/test-sdk.js
```

57 tests covering defineServiceRules, validateCardSet, createSessionToken, auditAccess, hash chain integrity, cross-template generalizability, and invariant enforcement.

## What This Enforces

| Invariant | What It Means | How the SDK Enforces It |
|---|---|---|
| INV-CA-1 | CARD summary matches enforcement | `validateCardSet` rejects mismatched access levels |
| INV-CA-2 | Session scoping is real | `createSessionToken` enforces TTL; tokens expire |
| INV-CA-3 | Uniform NHB experience | `defineServiceRules` produces standard 4-line invitation |
| INV-CA-4 | Pattern is generalizable | Same 3 functions for MedGraph, Reddit, banks, any service |
| INV-CA-5 | Audit never contains data content | `auditAccess` logs action + target ID only |
| INV-CA-6 | Service defines its own rules | `defineServiceRules` — your rules, SDK enforces them |
| INV-FC | Fail-closed | VE unreachable = denied. Persistence failure = no session |
| INV-16 | Tamper-evident audit | SHA-256 hash chain on every audit entry |

## License

Apache-2.0 — Openly Personal Networks, Inc. (https://opn.li)
