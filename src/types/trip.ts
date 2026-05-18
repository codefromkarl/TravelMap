/** 旅行规划核心类型 */

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
