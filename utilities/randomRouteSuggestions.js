const { Op } = require("sequelize");
const { runForAllTenants } = require("./runAllTenants");

const DEFAULT_ROUTE_COUNT = 6;
const MAX_ROUTES_PER_TENANT = 40;
const MAX_TRIPS_PER_TENANT = 250;
const DEFAULT_LOOKAHEAD_DAYS = 30;

function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function fetchRandomRouteSuggestions({
  Place,
  count = DEFAULT_ROUTE_COUNT,
  tripLookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
} = {}) {
  if (!Place) return [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  let dateCondition = { [Op.gte]: todayStr };
  if (Number.isFinite(tripLookaheadDays) && tripLookaheadDays > 0) {
    const future = new Date(today);
    future.setDate(future.getDate() + Math.floor(tripLookaheadDays));
    const futureStr = future.toISOString().slice(0, 10);
    dateCondition = { [Op.between]: [todayStr, futureStr] };
  }

  const tenantResults = await runForAllTenants(async ({ models }) => {
    const { Trip, RouteStop, Stop, Price } = models;

    if (!Trip || !RouteStop || !Stop || !Price) {
      return [];
    }

    const tripRows = await Trip.findAll({
      where: {
        isActive: true,
        date: dateCondition,
      },
      attributes: ["routeId"],
      order: [["date", "ASC"]],
      limit: MAX_TRIPS_PER_TENANT,
      raw: true,
    });

    if (!tripRows.length) {
      return [];
    }

    const routeIdSet = new Set();
    for (const row of tripRows) {
      const normalised = toFiniteNumber(row.routeId);
      if (normalised !== null) {
        routeIdSet.add(normalised);
      }
    }

    if (!routeIdSet.size) {
      return [];
    }

    const routeIds = Array.from(routeIdSet);
    shuffleInPlace(routeIds);
    const selectedRouteIds = routeIds.slice(0, MAX_ROUTES_PER_TENANT);

    const routeStops = await RouteStop.findAll({
      where: {
        routeId: { [Op.in]: selectedRouteIds },
      },
      attributes: ["routeId", "stopId", "order"],
      raw: true,
    });

    if (!routeStops.length) {
      return [];
    }

    const stopIdSet = new Set();
    for (const rs of routeStops) {
      const normalised = toFiniteNumber(rs.stopId);
      if (normalised !== null) {
        stopIdSet.add(normalised);
      }
    }

    if (!stopIdSet.size) {
      return [];
    }

    const stopIds = Array.from(stopIdSet);

    const stops = await Stop.findAll({
      where: {
        id: { [Op.in]: stopIds },
      },
      attributes: ["id", "placeId"],
      raw: true,
    });

    if (!stops.length) {
      return [];
    }

    const stopMap = new Map();
    for (const stop of stops) {
      const id = toFiniteNumber(stop.id);
      const placeId = toFiniteNumber(stop.placeId);
      if (id !== null && placeId !== null) {
        stopMap.set(id, placeId);
      }
    }

    if (!stopMap.size) {
      return [];
    }

    const priceRows = await Price.findAll({
      where: {
        fromStopId: { [Op.in]: stopIds },
        toStopId: { [Op.in]: stopIds },
        [Op.or]: [
          { webPrice: { [Op.not]: null } },
          { price1: { [Op.not]: null } },
        ],
      },
      attributes: ["fromStopId", "toStopId", "webPrice", "price1"],
      raw: true,
    });

    if (!priceRows.length) {
      return [];
    }

    const priceMap = new Map();
    for (const price of priceRows) {
      const fromStopId = toFiniteNumber(price.fromStopId);
      const toStopId = toFiniteNumber(price.toStopId);
      const candidates = [price.webPrice, price.price1]
        .map(toFiniteNumber)
        .filter((value) => value !== null && value > 0);
      if (fromStopId === null || toStopId === null || !candidates.length) {
        continue;
      }
      const key = `${fromStopId}-${toStopId}`;
      const bestCandidate = Math.min(...candidates);
      const existing = priceMap.get(key);
      if (!existing || bestCandidate < existing) {
        priceMap.set(key, bestCandidate);
      }
    }

    if (!priceMap.size) {
      return [];
    }

    const routeStopsByRoute = new Map();
    for (const rs of routeStops) {
      const routeId = toFiniteNumber(rs.routeId);
      const stopId = toFiniteNumber(rs.stopId);
      const order = toFiniteNumber(rs.order);
      if (routeId === null || stopId === null || order === null) {
        continue;
      }
      if (!routeStopsByRoute.has(routeId)) {
        routeStopsByRoute.set(routeId, []);
      }
      routeStopsByRoute.get(routeId).push({ stopId, order });
    }

    const combos = [];
    for (const stopsOfRoute of routeStopsByRoute.values()) {
      stopsOfRoute.sort((a, b) => a.order - b.order);
      for (let i = 0; i < stopsOfRoute.length; i += 1) {
        const fromEntry = stopsOfRoute[i];
        const fromPlaceId = stopMap.get(fromEntry.stopId);
        if (fromPlaceId === undefined) {
          continue;
        }
        for (let j = i + 1; j < stopsOfRoute.length; j += 1) {
          const toEntry = stopsOfRoute[j];
          const toPlaceId = stopMap.get(toEntry.stopId);
          if (toPlaceId === undefined || fromPlaceId === toPlaceId) {
            continue;
          }
          const priceKey = `${fromEntry.stopId}-${toEntry.stopId}`;
          const priceValue = priceMap.get(priceKey);
          if (!priceValue) {
            continue;
          }
          combos.push({
            fromPlaceId,
            toPlaceId,
            price: priceValue,
          });
        }
      }
    }

    return combos;
  });

  const combosAcrossTenants = [];
  for (const tenantResult of tenantResults) {
    if (Array.isArray(tenantResult.result)) {
      combosAcrossTenants.push(...tenantResult.result);
    }
  }

  if (!combosAcrossTenants.length) {
    return [];
  }

  const bestByRoute = new Map();
  for (const combo of combosAcrossTenants) {
    const key = `${combo.fromPlaceId}-${combo.toPlaceId}`;
    const existing = bestByRoute.get(key);
    if (!existing || combo.price < existing.price) {
      bestByRoute.set(key, combo);
    }
  }

  const uniqueCombos = Array.from(bestByRoute.values());
  if (!uniqueCombos.length) {
    return [];
  }

  shuffleInPlace(uniqueCombos);
  const selected = uniqueCombos.slice(0, Math.max(1, count));

  const placeIdSet = new Set();
  for (const combo of selected) {
    placeIdSet.add(combo.fromPlaceId);
    placeIdSet.add(combo.toPlaceId);
  }

  const placeIds = Array.from(placeIdSet);
  const places = await Place.findAll({
    where: {
      id: { [Op.in]: placeIds },
    },
    attributes: ["id", "title"],
    raw: true,
  });

  if (!places.length) {
    return [];
  }

  const placeMap = new Map();
  for (const place of places) {
    const id = toFiniteNumber(place.id);
    if (id !== null) {
      placeMap.set(id, place.title);
    }
  }

  const formatter = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  const suggestions = [];
  for (const combo of selected) {
    const fromTitle = placeMap.get(combo.fromPlaceId);
    const toTitle = placeMap.get(combo.toPlaceId);
    if (!fromTitle || !toTitle) {
      continue;
    }
    suggestions.push({
      fromTitle,
      toTitle,
      price: combo.price,
      formattedPrice: formatter.format(combo.price),
    });
  }

  return suggestions;
}

module.exports = { fetchRandomRouteSuggestions };
