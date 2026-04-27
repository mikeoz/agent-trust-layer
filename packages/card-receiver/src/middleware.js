// @opnli/card-receiver — Express Middleware
// Protects API routes with CARD session token validation.
// ============================================================

const { auditAccess } = require('./card-set-validator');

/**
 * Express middleware that validates CARD session tokens on every request.
 * 
 * Drop this into any Express route to protect it:
 * 
 *   const { cardReceiverMiddleware } = require('@opnli/card-receiver');
 *   app.use('/api/records', cardReceiverMiddleware({
 *     lookupSession: async (token) => { ... },
 *     auditOptions: { persistAudit: async (entry) => { ... } }
 *   }));
 * 
 * @param {object} config
 * @param {function} config.lookupSession - async (token) => sessionRecord | null
 *   Called on every request. Must return the session record from the
 *   platform's storage (e.g., agent_sessions table), or null if
 *   the token is invalid/expired/revoked.
 * @param {object} [config.auditOptions] - Options passed to auditAccess()
 * @param {function} [config.extractAction] - (req) => { action, target_type, target_id }
 *   Custom function to extract the action from the request.
 *   Default: reads from req.body or constructs from req.method + req.path.
 * @returns {function} Express middleware
 */
function cardReceiverMiddleware(config) {
  if (!config.lookupSession) {
    throw new Error('cardReceiverMiddleware requires a lookupSession function');
  }

  return async function(req, res, next) {
    // ── Extract token from request ────────────────────────────
    let token = null;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Fall back to request body (for Edge Function POST pattern)
    if (!token && req.body && req.body.session_token) {
      token = req.body.session_token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Missing session token',
        hint: 'Provide a CARD session token via Authorization header or session_token in request body'
      });
    }

    // ── Look up session ─────────────────────────────────────
    let session;
    try {
      session = await config.lookupSession(token);
    } catch (e) {
      // INV-FC: fail-closed on lookup error
      return res.status(500).json({ error: 'Session lookup failed' });
    }

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    // ── Check expiration ────────────────────────────────────
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session token expired' });
    }

    // ── Check revocation ────────────────────────────────────
    if (session.revoked_at) {
      return res.status(401).json({ error: 'Session token revoked' });
    }

    // ── Check allowed_ops against request ────────────────────
    const requestedOp = inferOperation(req);
    if (session.allowed_ops && !session.allowed_ops.includes(requestedOp)) {
      return res.status(403).json({
        error: 'Operation not permitted',
        requested: requestedOp,
        allowed: session.allowed_ops
      });
    }

    // ── Extract action for audit ────────────────────────────
    let actionInfo;
    if (config.extractAction) {
      actionInfo = config.extractAction(req);
    } else {
      actionInfo = {
        action: req.method.toLowerCase() + ':' + req.path,
        target_type: 'api_endpoint',
        target_id: req.path
      };
    }

    // ── Audit the access (INV-CA-5: no content) ─────────────
    try {
      await auditAccess(token, actionInfo, config.auditOptions || {});
    } catch (e) {
      // Audit failure does not block the request, but is logged
      console.error('[card-receiver] Audit error:', e.message);
    }

    // ── Attach session to request for downstream use ─────────
    req.cardSession = session;
    next();
  };
}

/**
 * Infer the operation type from an HTTP request.
 * Maps HTTP methods to CARD access levels.
 */
function inferOperation(req) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  if (method === 'POST') {
    // POST can be read (query) or write (create) — check the path or body
    // Default to read for API query patterns (agent-records-list, agent-records-detail)
    return 'read';
  }
  if (method === 'PUT' || method === 'PATCH') return 'write';
  if (method === 'DELETE') return 'delete';
  return 'read';
}

module.exports = { cardReceiverMiddleware };
