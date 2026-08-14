/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  listTrips: vi.fn(),
  loadTripById: vi.fn(),
  saveTripPlan: vi.fn(),
}));

vi.mock("../db.js", () => ({
  listTrips: db.listTrips,
  loadTripById: db.loadTripById,
  saveTripPlan: db.saveTripPlan,
}));

import { initTripSync, syncTrips } from "../infra/trip-sync.js";

function setHostname(hostname) {
  Object.defineProperty(window, "location", {
    value: { hostname },
    configurable: true,
  });
}

function listResponse(trips) {
  return { ok: true, json: async () => ({ trips }) };
}

function tripResponse(trip) {
  return { ok: true, json: async () => ({ trip }) };
}

function okResponse() {
  return { ok: true, json: async () => ({}) };
}

beforeEach(() => {
  vi.resetAllMocks();
  setHostname("example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isLocalHost guard", () => {
  it("does not sync on localhost and makes no network or db calls", async () => {
    setHostname("localhost");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.listTrips).not.toHaveBeenCalled();
    expect(db.loadTripById).not.toHaveBeenCalled();
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
});

describe("merge directions", () => {
  it("uploads a local trip that is newer than the server copy", async () => {
    const localTrip = { id: "up-1", title: "本地", updatedAt: "2026-01-02T00:00:00.000Z" };
    db.listTrips.mockResolvedValue([localTrip]);
    db.loadTripById.mockResolvedValue(localTrip);
    db.saveTripPlan.mockResolvedValue(localTrip);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([
        { id: "up-1", title: "本地", city: "", days: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
      ]))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0]).toBe("/api/trips/up-1");
    expect(JSON.parse(putCalls[0][1].body)).toEqual({ trip: localTrip });
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });

  it("downloads a server trip that is newer than the local copy", async () => {
    const localTrip = { id: "down-1", title: "旧", updatedAt: "2026-01-01T00:00:00.000Z" };
    const serverTripFull = { id: "down-1", title: "新", updatedAt: "2026-01-02T00:00:00.000Z", days: [] };
    db.listTrips.mockResolvedValue([localTrip]);
    db.loadTripById.mockResolvedValue(localTrip);
    db.saveTripPlan.mockResolvedValue(serverTripFull);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([
        { id: "down-1", title: "新", city: "", days: 2, updatedAt: "2026-01-02T00:00:00.000Z" },
      ]))
      .mockResolvedValueOnce(tripResponse(serverTripFull));
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/trips/down-1" && !init?.method)).toBe(true);
    expect(db.saveTripPlan).toHaveBeenCalledWith(serverTripFull);
  });

  it("uploads local-only trips and downloads server-only trips", async () => {
    const localOnly = { id: "local-only", title: "本地独有", updatedAt: "2026-01-03T00:00:00.000Z" };
    const serverOnlySummary = { id: "server-only", title: "服务端独有", city: "上海", days: 2, updatedAt: "2026-01-04T00:00:00.000Z" };
    const serverOnlyFull = { id: "server-only", title: "服务端独有", city: "上海", days: [], updatedAt: "2026-01-04T00:00:00.000Z" };

    db.listTrips.mockResolvedValue([localOnly]);
    db.loadTripById.mockImplementation(async (id) => (id === "server-only" ? null : localOnly));
    db.saveTripPlan.mockResolvedValue(serverOnlyFull);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([serverOnlySummary]))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(tripResponse(serverOnlyFull));
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();

    expect(fetchMock).toHaveBeenCalledWith("/api/trips/local-only", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/trips/server-only" && !init?.method)).toBe(true);
    expect(db.saveTripPlan).toHaveBeenCalledWith(serverOnlyFull);
  });
});

describe("upload cooldown and retry", () => {
  it("does not re-upload the same trip within 5 seconds", async () => {
    const localTrip = { id: "cooldown-1", title: "防抖", updatedAt: "2026-01-05T00:00:00.000Z" };
    db.listTrips.mockResolvedValue([localTrip]);
    db.loadTripById.mockResolvedValue(localTrip);
    db.saveTripPlan.mockResolvedValue(localTrip);

    const fetchMock = vi.fn().mockResolvedValue(listResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();
    await syncTrips();

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls).toHaveLength(1);
  });

  it("silently retries a failed upload once", async () => {
    const localTrip = { id: "retry-1", title: "重试", updatedAt: "2026-01-06T00:00:00.000Z" };
    db.listTrips.mockResolvedValue([localTrip]);
    db.loadTripById.mockResolvedValue(localTrip);
    db.saveTripPlan.mockResolvedValue(localTrip);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await syncTrips();

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls).toHaveLength(2);
  });
});

describe("event-driven sync", () => {
  it("syncs after a debounced travelmap-trip-changed event", async () => {
    vi.useFakeTimers();
    db.listTrips.mockResolvedValue([]);
    db.loadTripById.mockResolvedValue(null);
    db.saveTripPlan.mockResolvedValue({});

    const fetchMock = vi.fn().mockResolvedValue(listResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    initTripSync();
    window.dispatchEvent(new CustomEvent("travelmap-trip-changed", { detail: { id: "t1" } }));

    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/trips" && !init?.method)).toBe(true);
  });

  it("flushes pending work on pagehide", async () => {
    const localTrip = { id: "pagehide-1", title: "冲刷", updatedAt: "2026-01-07T00:00:00.000Z" };
    db.listTrips.mockResolvedValue([localTrip]);
    db.loadTripById.mockResolvedValue(localTrip);
    db.saveTripPlan.mockResolvedValue(localTrip);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    initTripSync();
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
    });
  });
});
