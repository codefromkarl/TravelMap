/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { validateToolArguments } from '@earendil-works/pi-ai';
import { generateActionLinksTool } from '../tools/action-links.js';
import { enrichSupplyDetailsTool } from '../tools/supply-enrich.js';

function plan(name) {
  return {
    city: '杭州', cities: ['杭州'], startDate: '2026-06-01', endDate: '2026-06-01',
    days: [{ date: '2026-06-01', dayIndex: 1, city: '杭州', attractions: [{ name, nameZh: name, location: { latitude: 30, longitude: 120 } }] }],
  };
}

beforeEach(() => { window._lastTripPlan = plan('原始景点'); });

describe('finalization tools', () => {
  it('keeps unknown prices/durations null through the real SDK validator', async () => {
    const current = plan('真实景点');
    Object.assign(current.days[0].attractions[0], {
      ticketPrice: null, visitDuration: null, source: 'amap', coordinateSystem: 'gcj02',
      fetchedAt: '2026-06-01T00:00:00Z', isSynthetic: false,
    });
    const args = validateToolArguments(generateActionLinksTool, {
      id: 'lookup', type: 'toolCall', name: 'generate_action_links', arguments: { tripPlan: current },
    });
    expect(args.tripPlan.days[0].attractions[0]).toMatchObject({ ticketPrice: null, visitDuration: null, source: 'amap', coordinateSystem: 'gcj02', isSynthetic: false });
    const result = await generateActionLinksTool.execute('lookup', args);
    expect(result.details.tripPlan.days[0].attractions[0].ticketPrice).toBeNull();
  });

  it('returns a candidate plan without publishing it before the agent run succeeds', async () => {
    const previous = window._lastTripPlan;
    const next = plan('待完成景点');
    const actionResult = await generateActionLinksTool.execute('links', { tripPlan: next });
    expect(actionResult.details.tripPlan).toBe(next);
    expect(window._lastTripPlan).toBe(previous);
    const supplyResult = await enrichSupplyDetailsTool.execute('supply', { tripPlan: next });
    expect(supplyResult.details.tripPlan).toBe(next);
    expect(window._lastTripPlan).toBe(previous);
  });
  it('neutralizes injected Markdown schemes and preserves generated HTTP booking links', async () => {
    const current = plan('[click](javascript:alert(1))');
    current.days[0].hotel = { name: '[hotel](javascript:alert(1))' };
    current.days[0].attractions[0].reservationRequired = true;
    current.days[0].attractions[0].routes = [{ name: '[route](javascript:alert(1))', waypoints: [{ name: '[waypoint](javascript:alert(1))', supplyPoints: [{ name: '[supply](javascript:alert(1))', estimatedCost: 10 }] }] }];
    const links = await generateActionLinksTool.execute('links', { tripPlan: current });
    expect(links.content[0].text).not.toMatch(/\]\(javascript:/i);
    expect(links.content[0].text).toContain('[Booking.com 比价](https://www.booking.com/');
    expect(links.content[0].text).toContain('[查询预约方式](https://www.google.com/');
    const supplies = await enrichSupplyDetailsTool.execute('supply', { tripPlan: current });
    expect(supplies.content[0].text).not.toMatch(/\]\(javascript:/i);
    expect(supplies.content[0].text).toContain('supply');
  });

});
