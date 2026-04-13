// @opnli/atl-devkit — CARD Set Presentation
// The CCA-side complement to @opnli/card-receiver
// ============================================================

const { v4: uuidv4 } = typeof crypto !== 'undefined' && crypto.randomUUID 
  ? { v4: () => crypto.randomUUID() }
  : { v4: () => 'urn:uuid:' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) };

/**
 * Present a CARD Set to a CARD-Receiving platform.
 *
 * Assembles the CARD Set from stored CARDs, signs it with the
 * principal's authorization, sends it to the CARD Receiver endpoint,
 * and returns the session token if accepted.
 *
 * @param {object} cards - { entity, data, use, boundary } — the four CARDs
 * @param {object} principal - { id, type } — the NHB authorizing this presentation
 * @param {string} receiverEndpoint - URL of the platform's CARD Receiver
 * @param {object} options - { timeout, headers }
 * @returns {object} { accepted, session, errors }
 */
async function atlPresentCards(cards, principal, receiverEndpoint, options = {}) {
  // ── Assemble the CARD Set ───────────────────────────────────
  const cardSet = {
    set_version: '0.1.0',
    set_id: 'urn:uuid:' + generateId(),
    presented_at: new Date().toISOString(),
    expires_at: null,
    principal: {
      id: principal.id,
      type: 'nhb',
      signature: null
    },
    entity_card: { card_type: 'entity', ...cards.entity },
    data_card: { card_type: 'data', ...cards.data },
    use_card: { card_type: 'use', ...cards.use },
    boundary_card: { card_type: 'boundary', ...cards.boundary },
    tno_attestation: null
  };

  // ── Validate principal consistency ──────────────────────────
  if (cardSet.entity_card.principal_id && cardSet.entity_card.principal_id !== principal.id) {
    return {
      accepted: false,
      session: null,
      errors: ['Entity CARD principal_id does not match presentation principal'],
      cardSet
    };
  }

  // ── Present to the CARD Receiver ────────────────────────────
  const timeout = options.timeout || 10000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(receiverEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(cardSet),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      let errors;
      try {
        const parsed = JSON.parse(body);
        errors = parsed.errors || [parsed.message || 'Receiver returned ' + res.status];
      } catch {
        errors = ['Receiver returned ' + res.status + ': ' + body.slice(0, 200)];
      }
      return { accepted: false, session: null, errors, cardSet };
    }

    const session = await res.json();
    return {
      accepted: true,
      session,
      errors: [],
      cardSet
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      return {
        accepted: false,
        session: null,
        errors: ['Presentation timed out after ' + timeout + 'ms'],
        cardSet
      };
    }
    return {
      accepted: false,
      session: null,
      errors: ['Presentation failed: ' + e.message],
      cardSet
    };
  }
}

/**
 * Load a CARD Set template and fill in the variable fields.
 *
 * @param {object} template - A template from templates/ (e.g., reddit-consumer.json)
 * @param {object} values - { principalId, agentId, agentName, certificationHash }
 * @returns {object} Filled CARD Set ready for presentation
 */
function atlFillTemplate(template, values) {
  const filled = JSON.parse(JSON.stringify(template));

  // Remove the _comment field
  delete filled._comment;

  // Fill principal
  filled.principal.id = values.principalId || filled.principal.id;

  // Fill entity card
  filled.entity_card.agent_id = values.agentId || filled.entity_card.agent_id;
  filled.entity_card.principal_id = values.principalId || filled.entity_card.principal_id;
  if (values.agentName) filled.entity_card.agent_name = values.agentName;
  if (values.certificationHash) filled.entity_card.certification_hash = values.certificationHash;

  // Fill presentation metadata
  filled.set_id = 'urn:uuid:' + generateId();
  filled.presented_at = new Date().toISOString();

  return filled;
}

function generateId() {
  const hex = () => Math.random().toString(16).slice(2, 6);
  return hex() + hex() + '-' + hex() + '-4' + hex().slice(1) + '-' + hex() + '-' + hex() + hex() + hex();
}

module.exports = { atlPresentCards, atlFillTemplate };
