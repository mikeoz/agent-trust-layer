// @opnli/card-receiver — CARD Receiver SDK
// For platforms adopting the Human Consent Layer
// ============================================================
// v0.2.0 — Session B: CARD Issuer/Receiver model
//
// CARD Issuer (define your rules):
//   defineServiceRules(config) → { policy, cardStack, nhbInvitation }
//
// CARD Receiver (validate incoming agents):
//   validateCardSet(cardSet, policy, options) → { valid, errors, session_scope }
//   createSessionToken(scope, ttl, options) → { token, expires_at, ... }
//   auditAccess(token, action, options) → audit entry with hash chain
//
// Middleware (protect Express routes):
//   cardReceiverMiddleware(config) → Express middleware function
//
// Utilities:
//   verifyEntityWithVE(entityCard, veEndpoint, timeout) → { verified, reason }
//   createAuditChain(initialHash) → chain tracker
//   sha256(data) → hex hash
// ============================================================

const { validateCardSet, verifyEntityWithVE, createSessionToken, auditAccess, createAuditChain, sha256 } = require('./card-set-validator');
const { defineServiceRules } = require('./service-rules');
const { cardReceiverMiddleware } = require('./middleware');

module.exports = {
  // CARD Issuer
  defineServiceRules,

  // CARD Receiver
  validateCardSet,
  verifyEntityWithVE,
  createSessionToken,
  auditAccess,

  // Middleware
  cardReceiverMiddleware,

  // Utilities
  createAuditChain,
  sha256
};
