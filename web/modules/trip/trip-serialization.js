/** Serialize active itinerary data; untrusted values remain plain Markdown text. */
import { currentLang } from '../infra/context.js';
import { safeHttpUrl } from '../infra/content-safety.js';
import { I18N } from '../i18n.js';

function text(value) {
  return String(value ?? '').replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&');
}

function collection(value) {
  return Array.isArray(value) ? value.filter(item => item != null) : [];
}

function actionLink(link) {
  const url = safeHttpUrl(link?.url);
  return url ? `[${text(link.label || link.platform || url)}](${url.replace(/[()]/g, char => char === '(' ? '%28' : '%29')})` : '';
}

function price(value, unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `¥${value}` : unknown;
}

/** @param {object} plan @returns {string} */
export function serializeTripPlan(plan) {
  const d = I18N[currentLang] || I18N.zh;
  const unknown = d.tripPriceUnknown || '待核实';
  const lines = [`# ${text(plan.title || plan.city)} ${plan.days?.length || 0}${d.statsDays || '天'}`, ''];
  if (plan.demoNotice) lines.push(`> ${text(plan.demoNotice)}`, '');
  if (plan.startDate || plan.endDate) lines.push(`${text(plan.startDate)} — ${text(plan.endDate)}`, '');
  for (const [index, day] of collection(plan.days).entries()) {
    lines.push(`## ${(d.tripEditorDayTitle || '第 {day} 天').replace('{day}', index + 1)} · ${text(day.date)} · ${text(day.city || plan.city)}`, '');
    for (const attr of collection(day.attractions)) {
      lines.push(`- ${text(attr.nameZh || attr.name)} · ${price(attr.ticketPrice, unknown)}`);
      if (attr.visitDuration != null) lines.push(`  ${d.tripDurationMinutes || '游览分钟'}: ${text(attr.visitDuration)}`);
      for (const field of ['description', 'address', 'tips', 'reservationTips', 'businessHours', 'openingHours']) {
        if (attr[field]) lines.push(`  ${text(attr[field])}`);
      }
      if (attr.reservationRequired) lines.push(`  ${d.tripReservationLabel || '需预约'}`);
      const booking = actionLink({ label: d.tripReservationLabel || '预约', url: attr.bookingUrl || attr.reservationTimeline?.officialUrl });
      if (booking) lines.push(`  ${booking}`);
      if (attr.reservationTimeline?.bookingOpenDate) lines.push(`  ${text(attr.reservationTimeline.bookingOpenDate)} ${text(attr.reservationTimeline.releaseTime || '')}`);
      for (const link of [...collection(attr.actionLinks), ...collection(attr.reservationTimeline?.altChannels)]) {
        const safe = actionLink(link);
        if (safe) lines.push(`  ${safe}`);
      }
      if (attr.location) lines.push(`  ${d.tripCoordinatesLabel || '坐标'}: ${text(attr.location.latitude)}, ${text(attr.location.longitude)} ${text(attr.coordinateSystem || '')}`);
      if (attr.source || attr.fetchedAt) lines.push(`  ${d.tripSourceLabel || '来源'}: ${text(attr.source)} ${text(attr.fetchedAt || '')}`);
      for (const route of collection(attr.routes)) {
        lines.push(`  - ${text(route.name)}${route.id === attr.selectedRouteId ? ` (${d.tripSelectedRouteLabel || '当前路线'})` : ''}`);
        if (route.description) lines.push(`    ${text(route.description)}`);
        for (const waypoint of collection(route.waypoints)) {
          lines.push(`    - ${text(waypoint.name)}${waypoint.visitDuration == null ? '' : ` · ${text(waypoint.visitDuration)} ${d.tripDurationMinutes || '分钟'}`}`);
          if (waypoint.description) lines.push(`      ${text(waypoint.description)}`);
          for (const supply of collection(waypoint.supplyPoints)) {
            lines.push(`      - ${text(supply.name)}: ${text(supply.description)} · ${price(supply.estimatedCost, unknown)} ${text(supply.businessHours || '')}`);
          }
        }
        for (const warning of collection(route.supplyStrategy?.warnings)) lines.push(`    ${text(warning)}`);
        for (const risk of collection(route.riskFactors || route.riskAssessment?.riskFactors)) if (risk.description) lines.push(`    ${text(risk.description)}`);
      }
    }
    if (day.description) lines.push('', text(day.description));
    if (day.hotel) {
      lines.push('', `${d.tripHotelLabel || '住宿'}: ${text(day.hotel.name)} · ${price(day.hotel.estimatedCost, unknown)}`);
      if (day.hotel.address) lines.push(text(day.hotel.address));
      for (const link of collection(day.hotel.comparisonLinks)) {
        const safe = actionLink(link);
        if (safe) lines.push(safe);
      }
    }
    for (const meal of collection(day.meals)) {
      lines.push(`${text(meal.type)}: ${text(meal.restaurant?.name || meal.name || meal.description)} · ${price(meal.estimatedCost, unknown)}`);
    }
    if (day.transportation) lines.push(text(day.transportation));
    if (day.transferInfo) lines.push(text(day.transferInfo));
    lines.push('');
  }
  if (plan.budget && typeof plan.budget === 'object' && !Array.isArray(plan.budget)) {
    lines.push(`## ${d.statsBudget || '预算'}`, '');
    for (const [key, label] of [
      ['totalAttractions', d.tripTicketsLabel || '门票'],
      ['totalHotels', d.tripHotelLabel || '住宿'],
      ['totalMeals', d.tripMealsLabel || '餐饮'],
      ['totalTransportation', d.tripTransportLabel || '市内交通'],
      ['totalInterCityTransport', d.tripInterCityLabel || '城际交通'],
      ['total', d.tripTotalLabel || '合计'],
    ]) {
      if (key in plan.budget) lines.push(`- ${label}: ${price(plan.budget[key], unknown)}`);
    }
    lines.push('');
  }
  if (collection(plan.weatherInfo).length) {
    lines.push(`## ${d.tripWeatherLabel || '天气'}`, '');
    for (const weather of collection(plan.weatherInfo)) {
      lines.push(`- ${text(weather.date)} ${text(weather.city)}: ${text(weather.dayWeather || unknown)}${weather.dayTemp == null ? '' : ` ${text(weather.dayTemp)}°`}`);
    }
    lines.push('');
  }
  for (const link of [...collection(plan.flightLinks), ...collection(plan.actionLinks)]) {
    const safe = actionLink(link);
    if (safe) lines.push(safe);
  }
  if (plan.overallSuggestions) lines.push(text(plan.overallSuggestions));
  return lines.join('\n');
}
