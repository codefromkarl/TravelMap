/** Select only successful, structurally usable tool output from one agent run. */
import { validateTripPlanSchema } from '../tools/validate-trip.js';

/** @param {Array<object>} messages @returns {object|null} */
export function latestValidTripPlan(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'toolResult' || message.isError || !message.details?.tripPlan) continue;
    const plan = message.details.tripPlan;
    if (validateTripPlanSchema(plan).valid) return plan;
  }
  return null;
}
