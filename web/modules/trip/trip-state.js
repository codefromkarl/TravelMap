/** Current structured itinerary and its export representation. */
import { renderTripStats, clearTripStats } from './trip-stats.js';
import { serializeTripPlan } from './trip-serialization.js';

let _currentPlan = null;

/** @returns {object|null} Current plan, including legacy guest/history updates. */
export function getCurrentTripPlan() {
  if (typeof window !== 'undefined' && '_lastTripPlan' in window) {
    _currentPlan = window._lastTripPlan || null;
  }
  return _currentPlan;
}

/** Publish a plan to current consumers and the existing map compatibility boundary.
 * @param {object|null} plan
 * @returns {object|null}
 */
export function setCurrentTripPlan(plan) {
  // Prepare consumers before publication: malformed input must not replace active state on failure.
  if (plan) serializeTripPlan(plan);
  if (typeof document !== 'undefined') {
    if (plan) renderTripStats(plan);
    else clearTripStats();
  }
  _currentPlan = plan;
  if (typeof window !== 'undefined') window._lastTripPlan = plan;
  return plan;
}

/** @returns {string|null} Markdown derived from the active structured plan. */
export function getCurrentTripMarkdown() {
  const plan = getCurrentTripPlan();
  return plan ? serializeTripPlan(plan) : null;
}
