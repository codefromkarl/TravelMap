/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { Type, validateToolArguments } from '@earendil-works/pi-ai';
import { companionQATool } from '../tools/companion.js';
import { getCurrentTripPlan, setCurrentTripPlan } from '../trip/trip-state.js';

function plan(name, ticketPrice) {
  return { city: '杭州', days: [{ date: '2026-10-13', attractions: [{
    name, nameZh: name, nameEn: '', address: '杭州', ticketPrice, visitDuration: null,
    location: { latitude: 30.2, longitude: 120.1 },
  }] }], weatherInfo: [] };
}

beforeEach(() => { setCurrentTripPlan(null); });

describe('companion reads active itinerary', () => {
  it('uses the active plan instead of stale supplied arguments without publishing a replacement', async () => {
    const active = plan('西湖', null);
    setCurrentTripPlan(active);
    const result = await companionQATool.execute('query', { question: '西湖门票多少', tripPlan: plan('旧景点', 80) });
    expect(result.content[0].text).toContain('西湖');
    expect(result.content[0].text).toContain('待核实');
    expect(result.content[0].text).not.toContain('¥0');
    expect(result.content[0].text).not.toContain('¥null');
    expect(result.details.matched).toBe(1);
    expect(getCurrentTripPlan()).toBe(active);
  });

  it('keeps untrusted plan names inert in Markdown tool output', async () => {
    setCurrentTripPlan(plan('[点击](javascript:alert(1))', null));
    const result = await companionQATool.execute('query', { question: '[点击](javascript:alert(1))门票' });
    expect(result.content[0].text).toContain('点击');
    expect(result.content[0].text).not.toContain('](javascript:');
    expect(result.details.matched).toBe(1);
  });

  it('does not invent a plan when none is available', async () => {
    const result = await companionQATool.execute('query', { question: '预算多少' });
    expect(result.content[0].text).toContain('请先生成或加载');
    expect(result.details.matched).toBe(0);
    expect(getCurrentTripPlan()).toBeNull();
  });

  it('preserves null and known numeric prices through the real SDK conversion', () => {
    const attraction = companionQATool.parameters.properties.tripPlan.properties.days.items.properties.attractions.items;
    const tool = { ...companionQATool, parameters: Type.Object({
      ticketPrice: attraction.properties.ticketPrice,
      visitDuration: attraction.properties.visitDuration,
    }) };
    expect(validateToolArguments(tool, { name: tool.name, arguments: { ticketPrice: null, visitDuration: null } })).toEqual({ ticketPrice: null, visitDuration: null });
    expect(validateToolArguments(tool, { name: tool.name, arguments: { ticketPrice: 60, visitDuration: 120 } })).toEqual({ ticketPrice: 60, visitDuration: 120 });
  });
});
