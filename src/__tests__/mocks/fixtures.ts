/**
 * 测试数据工厂 — 集中管理 mock 数据
 *
 * 快速开发期，API 结构可能频繁变动。
 * 将 mock 数据集中在此，变更时只改这一个文件。
 */

import type {
  ActionLink,
  Attraction,
  DayPlan,
  Hotel,
  Meal,
  TripPlan,
  TripRequest,
  WeatherInfo,
} from "../../types/trip.js";

// ─── 基础工厂 ──────────────────────────────────────────────

export function createMockActionLink(overrides?: Partial<ActionLink>): ActionLink {
  return {
    platform: "Booking.com",
    url: "https://www.booking.com/searchresults.html?ss=test",
    label: "测试比价链接",
    ...overrides,
  };
}

export function createMockLocation(overrides?: Partial<{ latitude: number; longitude: number }>) {
  return { latitude: 39.9163, longitude: 116.3972, ...overrides };
}

export function createMockAttraction(overrides?: Partial<Attraction>): Attraction {
  return {
    name: "测试景点",
    nameZh: "测试景点",
    nameEn: "Test Attraction",
    address: "测试城市测试路1号",
    location: createMockLocation(),
    visitDuration: 120,
    description: "一个用于测试的景点",
    category: "景点",
    ticketPrice: 50,
    reservationRequired: false,
    reservationTips: "",
    ...overrides,
  };
}

export function createMockMeal(overrides?: Partial<Meal>): Meal {
  return {
    type: "lunch",
    name: "测试餐厅",
    description: "测试美食",
    estimatedCost: 80,
    ...overrides,
  };
}

export function createMockHotel(overrides?: Partial<Hotel>): Hotel {
  return {
    name: "测试酒店",
    address: "测试城市中心路1号",
    priceRange: "300-500",
    rating: 4.5,
    estimatedCost: 400,
    ...overrides,
  };
}

export function createMockWeatherInfo(overrides?: Partial<WeatherInfo>): WeatherInfo {
  return {
    date: "2025-06-01",
    city: "北京",
    dayWeather: "晴",
    nightWeather: "晴",
    dayTemp: 28,
    nightTemp: 18,
    windDirection: "东南风",
    windPower: "3级",
    ...overrides,
  };
}

// ─── 聚合工厂 ──────────────────────────────────────────────

export function createMockDayPlan(overrides?: Partial<DayPlan>): DayPlan {
  return {
    date: "2025-06-01",
    dayIndex: 1,
    city: "北京",
    isTransferDay: false,
    transferInfo: "",
    description: "游览市区景点",
    transportation: "地铁",
    accommodation: "测试酒店",
    attractions: [createMockAttraction()],
    meals: [
      createMockMeal({ type: "breakfast" }),
      createMockMeal({ type: "lunch" }),
      createMockMeal({ type: "dinner" }),
    ],
    ...overrides,
  };
}

export function createMockTripPlan(overrides?: Partial<TripPlan>): TripPlan {
  return {
    city: "北京",
    cities: ["北京"],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    days: [createMockDayPlan()],
    weatherInfo: [createMockWeatherInfo()],
    overallSuggestions: "建议穿轻薄衣物",
    budget: {
      totalAttractions: 50,
      totalHotels: 800,
      totalMeals: 240,
      totalTransportation: 100,
      totalInterCityTransport: 0,
      total: 1190,
    },
    ...overrides,
  };
}

// ─── 请求工厂 ──────────────────────────────────────────────

export function createMockTripRequest(overrides?: Partial<TripRequest>): TripRequest {
  return {
    city: "北京",
    cities: [{ city: "北京", days: 3 }],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    travelDays: 3,
    transportation: "公共交通",
    accommodation: "经济型酒店",
    preferences: ["历史文化", "美食"],
    freeTextInput: "",
    ...overrides,
  };
}
