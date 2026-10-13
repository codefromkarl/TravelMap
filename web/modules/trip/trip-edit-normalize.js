/** Normalize edited schedules and adjust only costs supported by existing data. */
function knownCost(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function collectCosts(plan, kind) {
  return plan.days.flatMap(day => {
    if (kind === 'totalAttractions') return (day.attractions || []).map(a => a.ticketPrice);
    if (kind === 'totalHotels') return day.hotel ? [day.hotel.estimatedCost] : [];
    return (day.meals || []).map(meal => meal.estimatedCost);
  });
}

/** @param {object} plan Edited draft @param {object} original Initial snapshot
 * @returns {object} The normalized draft, without inventing prices or weather.
 */
export function normalizeEditedTrip(plan, original) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(original.startDate || '')
    ? new Date(`${original.startDate}T00:00:00Z`) : null;
  for (const [index, day] of plan.days.entries()) {
    day.dayIndex = index + 1;
    if (start && Number.isFinite(start.getTime())) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      day.date = date.toISOString().slice(0, 10);
    } else if (original.days[index]?.date) {
      day.date = original.days[index].date;
    }
  }
  if (plan.days.length) {
    plan.startDate = plan.days[0].date;
    plan.endDate = plan.days.at(-1).date;
  }
  // Forecasts are location/date facts. Keep only forecasts still applicable.
  if (Array.isArray(plan.weatherInfo)) {
    plan.weatherInfo = plan.weatherInfo.filter(weather => plan.days.some(day =>
      day.date === weather.date && (day.city || plan.city) === weather.city
    ));
  }
  const cities = [...new Set(plan.days.map(day => day.city).filter(Boolean))];
  if (cities.length) {
    plan.cities = cities;
    if (!cities.includes(plan.city)) plan.city = cities[0];
  }
  if (!original.budget) return plan;
  plan.budget = { ...original.budget };
  for (const kind of ['totalAttractions', 'totalHotels', 'totalMeals']) {
    const before = collectCosts(original, kind);
    const after = collectCosts(plan, kind);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!before.every(knownCost) || !after.every(knownCost) || !knownCost(original.budget[kind])) {
      plan.budget[kind] = null;
      continue;
    }
    const beforeTotal = before.reduce((sum, cost) => sum + cost, 0);
    const afterTotal = after.reduce((sum, cost) => sum + cost, 0);
    // Retain the existing group-price factor; no new traveler/discount assumptions.
    plan.budget[kind] = beforeTotal > 0
      ? Math.round(original.budget[kind] * afterTotal / beforeTotal)
      : (afterTotal === 0 ? original.budget[kind] : null);
  }
  if (plan.days.length !== original.days.length && original.budget.totalTransportation !== 0) {
    plan.budget.totalTransportation = null;
  }
  const oldCities = [...new Set(original.days.map(day => day.city).filter(Boolean))];
  if (JSON.stringify(cities) !== JSON.stringify(oldCities) && original.budget.totalInterCityTransport !== 0) {
    plan.budget.totalInterCityTransport = null;
  }
  const kinds = ['totalAttractions', 'totalHotels', 'totalMeals', 'totalTransportation', 'totalInterCityTransport'];
  if (kinds.some(kind => kind in plan.budget && !knownCost(plan.budget[kind]))) {
    plan.budget.total = null;
  } else if (knownCost(original.budget.total)) {
    const difference = kinds.reduce((sum, kind) => sum + (plan.budget[kind] || 0) - (original.budget[kind] || 0), 0);
    plan.budget.total = Math.max(0, original.budget.total + difference);
  }
  return plan;
}
