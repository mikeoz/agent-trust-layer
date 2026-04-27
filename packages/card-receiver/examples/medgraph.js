// MedGraph — CARD Receiver SDK Integration Example
// ============================================================
// This example shows how to wire @opnli/card-receiver into
// MedGraph's Supabase Edge Functions. It replaces the stub
// agent-authorize endpoint with real CARD Set validation.
//
// This is a reference implementation. Adapt it for your platform.
// ============================================================

const { defineServiceRules, validateCardSet, createSessionToken, auditAccess, createAuditChain } = require('@opnli/card-receiver');

// ── Step 1: Define your service rules (CARD Issuer side) ─────
// Call this once during app initialization.

const { policy, cardStack, nhbInvitation } = defineServiceRules({
  serviceName: 'MedGraph',
  serviceId: 'medgraph-health-001',
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
    boundary: 'This session only — no data retained after you close CROCbox'
  }
});

// The nhbInvitation object is what you render on the CARD Issuance
// Invitation page — four lines, one Allow button, one Deny button.
// INV-CA-3: Every CARD Acceptor presents the same UX pattern.
console.log('NHB Invitation:', nhbInvitation);

// ── Step 2: Handle agent authorization ───────────────────────
// Replace the stub agent-authorize Edge Function with this.

async function handleAgentAuthorize(cardSet, userId, supabaseAdmin) {
  // Validate the CARD Set against our policy and the VE
  const result = await validateCardSet(cardSet, policy, {
    veEndpoint: 'https://ve-staging.opn.li/verify',
    timeout: 3000,      // 3-second timeout per HCL White Paper §8.2
    requireVE: true      // Fail-closed: no VE = no access
  });

  if (!result.valid) {
    return { authorized: false, errors: result.errors };
  }

  // Issue a session token with persistence to Supabase
  const session = await createSessionToken(
    result.session_scope,
    cardStack.session_ttl_seconds,
    {
      serviceRules: cardStack,
      persistSession: async (record) => {
        // Write to MedGraph's agent_sessions table
        const { error } = await supabaseAdmin
          .from('agent_sessions')
          .insert({
            user_id: userId,
            agent_id: record.agent_id,
            agent_name: record.agent_name,
            session_token: record.token,
            allowed_ops: record.allowed_ops,
            expires_at: record.expires_at
          });
        if (error) throw new Error('Supabase insert failed: ' + error.message);
      }
    }
  );

  // Audit the session creation (INV-CA-5: no content in audit)
  await auditAccess(session.token, {
    action: 'agent_session_created',
    target_type: 'agent_session',
    target_id: session.token.slice(0, 8) + '...'  // Truncated for audit
  });

  return {
    authorized: true,
    session_token: session.token,
    expires_at: session.expires_at,
    allowed_ops: session.allowed_ops,
    service_name: cardStack.service_name,
    service_rules: session.service_rules
  };
}

// ── Step 3: Protect your data endpoints ──────────────────────
// On every API call, validate the session token and audit.

async function handleRecordAccess(sessionToken, recordId, supabaseAdmin) {
  // Look up the session
  const { data: session, error } = await supabaseAdmin
    .from('agent_sessions')
    .select('*')
    .eq('session_token', sessionToken)
    .is('revoked_at', null)
    .single();

  if (error || !session) {
    return { authorized: false, error: 'Invalid or expired session' };
  }

  // Check expiration
  if (new Date(session.expires_at) < new Date()) {
    return { authorized: false, error: 'Session expired' };
  }

  // Check allowed_ops
  if (!session.allowed_ops.includes('read')) {
    return { authorized: false, error: 'Read access not permitted' };
  }

  // Audit the access (INV-CA-5: record ID only, no content)
  await auditAccess(sessionToken, {
    action: 'agent_record_read',
    target_type: 'timeline_event',
    target_id: recordId
  });

  return { authorized: true, session };
}

// ── Exports for Edge Function use ────────────────────────────
module.exports = {
  policy,
  cardStack,
  nhbInvitation,
  handleAgentAuthorize,
  handleRecordAccess
};
