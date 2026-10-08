'use strict';

/**
 * Failure while reading a retailer. `kind` lets the UI say something useful
 * instead of a vague "failed".
 *
 *  blocked   the retailer refused us (HTTP 403/429 or a bot-check page)
 *  cooldown  we are deliberately pausing after a block
 *  timeout   no answer in time
 *  network   could not connect at all
 *  http      the retailer returned an error status
 *  layout    the page loaded but is not shaped the way our parser expects
 */
class FetchError extends Error {
  /**
   * @param {'blocked'|'cooldown'|'timeout'|'network'|'http'|'layout'} kind
   * @param {string} message
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'FetchError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * A plain-English explanation safe to show to end users.
 * @param {{kind?: string, status?: number, message?: string}} err
 * @param {string} label  Retailer display name, e.g. "Dis-Chem".
 */
function friendlyMessage(err, label) {
  switch (err.kind) {
    case 'blocked':
      return `${label} is blocking automated requests right now (HTTP ${err.status || 403}). This is usually temporary. Wait a few minutes and try again.`;
    case 'cooldown':
      return err.message;
    case 'timeout':
      return `${label} took too long to respond. Check your connection or try again.`;
    case 'network':
      return `Couldn't reach ${label}. Check your internet connection.`;
    case 'http':
      return `${label} returned an error (HTTP ${err.status}). Try again shortly.`;
    case 'layout':
      return `${label} loaded, but its page layout wasn't recognised. The site may have changed, so the app needs an update.`;
    default:
      return `Something went wrong reading ${label}.`;
  }
}

module.exports = { FetchError, friendlyMessage };
