/**
 * TravelAgent - AI Travel Planning Agent
 *
 * 基于 pi 框架的智能旅行规划 Agent
 */

export { type ModelTier, selectModelTier } from "./agent/model-selector.js";
export { buildUserPrompt, formatTravelers, shouldDigPreferences } from "./agent/prompt-builder.js";
export { TravelAgent } from "./agent/travel-agent.js";
export { searchAttractions } from "./services/attraction-service.js";
export { calculateBudget, checkBudgetOverrun } from "./services/budget-service.js";
export { registerToolMetadata, resetCostTracker, setCostTracker } from "./services/cost-tracker.js";
export { dualGeocode, isDomesticCity, resetEngineState } from "./services/dual-map-service.js";
export { clearSearchCache, searchAttractionsMultiSource } from "./services/multi-source-service.js";
export { applyPartialEdit, parseTargetDays } from "./services/partial-edit-service.js";
export type { PostProcessorConfig, PostProcessorResult } from "./services/post-processor.js";
export {
  calculateBudgetForTrip,
  enrichLinksForTrip,
  postProcessTripPlan,
} from "./services/post-processor.js";
export type {
  Restaurant,
  RestaurantSearchResult,
  SearchNearbyParams,
} from "./services/restaurant-service.js";
export {
  clearRestaurantCache,
  enrichDayMeals,
  searchNearbyRestaurants,
} from "./services/restaurant-service.js";
export {
  formatSearchResultsForAgent,
  injectSearchResults,
  isSearchValid,
  runParallelSearch,
} from "./services/search-orchestrator.js";
export type { SearchTransportParams } from "./services/transport-service.js";
export {
  clearTransportCache,
  enrichTransferDays,
  searchIntercityTransport,
} from "./services/transport-service.js";
export { searchWeather } from "./services/weather-service.js";
export {
  createCompanionTools,
  createPlanningTools,
  createSearchTools,
  createTools,
} from "./tools/index.js";
export type { DayPlan, TransportOption, TripPlan, TripRequest } from "./types/trip.js";
