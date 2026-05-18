/** 旅行规划核心类型 */

/** 比价/行动链接 */
export interface ActionLink {
  platform: string;
  url: string;
  label: string;
  /** 实时价格（来自 trvl 等数据源） */
  price?: number;
  /** 货币代码 */
  currency?: string;
  /** 数据来源 "trvl" | "template" */
  source?: string;
}

/** 地理坐标 */
export interface Location {
  longitude: number;
  latitude: number;
}

/** 景点信息 */
export interface Attraction {
  name: string;
  nameZh: string;
  nameEn: string;
  address: string;
  location: Location;
  visitDuration: number; // 分钟
  description: string;
  category: string;
  ticketPrice: number;
  reservationRequired: boolean;
  reservationTips: string;
  bookingUrl?: string;
  /** 该景点的可选游玩路线（大型景区适用，如西湖北线/西线/南线） */
  routes?: import("./route.js").AttractionRoute[];
  /** 当前选中的路线 ID */
  selectedRouteId?: string;
}

/** 餐饮 */
export interface Meal {
  type: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  description: string;
  estimatedCost: number;
}

/** 酒店 */
export interface Hotel {
  name: string;
  address: string;
  location?: Location;
  priceRange: string;
  rating: number;
  estimatedCost: number;
  comparisonLinks?: ActionLink[];
}

/** 单日行程 */
export interface DayPlan {
  date: string;
  dayIndex: number;
  city: string;
  isTransferDay: boolean;
  transferInfo: string;
  description: string;
  transportation: string;
  accommodation: string;
  hotel?: Hotel;
  attractions: Attraction[];
  meals: Meal[];
}

/** 天气信息 */
export interface WeatherInfo {
  date: string;
  city: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: number;
  nightTemp: number;
  windDirection: string;
  windPower: string;
}

/** 预算 */
export interface Budget {
  totalAttractions: number;
  totalHotels: number;
  totalMeals: number;
  totalTransportation: number;
  totalInterCityTransport: number;
  total: number;
}

/** 完整旅行计划 */
export interface TripPlan {
  city: string;
  cities: string[];
  startDate: string;
  endDate: string;
  days: DayPlan[];
  weatherInfo: WeatherInfo[];
  overallSuggestions: string;
  budget?: Budget;
  flightLinks?: ActionLink[];
}

/** 城市停留配置 */
export interface CityStay {
  city: string;
  days: number;
}

/** 旅行请求 */
export interface TripRequest {
  city: string;
  cities: CityStay[];
  startDate: string;
  endDate: string;
  travelDays: number;
  transportation: string;
  accommodation: string;
  preferences: string[];
  freeTextInput?: string;
  language?: string;
}

// ─── trvl CLI 数据类型 ────────────────────────────────────

/** trvl 航班搜索结果 */
export interface TrvlFlightSearchResult {
  success: boolean;
  count: number;
  trip_type: string;
  flights: TrvlFlightResult[];
  error?: string;
}

/** trvl 单条航班 */
export interface TrvlFlightResult {
  price: number;
  currency: string;
  duration: number;
  stops: number;
  provider?: string;
  booking_url?: string;
  legs: TrvlFlightLeg[];
}

/** trvl 航段 */
export interface TrvlFlightLeg {
  departure_airport: { code: string; name: string };
  arrival_airport: { code: string; name: string };
  departure_time: string;
  arrival_time: string;
  airline: string;
}

/** trvl 酒店搜索结果 */
export interface TrvlHotelSearchResult {
  success: boolean;
  count: number;
  hotels: TrvlHotelItem[];
  error?: string;
}

/** trvl 单条酒店 */
export interface TrvlHotelItem {
  name: string;
  hotel_id: string;
  rating: number;
  stars: number;
  price: number;
  currency: string;
  booking_url?: string;
  sources: TrvlPriceSource[];
}

/** trvl 多平台价格来源 */
export interface TrvlPriceSource {
  provider: string;
  price: number;
  currency: string;
  booking_url?: string;
}
