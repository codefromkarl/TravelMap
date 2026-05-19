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
  Restaurant,
  TransportOption,
  TravelerProfile,
  TripPlan,
  TripRequest,
  TrvlFlightSearchResult,
  TrvlHotelSearchResult,
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

export function createMockRestaurant(overrides?: Partial<Restaurant>): Restaurant {
  return {
    name: "外婆家(西湖店)",
    rating: 4.5,
    averageCost: 85,
    distance: 350,
    walkMinutes: 5,
    cuisine: "浙江菜",
    address: "杭州市西湖区龙井路1号",
    location: createMockLocation({ latitude: 30.275, longitude: 120.155 }),
    businessHours: "10:00-22:00",
    phone: "0571-88888001",
    source: "mock",
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

// ─── trvl mock 工厂 ────────────────────────────────────────

export function createMockTrvlFlightResult(
  overrides?: Partial<TrvlFlightSearchResult>,
): TrvlFlightSearchResult {
  return {
    success: true,
    count: 2,
    trip_type: "one_way",
    flights: [
      {
        price: 580,
        currency: "CNY",
        duration: 120,
        stops: 0,
        booking_url: "https://example.com/flight/CA1234",
        legs: [
          {
            departure_airport: { code: "PEK", name: "北京首都" },
            arrival_airport: { code: "SHA", name: "上海虹桥" },
            departure_time: "08:00",
            arrival_time: "10:00",
            airline: "中国国航",
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function createMockTrvlHotelResult(
  overrides?: Partial<TrvlHotelSearchResult>,
): TrvlHotelSearchResult {
  return {
    success: true,
    count: 3,
    hotels: [
      {
        name: "测试酒店",
        hotel_id: "htl_001",
        rating: 4.5,
        stars: 4,
        price: 398,
        currency: "CNY",
        booking_url: "https://example.com/hotel/test-hotel",
        sources: [
          {
            provider: "google_hotels",
            price: 398,
            currency: "CNY",
            booking_url: "https://example.com/hotel/google",
          },
          {
            provider: "trivago",
            price: 420,
            currency: "CNY",
            booking_url: "https://example.com/hotel/trivago",
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ─── 城际交通工厂 ──────────────────────────────────────────

export function createMockTransportOption(overrides?: Partial<TransportOption>): TransportOption {
  return {
    type: "train",
    code: "G7590",
    departureTime: "08:30",
    arrivalTime: "09:30",
    durationMinutes: 60,
    price: 73.5,
    departureStation: "杭州东站",
    arrivalStation: "上海虹桥站",
    seatType: "二等座",
    source: "amap",
    ...overrides,
  };
}

// ─── Scenario 工厂（常见业务场景预设）─────────────────────

/** 单城市旅行场景 */
export function createCityScenario(
  city: string,
  days: number,
  options?: {
    startDate?: string;
    attractions?: string[];
    travelers?: TravelerProfile;
  },
): {
  request: TripRequest;
  attractions: ReturnType<typeof createMockAttraction>[];
  weather: ReturnType<typeof createMockWeatherInfo>[];
  hotel: ReturnType<typeof createMockHotel>;
} {
  const startDate = options?.startDate ?? "2025-06-01";
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days - 1);

  const attractionNames = options?.attractions ?? ["热门景点", "文化古迹", "美食街"];
  const attractions = attractionNames.map((name, i) =>
    createMockAttraction({
      name,
      nameZh: name,
      location: createMockLocation({ latitude: 39.9 + i * 0.01, longitude: 116.4 + i * 0.01 }),
    }),
  );

  const weather = Array.from({ length: days }, (_, i) =>
    createMockWeatherInfo({
      date: new Date(startDate).toISOString().split("T")[0]!,
      city,
      dayWeather: ["晴", "多云", "阴"][i % 3]!,
      dayTemp: 25 + (i % 5),
    }),
  );

  const hotel = createMockHotel({ name: `${city}测试酒店`, address: `${city}市中心` });

  const request = createMockTripRequest({
    city,
    cities: [{ city, days }],
    startDate,
    endDate: endDate.toISOString().split("T")[0]!,
    travelDays: days,
    travelers: options?.travelers,
  });

  return { request, attractions, weather, hotel };
}

/** 多城市旅行场景 */
export function createMultiCityScenario(
  cities: Array<{ city: string; days: number }>,
  options?: { startDate?: string },
): {
  request: TripRequest;
  scenarios: ReturnType<typeof createCityScenario>[];
} {
  const startDate = options?.startDate ?? "2025-06-01";
  const currentDate = new Date(startDate);

  const scenarios = cities.map(({ city, days }) => {
    const scenario = createCityScenario(city, days, {
      startDate: currentDate.toISOString().split("T")[0]!,
    });
    currentDate.setDate(currentDate.getDate() + days);
    return scenario;
  });

  const request = createMockTripRequest({
    city: cities[0]!.city,
    cities,
    startDate,
    endDate: currentDate.toISOString().split("T")[0]!,
    travelDays: cities.reduce((sum, c) => sum + c.days, 0),
  });

  return { request, scenarios };
}
