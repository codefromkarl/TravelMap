/** 旅行规划核心类型 */

/** 预约时间轴（由 post-processor 计算） */
export interface ReservationTimeline {
  /** 需提前几天 */
  advanceDays: number;
  /** 放票时间 */
  releaseTime?: string;
  /** 预约开放日（自动计算：游玩日 - advanceDays） */
  bookingOpenDate: string;
  /** 紧急度 */
  urgency: "expired" | "urgent" | "normal";
  /** 官方预约链接 */
  officialUrl?: string;
  /** 备选渠道 */
  altChannels?: Array<{ platform: string; url: string }>;
}

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
  /** 预约时间轴（由 enrichReservationTimeline 填充） */
  reservationTimeline?: ReservationTimeline;
  /** 该景点的可选游玩路线（大型景区适用，如西湖北线/西线/南线） */
  routes?: import("./route.js").AttractionRoute[];
  /** 当前选中的路线 ID */
  selectedRouteId?: string;
}

/** 餐厅信息（来自 restaurant-service） */
export interface Restaurant {
  name: string;
  rating: number;
  averageCost: number;
  distance: number;
  walkMinutes: number;
  cuisine: string;
  address: string;
  location: Location;
  businessHours?: string;
  phone?: string;
  signature?: string;
  source: "amap" | "google" | "mock";
}

/** 餐饮 */
export interface Meal {
  type: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  description: string;
  estimatedCost: number;
  /** 关联的真实餐厅数据（由 restaurant-service 填充） */
  restaurant?: Restaurant;
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
  /** 数据来源 */
  source?: "amap" | "google" | "mock";
  /** 标签（如 "有电梯", "免费停车"） */
  tags?: string[];
  /** 距搜索中心距离（米） */
  distance?: number;
  /** 步行时间估算（分钟） */
  walkMinutes?: number;
  /** 公共交通可达 */
  transitAccessible?: boolean;
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

/** 出行人群画像 */
export interface TravelerProfile {
  /** 成人数量（18-59岁） */
  adults: number;
  /** 老人数量（≥60岁） */
  seniors: number;
  /** 儿童数量（3-12岁） */
  children: number;
  /** 婴幼儿数量（<3岁） */
  infants: number;
  /** 是否有孕妇 */
  pregnant: boolean;
  /** 是否有行动不便者（轮椅/拄拐/推婴儿车） */
  mobilityImpaired: boolean;
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
  /** 出行人群画像（用于路线风险评估和人群适配） */
  travelers?: TravelerProfile;
}

// ─── 城际交通方案 ────────────────────────────────────────

/** 城际交通方案 */
export interface TransportOption {
  /** 交通类型 */
  type: "train" | "flight" | "bus";
  /** 班次号（如 G7590, MU5123） */
  code: string;
  /** 出发时间 */
  departureTime: string;
  /** 到达时间 */
  arrivalTime: string;
  /** 历时（分钟） */
  durationMinutes: number;
  /** 价格（元） */
  price: number;
  /** 出发站/机场 */
  departureStation: string;
  /** 到达站/机场 */
  arrivalStation: string;
  /** 座位类型/舱位（如"二等座"/"经济舱"） */
  seatType?: string;
  /** 预订链接 */
  bookingUrl?: string;
  /** 数据来源 */
  source: "trvl" | "amap" | "mock";
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
