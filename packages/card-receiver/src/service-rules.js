// @opnli/card-receiver — Service Rules Definition
// The "CARD Issuer" side: services define what CARDs they require.
// ============================================================

/**
 * Define the service's CARD requirements — the "CARD Stack" that
 * agents must present to access this service.
 *
 * This is the CARD Issuer function. The service declares its rules once
 * during setup. The returned policy object is passed to validateCardSet()
 * on every incoming agent request.
 *
 * @param {object} config - Service configuration
 * @param {string} config.serviceName - Human-readable service name (e.g., "MedGraph")
 * @param {string} config.serviceId - Unique service identifier on the Trust Network
 * @param {string} config.minimumShieldLevel - 'green' or 'yellow'
 * @param {string[]} config.allowedResources - Resources agents can access (e.g., ['medical_records'])
 * @param {string} config.maxAccessLevel - Maximum access: 'read', 'write', or 'read-write'
 * @param {string[]} config.allowedActions - Permitted agent actions (e.g., ['summarize', 'search'])
 * @param {object} config.rateLimit - { requestsPerWindow: number, windowSeconds: number }
 * @param {string} config.retention - 'session_only' | 'persistent' | 'cache_ttl'
 * @param {number} [config.sessionTtlSeconds=3600] - Default session duration
 * @param {object} [config.nhbSummary] - NHB-readable CARD summaries for the Issuance Invitation
 * @param {string} config.nhbSummary.entity - e.g., "BigCROC (your CROCbox AI agent)"
 * @param {string} config.nhbSummary.data - e.g., "Your medical records stored in MedGraph"
 * @param {string} config.nhbSummary.use - e.g., "Read and summarize your lab results"
 * @param {string} config.nhbSummary.boundary - e.g., "This session only — no data retained"
 * @returns {object} { policy, cardStack, nhbInvitation }
 */
function defineServiceRules(config) {
  const errors = [];

  // ── Required fields ───────────────────────────────────────────
  if (!config.serviceName) errors.push('serviceName is required');
  if (!config.serviceId) errors.push('serviceId is required');
  if (!config.minimumShieldLevel) errors.push('minimumShieldLevel is required');
  if (!config.allowedResources || !Array.isArray(config.allowedResources) || config.allowedResources.length === 0) {
    errors.push('allowedResources must be a non-empty array');
  }
  if (!config.maxAccessLevel) errors.push('maxAccessLevel is required');
  if (!config.allowedActions || !Array.isArray(config.allowedActions) || config.allowedActions.length === 0) {
    errors.push('allowedActions must be a non-empty array');
  }
  if (!config.retention) errors.push('retention is required');

  // ── Validate enum values ──────────────────────────────────────
  const validShields = ['green', 'yellow'];
  if (config.minimumShieldLevel && !validShields.includes(config.minimumShieldLevel)) {
    errors.push('minimumShieldLevel must be "green" or "yellow"');
  }

  const validAccess = ['read', 'write', 'read-write'];
  if (config.maxAccessLevel && !validAccess.includes(config.maxAccessLevel)) {
    errors.push('maxAccessLevel must be "read", "write", or "read-write"');
  }

  const validRetention = ['session_only', 'persistent', 'cache_ttl'];
  if (config.retention && !validRetention.includes(config.retention)) {
    errors.push('retention must be "session_only", "persistent", or "cache_ttl"');
  }

  // ── Rate limit validation ─────────────────────────────────────
  if (config.rateLimit) {
    if (typeof config.rateLimit.requestsPerWindow !== 'number' || config.rateLimit.requestsPerWindow <= 0) {
      errors.push('rateLimit.requestsPerWindow must be a positive number');
    }
    if (typeof config.rateLimit.windowSeconds !== 'number' || config.rateLimit.windowSeconds <= 0) {
      errors.push('rateLimit.windowSeconds must be a positive number');
    }
  }

  if (errors.length > 0) {
    throw new Error('Invalid service rules: ' + errors.join('; '));
  }

  // ── Build the platformPolicy object (consumed by validateCardSet) ──
  const policy = {
    minimumShieldLevel: config.minimumShieldLevel,
    allowedResources: config.allowedResources,
    maxAccessLevel: config.maxAccessLevel,
    allowedActions: config.allowedActions,
    maxCallsPerDay: config.rateLimit
      ? Math.floor(config.rateLimit.requestsPerWindow * (86400 / config.rateLimit.windowSeconds))
      : undefined
  };

  // ── Build the CARD Stack definition (what the service requires) ──
  const sessionTtl = config.sessionTtlSeconds || 3600;
  const cardStack = {
    service_name: config.serviceName,
    service_id: config.serviceId,
    required_shield: config.minimumShieldLevel,
    allowed_resources: config.allowedResources,
    max_access_level: config.maxAccessLevel,
    allowed_actions: config.allowedActions,
    rate_limit: config.rateLimit || null,
    retention: config.retention,
    session_ttl_seconds: sessionTtl,
    defined_at: new Date().toISOString()
  };

  // ── Build the NHB Issuance Invitation (INV-CA-3: uniform UX) ──
  const nhbInvitation = config.nhbSummary ? {
    entity: config.nhbSummary.entity,
    data: config.nhbSummary.data,
    use: config.nhbSummary.use,
    boundary: config.nhbSummary.boundary
  } : null;

  return { policy, cardStack, nhbInvitation };
}

module.exports = { defineServiceRules };
