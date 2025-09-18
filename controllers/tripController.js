var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../models/tripModel');
const RouteStop = require('../models/routeStopModel');
const Stop = require('../models/stopModel');
const Price = require('../models/priceModel');

const SECONDS_IN_DAY = 24 * 60 * 60;

const toTimestamp = (value, fallback = null) => {
    if (value == null) {
        return fallback;
    }

    const date = new Date(value);
    const time = date.getTime();

    return Number.isNaN(time) ? fallback : time;
};

const timeLikeToSeconds = (value) => {
    if (value == null) {
        return 0;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (!trimmed.length) {
            return 0;
        }

        const parts = trimmed.split(':').map(Number);

        if (parts.every((part) => Number.isFinite(part))) {
            const [hours = 0, minutes = 0, seconds = 0] = parts;
            return (hours * 3600) + (minutes * 60) + seconds;
        }

        const numeric = Number(trimmed);

        return Number.isFinite(numeric) ? numeric : 0;
    }

    if (value instanceof Date) {
        return (value.getHours() * 3600) + (value.getMinutes() * 60) + value.getSeconds();
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
        const stringified = value.toString();

        if (stringified && stringified !== '[object Object]') {
            return timeLikeToSeconds(stringified);
        }
    }

    return 0;
};

const secondsToHHMM = (seconds) => {
    if (!Number.isFinite(seconds)) {
        return null;
    }

    const normalized = ((Math.round(seconds) % SECONDS_IN_DAY) + SECONDS_IN_DAY) % SECONDS_IN_DAY;
    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDurationText = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return null;
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const parts = [];

    if (hours > 0) {
        parts.push(`${hours} saat`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} dakika`);
    }

    if (!parts.length || remainingSeconds > 0) {
        parts.push(`${remainingSeconds} saniye`);
    }

    return parts.join(' ');
};

const normaliseTimeString = (value) => {
    if (!value) {
        return '00:00:00';
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (trimmed.length === 5) {
            return `${trimmed}:00`;
        }

        return trimmed.length ? trimmed : '00:00:00';
    }

    if (value instanceof Date) {
        const hours = String(value.getHours()).padStart(2, '0');
        const minutes = String(value.getMinutes()).padStart(2, '0');
        const seconds = String(value.getSeconds()).padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
        const stringified = value.toString();

        if (stringified && stringified !== '[object Object]') {
            return normaliseTimeString(stringified);
        }
    }

    return '00:00:00';
};

const combineDateAndTime = (dateValue, timeValue) => {
    if (!dateValue) {
        return null;
    }

    let datePart;

    if (typeof dateValue === 'string') {
        datePart = dateValue;
    } else if (dateValue instanceof Date) {
        datePart = dateValue.toISOString().split('T')[0];
    } else if (typeof dateValue.toString === 'function') {
        datePart = dateValue.toString();
    }

    if (!datePart) {
        return null;
    }

    const timePart = normaliseTimeString(timeValue);
    const combined = new Date(`${datePart}T${timePart}`);

    return Number.isNaN(combined.getTime()) ? null : combined;
};

const isPriceValidForDate = (price, targetTime) => {
    if (targetTime == null) {
        return true;
    }

    const fromTime = toTimestamp(price.validFrom, null);

    if (fromTime != null && targetTime < fromTime) {
        return false;
    }

    const untilTime = toTimestamp(price.validUntil, null);

    if (untilTime != null && targetTime > untilTime) {
        return false;
    }

    return true;
};

const selectPriceForDate = (priceList, tripDateTime) => {
    if (!priceList || !priceList.length) {
        return null;
    }

    const targetTime = tripDateTime instanceof Date && !Number.isNaN(tripDateTime.getTime())
        ? tripDateTime.getTime()
        : null;

    const validPrices = targetTime != null
        ? priceList.filter((price) => isPriceValidForDate(price, targetTime))
        : priceList;

    const candidates = validPrices.length ? validPrices : priceList;

    return candidates
        .slice()
        .sort((a, b) => {
            const aFrom = toTimestamp(a.validFrom, Number.NEGATIVE_INFINITY);
            const bFrom = toTimestamp(b.validFrom, Number.NEGATIVE_INFINITY);

            if (aFrom === bFrom) {
                const aUntil = toTimestamp(a.validUntil, Number.POSITIVE_INFINITY);
                const bUntil = toTimestamp(b.validUntil, Number.POSITIVE_INFINITY);

                if (aUntil === bUntil) {
                    const aId = typeof a.id === 'number' ? a.id : 0;
                    const bId = typeof b.id === 'number' ? b.id : 0;

                    return bId - aId;
                }

                return aUntil - bUntil;
            }

            return bFrom - aFrom;
        })[0];
};

const extractPriceValue = (priceRecord) => {
    if (!priceRecord) {
        return null;
    }

    const priceFields = [
        'webPrice',
        'price1',
        'price2',
        'price3',
        'singleSeatWebPrice',
        'singleSeatPrice1',
        'singleSeatPrice2',
        'singleSeatPrice3'
    ];

    for (const field of priceFields) {
        if (priceRecord[field] != null) {
            const numericValue = Number(priceRecord[field]);

            if (Number.isFinite(numericValue)) {
                return numericValue;
            }
        }
    }

    return null;
};

const findBestStopPair = (routeStops, fromStopIds, toStopIds) => {
    if (!routeStops || !routeStops.length) {
        return null;
    }

    const fromCandidates = routeStops.filter((stop) => fromStopIds.has(stop.stopId));
    const toCandidates = routeStops.filter((stop) => toStopIds.has(stop.stopId));
    let bestPair = null;

    for (const fromStop of fromCandidates) {
        if (!Number.isFinite(fromStop.cumulativeSeconds)) {
            continue;
        }

        for (const toStop of toCandidates) {
            if (!Number.isFinite(toStop.cumulativeSeconds)) {
                continue;
            }

            if (toStop.order <= fromStop.order) {
                continue;
            }

            const travelSeconds = toStop.cumulativeSeconds - fromStop.cumulativeSeconds;

            if (travelSeconds <= 0) {
                continue;
            }

            if (!bestPair || travelSeconds < bestPair.travelSeconds ||
                (travelSeconds === bestPair.travelSeconds && toStop.order < bestPair.to.order)) {
                bestPair = {
                    from: fromStop,
                    to: toStop,
                    travelSeconds
                };
            }
        }
    }

    return bestPair;
};

exports.getTrips = async (req, res, next) => {
    try {
        // İstekten gelen kalkış, varış ve tarih bilgilerini alıyoruz.
        const fromId = req.params.route.split("-")[0]
        const toId = req.params.route.split("-")[1]
        const date = req.params.date

        // Eksik parametre varsa kullanıcıya haber verip işlemi sonlandırıyoruz.
        if (!fromId || !toId || !date) {
            res.status(400).json({ message: "Eksik bilgi gönderildi." })
            return; // eklemezsen alttaki query yine çalışır
        }
        // placeId değeri kalkış ya da varış olan tüm durakları veritabanından çekiyoruz.
        const stops = await Stop.findAll({
            where: {
                placeId: {
                    [Op.in]: [fromId, toId]
                }
            },
            attributes: ['id', 'placeId'],
            raw: true
        });

        // placeId -> stopId listesi ve stopId -> placeId eşleşmesi tutuyoruz.
        const stopIdsByPlace = new Map();
        const stopIdToPlace = new Map();

        for (const stop of stops) {
            const stopId = Number(stop.id);

            if (!Number.isFinite(stopId)) {
                continue;
            }

            const placeKey = String(stop.placeId);
            const stopKey = String(stopId);

            if (!stopIdsByPlace.has(placeKey)) {
                stopIdsByPlace.set(placeKey, []);
            }

            stopIdsByPlace.get(placeKey).push(stopId);
            stopIdToPlace.set(stopKey, placeKey);
        }

        const fromPlaceKey = String(fromId);
        const toPlaceKey = String(toId);

        const fromPlaceStopIds = stopIdsByPlace.get(fromPlaceKey);
        const toPlaceStopIds = stopIdsByPlace.get(toPlaceKey);

        // Kalkış ya da varış için hiç durak bulunamazsa boş liste dönüyoruz.
        if (!fromPlaceStopIds || !fromPlaceStopIds.length || !toPlaceStopIds || !toPlaceStopIds.length) {
            res.json([]);
            return;
        }

        // RouteStop aramasında kullanacağımız tüm stopId'leri tek listede topluyoruz.
        const allStopIds = Array.from(new Set([...fromPlaceStopIds, ...toPlaceStopIds]));

        // Seçilen duraklara bağlı route-stop kayıtlarını çekiyoruz.
        const routeStops = await RouteStop.findAll({
            where: {
                stopId: {
                    [Op.in]: allStopIds
                }
            },
            attributes: ['routeId', 'stopId', ['order', 'stopOrder'], 'duration'],
            raw: true,
            order: [
                ['routeId', 'ASC'],
                ['order', 'ASC']
            ]
        });

        // Hiç eşleşen route-stop yoksa sefer bulunamamıştır.
        if (!routeStops.length) {
            res.json([]);
            return;
        }

        // Her bir route'un hangi place'lere hizmet verdiğini takip eden bir map oluşturuyoruz.
        const routesWithPlaces = new Map();
        const routeStopsByRoute = new Map();

        for (const routeStop of routeStops) {
            const routeKey = String(routeStop.routeId);
            const stopKey = String(routeStop.stopId);
            const placeKey = stopIdToPlace.get(stopKey);

            if (!placeKey) {
                continue;
            }

            if (!routesWithPlaces.has(routeKey)) {
                routesWithPlaces.set(routeKey, {
                    routeId: routeStop.routeId,
                    placeIds: new Set()
                });
            }

            routesWithPlaces.get(routeKey).placeIds.add(placeKey);

            const stopId = Number(routeStop.stopId);
            const orderValueRaw = routeStop.stopOrder != null ? routeStop.stopOrder : routeStop.order;
            const stopOrder = Number(orderValueRaw);

            if (!Number.isFinite(stopId) || !Number.isFinite(stopOrder)) {
                continue;
            }

            if (!routeStopsByRoute.has(routeKey)) {
                routeStopsByRoute.set(routeKey, []);
            }

            routeStopsByRoute.get(routeKey).push({
                stopId,
                order: stopOrder,
                cumulativeSeconds: timeLikeToSeconds(routeStop.duration)
            });
        }

        for (const stopsOfRoute of routeStopsByRoute.values()) {
            stopsOfRoute.sort((a, b) => a.order - b.order);
        }

        // Hem kalkış hem de varış place'lerini içeren routeId listesini çıkarıyoruz.
        const matchingRouteIds = Array.from(routesWithPlaces.values())
            .filter(({ placeIds }) => placeIds.has(fromPlaceKey) && placeIds.has(toPlaceKey))
            .map(({ routeId }) => routeId);

        // Uygun route yoksa yine boş liste döndürüyoruz.
        if (!matchingRouteIds.length) {
            res.json([]);
            return;
        }

        // Uygun route'lara sahip ve ilgili tarihteki trip kayıtlarını alıyoruz.
        const trips = await Trip.findAll({
            where: {
                routeId: {
                    [Op.in]: matchingRouteIds
                },
                date: {
                    [Op.eq]: date
                }
            }
        });

        const fromStopIdSet = new Set(fromPlaceStopIds);
        const toStopIdSet = new Set(toPlaceStopIds);
        const tripPriceContext = [];

        for (const trip of trips) {
            trip.setDataValue('departureTimeAtStop', null);
            trip.setDataValue('travelDurationFromStopSeconds', null);
            trip.setDataValue('travelDurationFromStopText', null);
            trip.setDataValue('travelDurationFromStopHHMM', null);
            trip.setDataValue('segmentPrice', null);

            const stopsForRoute = routeStopsByRoute.get(String(trip.routeId));

            if (!stopsForRoute || !stopsForRoute.length) {
                continue;
            }

            const stopPair = findBestStopPair(stopsForRoute, fromStopIdSet, toStopIdSet);

            if (!stopPair) {
                continue;
            }

            const baseSeconds = timeLikeToSeconds(trip.time);
            const departureSeconds = baseSeconds + stopPair.from.cumulativeSeconds;
            const travelSeconds = stopPair.travelSeconds;

            trip.setDataValue('departureTimeAtStop', secondsToHHMM(departureSeconds));
            trip.setDataValue('travelDurationFromStopSeconds', travelSeconds);
            trip.setDataValue('travelDurationFromStopText', formatDurationText(travelSeconds));
            trip.setDataValue('travelDurationFromStopHHMM', secondsToHHMM(travelSeconds));

            const tripDateTime = combineDateAndTime(trip.date, trip.time);

            tripPriceContext.push({
                trip,
                fromStopId: stopPair.from.stopId,
                toStopId: stopPair.to.stopId,
                tripDateTime
            });
        }

        if (tripPriceContext.length) {
            const uniquePairs = Array.from(
                new Set(tripPriceContext.map(({ fromStopId, toStopId }) => `${fromStopId}-${toStopId}`))
            );

            if (uniquePairs.length) {
                const priceConditions = uniquePairs.map((key) => {
                    const [fromStopId, toStopId] = key.split('-').map((value) => Number(value));

                    return { fromStopId, toStopId };
                });

                const priceRecords = await Price.findAll({
                    where: {
                        [Op.or]: priceConditions
                    },
                    raw: true
                });

                const priceMap = new Map();

                for (const price of priceRecords) {
                    const key = `${price.fromStopId}-${price.toStopId}`;

                    if (!priceMap.has(key)) {
                        priceMap.set(key, []);
                    }

                    priceMap.get(key).push(price);
                }

                for (const context of tripPriceContext) {
                    const key = `${context.fromStopId}-${context.toStopId}`;
                    const priceList = priceMap.get(key);

                    if (!priceList || !priceList.length) {
                        continue;
                    }

                    const selectedPrice = selectPriceForDate(priceList, context.tripDateTime);
                    const priceValue = extractPriceValue(selectedPrice);

                    if (priceValue != null) {
                        context.trip.setDataValue('segmentPrice', priceValue);
                    }
                }
            }
        }

        // Sonuç olarak sadece tripId listesini döndürüyoruz.
        res.render("trips", { trips })

    } catch (err) {
        console.error('Trip search error:', err);
        res.status(500).json({ message: err.message });
    }
};