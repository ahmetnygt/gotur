const { Op } = require("sequelize");
const { runForAllTenants } = require("../utilities/runAllTenants");
const { getTenantConnection } = require("../utilities/tenantDb");
const {
    COUNTRY_OPTIONS,
    COUNTRY_CODE_SET,
} = require("../utilities/countryOptions");
const sendEmail = require("../utilities/sendMail");

const BUS_FEATURE_MAPPINGS = [
    { key: "hasPowerOutlet", icon: "/svg/plug_icon.svg", label: "Priz" },
    { key: "hasSeatScreen", icon: "/svg/hd_icon.svg", label: "Ekran" },
    { key: "hasCatering", icon: "/svg/cup_icon.svg", label: "İkram" },
    { key: "hasWifi", icon: "/svg/wifi_icon.svg", label: "Wi-Fi" },
    { key: "hasSeatPillow", icon: "/svg/pillow_icon.svg", label: "Yastık" },
    { key: "hasUsbPort", icon: "/svg/usb_icon.svg", label: "USB Girişi" },
    { key: "hasFridge", icon: "/svg/fridge_icon.svg", label: "Buzdolabı" },
    { key: "hasComfortableSeat", icon: "/svg/sofa_icon.svg", label: "Konforlu Koltuk", },
];

const MINUTES_IN_DAY = 24 * 60;

function normaliseMinutes(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const minutes = ((value % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    return minutes;
}

function parseTimeStringToMinutes(timeString) {
    if (!timeString) {
        return null;
    }

    const parts = String(timeString)
        .split(":")
        .map((part) => Number(part));

    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
    }

    const hours = parts[0];
    const minutes = parts[1];
    const seconds = Number.isFinite(parts[2]) ? parts[2] : 0;

    return hours * 60 + minutes + Math.floor(seconds / 60);
}

function minutesToClockString(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) {
        return null;
    }

    const minutes = normaliseMinutes(totalMinutes);
    if (minutes === null) {
        return null;
    }

    const hoursPart = Math.floor(minutes / 60);
    const minutesPart = minutes % 60;

    return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

function addMinutesToTimeString(baseTime, offsetMinutes) {
    const baseMinutes = parseTimeStringToMinutes(baseTime);
    if (baseMinutes === null || !Number.isFinite(offsetMinutes)) {
        return null;
    }

    return minutesToClockString(baseMinutes + offsetMinutes);
}

function parseDurationStringToMinutes(durationString) {
    if (!durationString) {
        return 0;
    }

    const parts = String(durationString)
        .split(":")
        .map((part) => Number(part));

    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return 0;
    }

    const hours = parts[0];
    const minutes = parts[1];
    const seconds = Number.isFinite(parts[2]) ? parts[2] : 0;

    return hours * 60 + minutes + Math.floor(seconds / 60);
}

function formatDurationFromMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        return "";
    }

    const roundedMinutes = Math.round(totalMinutes);
    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;

    const parts = [];
    if (hours > 0) {
        parts.push(`${hours} saat`);
    }
    if (minutes > 0) {
        parts.push(`${minutes} dakika`);
    }

    return parts.join(" ");
}

async function generatePNR(models, fromId, toId, stops) {
    const from = stops.find(s => s.id == fromId)?.title;
    const to = stops.find(s => s.id == toId)?.title;
    const turkishMap = { "Ç": "C", "Ş": "S", "İ": "I", "Ğ": "G", "Ü": "U", "Ö": "O", "ç": "C", "ş": "S", "ı": "I", "ğ": "G", "ü": "U", "ö": "O" };

    const clean = str => str
        .split('')
        .map(c => turkishMap[c] || c)
        .join('')
        .toUpperCase()
        .substring(0, 2);

    const fromCode = clean(from);
    const toCode = clean(to);

    let pnr;
    let exists = true;

    while (exists) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 karakter
        pnr = `${fromCode}${toCode}${rand}`;
        exists = await models.Ticket.findOne({ where: { pnr } }); // Sequelize'de sorgu
    }

    return pnr;
};

async function fetchTripsForRouteDate(req, { fromId, toId, date }) {
    if (!fromId || !toId || !date) {
        return { fromId, toId, date, trips: [] };
    }

    await ensureTenantsReady(req);

    const results = await runForAllTenants(async ({ firmKey, models }) => {
            const {
                Trip,
                RouteStop,
                Stop,
                Route,
                Price,
                BusModel,
                Ticket,
                Bus,
                TripStopTime,
            } = models;

            // 1) İlgili duraklar
            const stops = await Stop.findAll({
                where: { placeId: { [Op.in]: [fromId, toId] } },
                raw: true,
            });

            if (!stops.length) return [];

            const stopIdsByPlace = new Map();
            const stopIdToPlace = new Map();

            for (const stop of stops) {
                const placeKey = String(stop.placeId);
                const stopKey = String(stop.id);
                if (!stopIdsByPlace.has(placeKey)) stopIdsByPlace.set(placeKey, []);
                stopIdsByPlace.get(placeKey).push(stop.id);
                stopIdToPlace.set(stopKey, placeKey);
            }

            const fromPlaceStopIds = stopIdsByPlace.get(String(fromId));
            const toPlaceStopIds = stopIdsByPlace.get(String(toId));
            if (!fromPlaceStopIds?.length || !toPlaceStopIds?.length) return [];

            // 2) routeStop'lar
            const allStopIds = Array.from(
                new Set([...fromPlaceStopIds, ...toPlaceStopIds])
            );
            const routeStops = await RouteStop.findAll({
                where: { stopId: { [Op.in]: allStopIds } },
                raw: true,
            });
            if (!routeStops.length) return [];

            // 3) Route filtreleme
            const routesWithPlaces = new Map();
            for (const routeStop of routeStops) {
                const routeKey = String(routeStop.routeId);
                const stopKey = String(routeStop.stopId);
                const placeKey = stopIdToPlace.get(stopKey);
                if (!placeKey) continue;

                if (!routesWithPlaces.has(routeKey)) {
                    routesWithPlaces.set(routeKey, {
                        routeId: routeStop.routeId,
                        placeIds: new Set(),
                    });
                }
                routesWithPlaces.get(routeKey).placeIds.add(placeKey);
            }

            const matchingRouteIds = Array.from(routesWithPlaces.values())
                .filter(
                    ({ placeIds }) =>
                        placeIds.has(String(fromId)) && placeIds.has(String(toId))
                )
                .map(({ routeId }) => routeId);

            if (!matchingRouteIds.length) return [];

            // 4) Trip'ler
            const trips = await Trip.findAll({
                where: {
                    routeId: { [Op.in]: matchingRouteIds },
                    date: { [Op.eq]: date },
                },
            });
            if (!trips.length) return [];

            const busIds = trips
                .map((trip) => trip.busId)
                .filter((busId) => busId !== null && busId !== undefined);

            const buses = busIds.length
                ? await Bus.findAll({
                    where: { id: { [Op.in]: [...new Set(busIds)] } },
                    raw: true,
                })
                : [];

            const busMap = new Map(
                buses.map((bus) => [String(bus.id), bus])
            );

            const routesOfTrips = await Route.findAll({
                where: { id: { [Op.in]: [...new Set(trips.map((t) => t.routeId))] } },
            });
            const routeStopsOfTrips = await RouteStop.findAll({
                where: {
                    routeId: { [Op.in]: [...new Set(routesOfTrips.map((r) => r.id))] },
                },
                raw: true,
            });

            const routeStopStopIds = routeStopsOfTrips.map((rs) => rs.stopId);
            const additionalStops = routeStopStopIds.length
                ? await Stop.findAll({
                    where: { id: { [Op.in]: [...new Set(routeStopStopIds)] } },
                    raw: true,
                })
                : [];

            const stopRecordMap = new Map();
            for (const stop of additionalStops) {
                stopRecordMap.set(String(stop.id), stop);
            }
            for (const stop of stops) {
                const stopKey = String(stop.id);
                if (!stopRecordMap.has(stopKey)) {
                    stopRecordMap.set(stopKey, stop);
                }
            }

            const tripStopTimes = trips.length
                ? await TripStopTime.findAll({
                    where: {
                        tripId: { [Op.in]: trips.map((trip) => trip.id) },
                    },
                    raw: true,
                })
                : [];

            const tripStopTimesByTripId = new Map();
            for (const entry of tripStopTimes) {
                const tripKey = String(entry.tripId);
                if (!tripStopTimesByTripId.has(tripKey)) {
                    tripStopTimesByTripId.set(tripKey, new Map());
                }
                tripStopTimesByTripId
                    .get(tripKey)
                    .set(String(entry.routeStopId), entry);
            }

            // 5) Trip detaylarını hesapla
            for (let i = 0; i < trips.length; i++) {
                const trip = trips[i];
                const fromStop = stops.find((s) => s.placeId == fromId);
                const toStop = stops.find((s) => s.placeId == toId);

                if (!fromStop || !toStop) {
                    continue;
                }

                const baseTripTime = trip.time || "00:00:00";
                const routeStopsForTrip = routeStopsOfTrips
                    .filter((rs) => rs.routeId == trip.routeId)
                    .sort(
                        (a, b) => Number(a.order || 0) - Number(b.order || 0)
                    );

                const routeStopOrderMap = new Map();
                for (const routeStop of routeStopsForTrip) {
                    const orderValue = Number(routeStop.order);
                    if (Number.isFinite(orderValue)) {
                        routeStopOrderMap.set(String(routeStop.id), orderValue);
                    }
                }

                const fromRouteStop = routeStopsForTrip.find(
                    (rs) => rs.stopId == fromStop.id
                );
                const toRouteStop = routeStopsForTrip.find(
                    (rs) => rs.stopId == toStop.id
                );

                if (!fromRouteStop || !toRouteStop) {
                    continue;
                }

                const fallbackOffsets = new Map();
                let cumulativeMinutes = 0;
                routeStopsForTrip.forEach((routeStop, index) => {
                    if (index > 0) {
                        cumulativeMinutes += parseDurationStringToMinutes(
                            routeStop.duration
                        );
                    }

                    fallbackOffsets.set(
                        String(routeStop.id),
                        cumulativeMinutes
                    );
                });

                const tripStopTimeMap =
                    tripStopTimesByTripId.get(String(trip.id)) || null;

                const effectiveOffsets = new Map();
                let carriedDelay = 0;

                for (const routeStop of routeStopsForTrip) {
                    const key = String(routeStop.id);
                    const fallbackOffset = fallbackOffsets.has(key)
                        ? Number(fallbackOffsets.get(key))
                        : null;

                    let offsetToUse = null;

                    if (tripStopTimeMap && tripStopTimeMap.has(key)) {
                        const entry = tripStopTimeMap.get(key);
                        const numericOffset = Number(entry.offsetMinutes);

                        if (Number.isFinite(numericOffset)) {
                            offsetToUse = numericOffset;

                            if (Number.isFinite(fallbackOffset)) {
                                carriedDelay = numericOffset - fallbackOffset;
                            } else {
                                carriedDelay = 0;
                            }
                        }
                    }

                    if (offsetToUse === null && Number.isFinite(fallbackOffset)) {
                        offsetToUse = fallbackOffset + carriedDelay;
                    }

                    if (Number.isFinite(offsetToUse)) {
                        effectiveOffsets.set(key, offsetToUse);
                    }
                }

                const resolveOffsetMinutes = (routeStopId) => {
                    const key = String(routeStopId);

                    if (effectiveOffsets.has(key)) {
                        return effectiveOffsets.get(key);
                    }

                    return null;
                };

                const fromOffsetMinutes = resolveOffsetMinutes(fromRouteStop.id);
                const toOffsetMinutes = resolveOffsetMinutes(toRouteStop.id);

                const computedDeparture =
                    fromOffsetMinutes !== null
                        ? addMinutesToTimeString(baseTripTime, fromOffsetMinutes)
                        : null;

                if (computedDeparture) {
                    trip.time = computedDeparture;
                } else {
                    const fallbackTime = minutesToClockString(
                        parseTimeStringToMinutes(baseTripTime)
                    );
                    if (fallbackTime) {
                        trip.time = fallbackTime;
                    }
                }

                if (fromOffsetMinutes !== null && toOffsetMinutes !== null) {
                    const diffMinutes = toOffsetMinutes - fromOffsetMinutes;
                    trip.duration = formatDurationFromMinutes(
                        Math.max(0, diffMinutes)
                    );
                } else {
                    trip.duration = "";
                }

                const fromOrderValue = Number(fromRouteStop.order);
                const toOrderValue = Number(toRouteStop.order);
                const lowerOrder = Math.min(fromOrderValue, toOrderValue);
                const upperOrder = Math.max(fromOrderValue, toOrderValue);
                const hasValidRequestOrders =
                    Number.isFinite(lowerOrder) && Number.isFinite(upperOrder);

                const relevantRouteStops = routeStopsForTrip.filter((routeStop) => {
                    const orderValue = Number(routeStop.order);
                    if (
                        Number.isFinite(fromOrderValue) &&
                        Number.isFinite(toOrderValue)
                    ) {
                        return (
                            orderValue >= lowerOrder && orderValue <= upperOrder
                        );
                    }
                    if (Number.isFinite(fromOrderValue)) {
                        return orderValue >= fromOrderValue;
                    }
                    if (Number.isFinite(toOrderValue)) {
                        return orderValue <= toOrderValue;
                    }
                    return true;
                });

                const timeline = relevantRouteStops
                    .map((routeStop) => {
                        const stopRecord = stopRecordMap.get(
                            String(routeStop.stopId)
                        );
                        if (!stopRecord) {
                            return null;
                        }

                        const offsetMinutes = resolveOffsetMinutes(routeStop.id);
                        if (offsetMinutes === null) {
                            return null;
                        }

                        const timeText = addMinutesToTimeString(
                            baseTripTime,
                            offsetMinutes
                        );

                        if (!timeText) {
                            return null;
                        }

                        console.log({ title: stopRecord.title, time: timeText })

                        return {
                            title: stopRecord.title,
                            time: timeText,
                        };
                    })
                    .filter(Boolean);

                trip.routeTimeline = timeline;

                const price = await Price.findOne({
                    where: {
                        fromStopId: fromStop.id,
                        toStopId: toStop.id,
                    },
                });

                const busModel = await BusModel.findOne({
                    where: { id: trip.busModelId },
                });

                const busKey =
                    trip.busId !== null && trip.busId !== undefined
                        ? String(trip.busId)
                        : null;
                const busRecord = busKey ? busMap.get(busKey) : undefined;
                const busFeatures = [];

                if (busRecord) {
                    for (const feature of BUS_FEATURE_MAPPINGS) {
                        if (busRecord[feature.key]) {
                            busFeatures.push({
                                key: feature.key,
                                icon: feature.icon,
                                label: feature.label,
                            });
                        }
                    }
                }

                const tickets = await Ticket.findAll({
                    where: {
                        tripId: trip.id,
                        status: { [Op.notIn]: ["refund", "canceled"] },
                    },
                    order: [["seatNo", "ASC"]],
                });

                const seatBlockingTickets = hasValidRequestOrders
                    ? tickets.filter((ticket) => {
                          const ticketFromOrder = routeStopOrderMap.get(
                              String(ticket.fromRouteStopId)
                          );
                          const ticketToOrder = routeStopOrderMap.get(
                              String(ticket.toRouteStopId)
                          );

                          if (
                              !Number.isFinite(ticketFromOrder) ||
                              !Number.isFinite(ticketToOrder)
                          ) {
                              return true;
                          }

                          const ticketLower = Math.min(
                              ticketFromOrder,
                              ticketToOrder
                          );
                          const ticketUpper = Math.max(
                              ticketFromOrder,
                              ticketToOrder
                          );

                          if (
                              ticketUpper <= lowerOrder ||
                              upperOrder <= ticketLower
                          ) {
                              return false;
                          }

                          return true;
                      })
                    : tickets;

                let newTickets = [];
                for (const t of seatBlockingTickets) newTickets[t.seatNo] = t;

                if (typeof trip.duration === "string") {
                    if (trip.duration.includes(":")) {
                        const [h = 0, m = 0] = trip.duration
                            .split(":")
                            .map((value) => Number(value));
                        let result = "";
                        if (h > 0) result += `${h} saat `;
                        if (m > 0) result += `${m} dakika`;

                        trip.duration = result.trim();
                    } else {
                        trip.duration = trip.duration.trim();
                    }
                } else {
                    trip.duration = "";
                }
                trip.fromStr = fromStop.title;
                trip.toStr = toStop.title;
                trip.fromStopId = fromStop.id;
                trip.toStopId = toStop.id;
                trip.price = price ? price.webPrice : 0;

                if (busModel) {
                    trip.fullness =
                        seatBlockingTickets.length +
                        "/" +
                        busModel.maxPassenger;
                    trip.busPlanBinary = busModel.planBinary;
                    trip.busPlan = JSON.parse(busModel.plan);
                } else {
                    trip.fullness = seatBlockingTickets.length.toString();
                    trip.busPlanBinary = "";
                    trip.busPlan = [];
                }

                trip.tickets = newTickets;
                trip.busFeatures = busFeatures;
                trip.routeDescription = routesOfTrips.find(r => r.id == trip.routeId)?.description

                // hangi firmadan geldiğini belirt
                trip.firm = firmKey;
            }
            return trips;
        });

    const mergedTrips = results.flatMap((r) => r.result || []);

    if (mergedTrips.length && req?.commonModels?.Firm) {
        const firmKeys = Array.from(
            new Set(
                mergedTrips
                    .map((trip) => (trip?.firm ? String(trip.firm) : null))
                    .filter(Boolean)
            )
        );

        if (firmKeys.length) {
            try {
                const firms = await req.commonModels.Firm.findAll({
                    where: { key: { [Op.in]: firmKeys } },
                    attributes: ["key", "displayName"],
                    raw: true,
                });

                const firmNameMap = new Map(
                    firms.map((firm) => [String(firm.key), firm.displayName])
                );

                mergedTrips.forEach((trip) => {
                    const displayName = firmNameMap.get(String(trip.firm));
                    if (displayName) {
                        trip.firmName = displayName;
                    }
                });
            } catch (error) {
                console.error("Firma isimleri alınırken hata oluştu:", error);
            }
        }
    }

    return { fromId, toId, date, trips: mergedTrips };
}

exports.fetchTripsForRouteDate = fetchTripsForRouteDate;

exports.searchAllTrips = async (req, res) => {
    try {
        const [fromId, toId] = (req.params.route || "").split("-");
        const date = req.params.date;

        if (!fromId || !toId || !date) {
            return res
                .status(400)
                .json({ message: "Eksik parametre: /trips/:fromId-:toId/:date" });
        }

        const { trips } = await fetchTripsForRouteDate(req, { fromId, toId, date });

        const wantsJson =
            String(req.query?.format || "").toLowerCase() === "json" ||
            (typeof req.headers?.accept === "string" &&
                req.headers.accept.includes("application/json"));

        if (wantsJson) {
            return res.json({
                count: trips.length,
                trips,
                meta: {
                    fromId,
                    toId,
                    date,
                },
            });
        }

        const places = await req.commonModels.Place.findAll({
            where: { id: { [Op.in]: [fromId, toId] } },
        });

        const placeMap = new Map(places.map((place) => [String(place.id), place]));
        const fromPlaceTitle = placeMap.get(String(fromId))?.title || "";
        const toPlaceTitle = placeMap.get(String(toId))?.title || "";

        const title = `Götür | ${fromPlaceTitle}-${toPlaceTitle}`;
        res.render("trips", { trips, fromId, toId, date, title });
    } catch (err) {
        console.error("searchAllTrips hata:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.createTicketPayment = async (req, res) => {
    try {
        await ensureTenantsReady(req);

        const {
            tripId,
            fromStopId,
            toStopId,
            seatNumbers,
            genders,
            firmKey,
        } = req.body || {};

        if (!tripId || !fromStopId || !toStopId || !firmKey) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Eksik veri gönderildi.",
                });
        }

        const seatArray = Array.isArray(seatNumbers)
            ? seatNumbers
            : [];
        const genderArray = Array.isArray(genders) ? genders : [];

        if (!seatArray.length || seatArray.length !== genderArray.length) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Koltuk ve cinsiyet bilgileri hatalı.",
                });
        }

        const normalisedSeats = [];
        const normalisedGenders = [];
        const seenSeats = new Set();

        for (let i = 0; i < seatArray.length; i++) {
            const seat = String(seatArray[i]).trim();
            const gender = String(genderArray[i]).trim().toLowerCase();

            if (!seat) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Geçersiz koltuk numarası.",
                    });
            }

            if (gender !== "m" && gender !== "f") {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Geçersiz cinsiyet seçimi.",
                    });
            }

            if (seenSeats.has(seat)) {
                continue;
            }

            seenSeats.add(seat);
            normalisedSeats.push(seat);
            normalisedGenders.push(gender);
        }

        if (!normalisedSeats.length) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "En az bir koltuk seçmelisiniz.",
                });
        }

        const numericTripId = Number(tripId);
        const numericFromStopId = Number(fromStopId);
        const numericToStopId = Number(toStopId);

        if (
            !Number.isFinite(numericTripId) ||
            !Number.isFinite(numericFromStopId) ||
            !Number.isFinite(numericToStopId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Geçersiz sefer bilgileri gönderildi.",
            });
        }

        const numericSeatNumbers = normalisedSeats.map((seat) => {
            const numeric = Number(seat);
            if (!Number.isFinite(numeric)) {
                throw Object.assign(new Error(`Geçersiz koltuk numarası: ${seat}`), {
                    isUserError: true,
                    statusCode: 400,
                });
            }
            return numeric;
        });

        const { models, sequelize } = await getTenantConnection(firmKey);
        const { Ticket,TicketGroup } = models;
        const transaction = await sequelize.transaction();

        let ticketPayment = null;

        try {
            const existingTickets = await Ticket.findAll({
                where: {
                    tripId: numericTripId,
                    seatNo: { [Op.in]: numericSeatNumbers },
                    status: { [Op.notIn]: ["refund", "canceled"] },
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (existingTickets.length) {
                throw Object.assign(
                    new Error(
                        "Seçilen koltuklardan biri veya birkaçı artık uygun değil."
                    ),
                    {
                        isUserError: true,
                        statusCode: 409,
                    }
                );
            }

            ticketPayment = await models.TicketPayment.create(
                {
                    tripId: numericTripId,
                    fromStopId: numericFromStopId,
                    toStopId: numericToStopId,
                    seatNumbers: normalisedSeats,
                    genders: normalisedGenders,
                },
                { transaction }
            );

            const ticketGroup = await models.TicketGroup.create(
                {
                    tripId: numericTripId,
                },
                { transaction }
            );

            const pendingPnr = buildPendingPnr(ticketPayment.id);

            const pendingTickets = numericSeatNumbers.map((seatNumber, index) => ({
                tripId: numericTripId,
                ticketGroupId: ticketGroup.id,
                seatNo: seatNumber,
                price: 0,
                status: "pending",
                idNumber: null,
                name: null,
                surname: null,
                phoneNumber: null,
                gender: normalisedGenders[index],
                nationality: "TR",
                customerType: null,
                customerCategory: null,
                fromRouteStopId: numericFromStopId,
                toRouteStopId: numericToStopId,
                pnr: pendingPnr,
                payment: null,
            }));

            if (pendingTickets.length) {
                await Ticket.bulkCreate(pendingTickets, { transaction });
            }

            await transaction.commit();
        } catch (innerError) {
            await transaction.rollback();
            throw innerError;
        }

        if (!req.session.ticketPaymentTenants) {
            req.session.ticketPaymentTenants = {};
        }
        req.session.ticketPaymentTenants[String(ticketPayment.id)] = firmKey;

        res.json({ success: true, ticketPaymentId: ticketPayment.id });
    } catch (error) {
        console.error("createTicketPayment hata:", error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            message:
                error && error.isUserError
                    ? error.message
                    : "Ödeme kaydı oluşturulamadı.",
        });
    }
};

exports.renderPaymentPage = async (req, res) => {
    const { ticketPaymentId } = req.params;

    try {
        const context = await resolveTicketPaymentContext(req, ticketPaymentId);

        if (!context) {
            return res.status(404).render("payment", {
                title: "Ödeme",
                ticketPaymentId: String(ticketPaymentId || ""),
                seatDetails: [],
                passengerInputs: [],
                error: "Ödeme isteği bulunamadı.",
                countryOptions: COUNTRY_OPTIONS,
                contactPhone: "",
                contactEmail: "",
                firmKey: "",
            });
        }

        const { firmKey, ticketPayment, models } = context;

        if (ticketPayment.isSuccess) {
            return res.redirect(`/payment/${ticketPaymentId}/success`);
        }

        const viewData = await buildPaymentViewData(models, ticketPayment);

        res.render("payment", {
            title: "Ödeme",
            ticketPaymentId: String(ticketPaymentId),
            seatDetails: viewData.seatDetails,
            trip: viewData.trip,
            fromStop: viewData.fromStop,
            toStop: viewData.toStop,
            pricePerSeat: viewData.pricePerSeat,
            totalPrice: viewData.totalPrice,
            passengerInputs: buildPassengerInputsFromBody(
                viewData.seatDetails,
                {}
            ),
            error: null,
            countryOptions: COUNTRY_OPTIONS,
            firmKey: firmKey,
            contactPhone: "",
            contactEmail: "",
        });
    } catch (error) {
        console.error("renderPaymentPage hata:", error);
        res.status(500).render("payment", {
            title: "Ödeme",
            ticketPaymentId: String(ticketPaymentId || ""),
            seatDetails: [],
            passengerInputs: [],
            error: "Ödeme bilgileri yüklenemedi.",
            countryOptions: COUNTRY_OPTIONS,
            contactPhone: "",
            contactEmail: "",
            firmKey: "",
        });
    }
};

exports.completePayment = async (req, res) => {
    const { ticketPaymentId } = req.params;
    let context = null;
    let viewData = null;
    let passengerInputs = [];
    let contactPhone = extractContactPhone(req.body);
    let contactEmail = extractContactEmail(req.body);

    try {
        context = await resolveTicketPaymentContext(req, ticketPaymentId);

        if (!context) {
            return res.status(404).render("payment", {
                title: "Ödeme",
                ticketPaymentId: String(ticketPaymentId || ""),
                seatDetails: [],
                passengerInputs: [],
                error: "Ödeme isteği bulunamadı.",
                countryOptions: COUNTRY_OPTIONS,
                contactPhone,
                contactEmail,
                firmKey: "",
            });
        }

        const { ticketPayment, models, sequelize } = context;

        if (ticketPayment.isSuccess) {
            return res.redirect(`/payment/${ticketPaymentId}/success`);
        }

        viewData = await buildPaymentViewData(models, ticketPayment);

        passengerInputs = buildPassengerInputsFromBody(
            viewData.seatDetails,
            req.body
        );

        if (!viewData.seatDetails.length) {
            const err = new Error("Bu ödeme için koltuk bilgisi bulunamadı.");
            err.isUserError = true;
            throw err;
        }

        const missingField = passengerInputs.find(
            (p) => !p.name || !p.surname || !p.idNumber
        );
        if (missingField) {
            return res.status(400).render("payment", {
                title: "Ödeme",
                ticketPaymentId: String(ticketPaymentId),
                seatDetails: viewData.seatDetails,
                trip: viewData.trip,
                fromStop: viewData.fromStop,
                toStop: viewData.toStop,
                pricePerSeat: viewData.pricePerSeat,
                totalPrice: viewData.totalPrice,
                passengerInputs,
                error: "Lütfen tüm yolcu bilgilerini doldurun.",
                countryOptions: COUNTRY_OPTIONS,
                contactPhone,
                contactEmail,
                firmKey: context.firmKey || "",
            });
        }

        if (!contactPhone || !contactEmail) {
            return res.status(400).render("payment", {
                title: "Ödeme",
                ticketPaymentId: String(ticketPaymentId),
                seatDetails: viewData.seatDetails,
                trip: viewData.trip,
                fromStop: viewData.fromStop,
                toStop: viewData.toStop,
                pricePerSeat: viewData.pricePerSeat,
                totalPrice: viewData.totalPrice,
                passengerInputs,
                error: "Lütfen iletişim bilgilerini doldurun.",
                countryOptions: COUNTRY_OPTIONS,
                contactPhone,
                contactEmail,
                firmKey: context.firmKey || "",
            });
        }

        const numericSeatNumbers = viewData.seatDetails.map((seat) => {
            const numeric = Number(seat.seatNumber);
            if (!Number.isFinite(numeric)) {
                const err = new Error(
                    `Geçersiz koltuk numarası: ${seat.seatNumber}`
                );
                err.isUserError = true;
                throw err;
            }
            return numeric;
        });

        const { Ticket } = models;
        const transaction = await sequelize.transaction();
        const pendingPnr = buildPendingPnr(ticketPayment.id);

        try {
            for (let i = 0; i < numericSeatNumbers.length; i++) {
                const seatNumber = numericSeatNumbers[i];

                const existing = await Ticket.findOne({
                    where: {
                        tripId: ticketPayment.tripId,
                        seatNo: seatNumber,
                        status: { [Op.notIn]: ["refund", "canceled"] },
                    },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });

                if (existing) {
                    const isOwnPending =
                        existing.status === "pending" &&
                        existing.pnr === pendingPnr;

                    if (isOwnPending) {
                        continue;
                    }

                    const err = new Error(
                        `${viewData.seatDetails[i].seatNumber} numaralı koltuk artık uygun değil.`
                    );
                    err.isUserError = true;
                    throw err;
                }
            }

            await Ticket.destroy({
                where: {
                    tripId: ticketPayment.tripId,
                    seatNo: { [Op.in]: numericSeatNumbers },
                    status: "pending",
                    pnr: pendingPnr,
                },
                transaction,
            });

            const group = await models.TicketGroup.create(
                { tripId: ticketPayment.tripId },
                { transaction }
            );
            const ticketGroupId = group.id;

            const stops = await models.Stop.findAll({ where: { id: { [Op.in]: [ticketPayment.fromStopId, ticketPayment.toStopId] } } })

            const pnr = (ticketPayment.fromStopId && ticketPayment.toStopId) ? await generatePNR(models, ticketPayment.fromStopId, ticketPayment.toStopId, stops) : null;

            for (let i = 0; i < numericSeatNumbers.length; i++) {
                await Ticket.create(
                    {
                        tripId: ticketPayment.tripId,
                        userId: 3, //götür.com kullanıcısı  
                        ticketGroupId: ticketGroupId,
                        seatNo: numericSeatNumbers[i],
                        price: viewData.pricePerSeat || 0,
                        status: "web",
                        idNumber: passengerInputs[i].idNumber,
                        name: passengerInputs[i].name,
                        surname: passengerInputs[i].surname,
                        phoneNumber: passengerInputs[i].phoneNumber,
                        gender: viewData.seatDetails[i].gender,
                        nationality: COUNTRY_CODE_SET.has(
                            passengerInputs[i].nationality
                        )
                            ? passengerInputs[i].nationality
                            : "TR",
                        customerType: "adult",
                        customerCategory: "normal",
                        fromRouteStopId: ticketPayment.fromStopId,
                        pnr: pnr,
                        toRouteStopId: ticketPayment.toStopId,
                        payment: "card",
                    },
                    { transaction }
                );
            }

            ticketPayment.isSuccess = true;
            await ticketPayment.save({ transaction });

            await transaction.commit();
            await sendEmail("ahmetnygt@hotmail.com","Bilet Mesajı","BİLET ALDIN GÖTÜR H.O DER")
        } catch (innerError) {
            await transaction.rollback();
            throw innerError;
        }

        res.redirect(`/payment/${ticketPaymentId}/success`);
    } catch (error) {
        console.error("completePayment hata:", error);

        if (context && !viewData) {
            viewData = await buildPaymentViewData(context.models, context.ticketPayment);
        }

        if (!viewData) {
            viewData = {
                seatDetails: [],
                trip: null,
                fromStop: null,
                toStop: null,
                pricePerSeat: 0,
                totalPrice: 0,
            };
        }

        if (!passengerInputs.length) {
            passengerInputs = buildPassengerInputsFromBody(
                viewData.seatDetails,
                req.body
            );
        }

        if (!contactPhone) {
            contactPhone = extractContactPhone(req.body);
        }

        if (!contactEmail) {
            contactEmail = extractContactEmail(req.body);
        }

        const statusCode = error && error.isUserError ? 400 : 500;

        res.status(statusCode).render("payment", {
            title: "Ödeme",
            ticketPaymentId: String(ticketPaymentId || ""),
            seatDetails: viewData.seatDetails,
            trip: viewData.trip,
            fromStop: viewData.fromStop,
            toStop: viewData.toStop,
            pricePerSeat: viewData.pricePerSeat,
            totalPrice: viewData.totalPrice,
            passengerInputs,
            error:
                error && error.message
                    ? error.message
                    : "Ödeme tamamlanırken bir hata oluştu.",
            countryOptions: COUNTRY_OPTIONS,
            contactPhone,
            contactEmail,
            firmKey: context?.firmKey || "",
        });
    }
};

exports.renderPaymentSuccess = async (req, res) => {
    const { ticketPaymentId } = req.params;

    try {
        const context = await resolveTicketPaymentContext(req, ticketPaymentId);

        if (!context) {
            return res.status(404).render("payment-success", {
                title: "Ödeme Başarılı",
                ticketPaymentId: String(ticketPaymentId || ""),
                seatDetails: [],
                tickets: [],
                error: "Ödeme isteği bulunamadı.",
            });
        }

        const { ticketPayment, models } = context;

        if (!ticketPayment.isSuccess) {
            return res.redirect(`/payment/${ticketPaymentId}`);
        }

        const viewData = await buildPaymentViewData(models, ticketPayment);

        const seatNumbers = viewData.seatDetails
            .map((seat) => Number(seat.seatNumber))
            .filter((seat) => Number.isFinite(seat));

        const { Ticket } = models;
        const whereClause = { tripId: ticketPayment.tripId };
        if (seatNumbers.length) {
            whereClause.seatNo = seatNumbers;
        }

        const tickets = await Ticket.findAll({
            where: whereClause,
            order: [["seatNo", "ASC"]],
        });

        res.render("payment-success", {
            title: "Ödeme Başarılı",
            ticketPaymentId: String(ticketPaymentId),
            seatDetails: viewData.seatDetails,
            trip: viewData.trip,
            fromStop: viewData.fromStop,
            toStop: viewData.toStop,
            tickets: tickets.map((t) => t.get({ plain: true })),
            pricePerSeat: viewData.pricePerSeat,
            totalPrice: viewData.totalPrice,
            error: null,
        });
    } catch (error) {
        console.error("renderPaymentSuccess hata:", error);
        res.status(500).render("payment-success", {
            title: "Ödeme Başarılı",
            ticketPaymentId: String(ticketPaymentId || ""),
            seatDetails: [],
            tickets: [],
            error: "Ödeme sonucu görüntülenemedi.",
        });
    }
};

async function ensureTenantsReady(req) {
    if (req?.app?.locals?.waitForTenants) {
        await req.app.locals.waitForTenants();
    }
}

function normaliseStoredArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return value ? [value] : [];
        }
    }

    return [value];
}

function normaliseBodyArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return [];
    }
    return [value];
}

function normaliseSingleValue(value) {
    if (Array.isArray(value)) {
        return value.length ? String(value[0]).trim() : "";
    }

    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function extractContactPhone(body = {}) {
    if (!body || typeof body !== "object") {
        return "";
    }

    if (Object.prototype.hasOwnProperty.call(body, "contactPhone")) {
        return normaliseSingleValue(body.contactPhone);
    }

    if (Object.prototype.hasOwnProperty.call(body, "phoneNumbers")) {
        return normaliseSingleValue(body.phoneNumbers);
    }

    return "";
}

function extractContactEmail(body = {}) {
    if (!body || typeof body !== "object") {
        return "";
    }

    if (Object.prototype.hasOwnProperty.call(body, "contactEmail")) {
        return normaliseSingleValue(body.contactEmail);
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
        return normaliseSingleValue(body.email);
    }

    if (Object.prototype.hasOwnProperty.call(body, "emails")) {
        return normaliseSingleValue(body.emails);
    }

    return "";
}

function buildPassengerInputsFromBody(seatDetails, body = {}) {
    const names = normaliseBodyArray(body.names);
    const surnames = normaliseBodyArray(body.surnames);
    const idNumbers = normaliseBodyArray(body.idNumbers);
    const nationalities = normaliseBodyArray(body.nationalities);
    const sharedPhoneNumber = extractContactPhone(body);

    return seatDetails.map((seat, index) => {
        const rawNationality = nationalities[index]
            ? String(nationalities[index]).trim()
            : "";
        const normalizedNationality = rawNationality
            ? rawNationality.toUpperCase()
            : "TR";
        const safeNationality = COUNTRY_CODE_SET.has(normalizedNationality)
            ? normalizedNationality
            : "TR";

        return {
            seatNumber: seat.seatNumber,
            gender: seat.gender,
            name: names[index] ? String(names[index]).trim() : "",
            surname: surnames[index] ? String(surnames[index]).trim() : "",
            idNumber: idNumbers[index] ? String(idNumbers[index]).trim() : "",
            phoneNumber: sharedPhoneNumber,
            nationality: safeNationality,
        };
    });
}

async function resolveTicketPaymentContext(req, ticketPaymentId) {
    if (!ticketPaymentId) {
        return null;
    }

    const ticketKey = String(ticketPaymentId);
    const tenantMap = req.session?.ticketPaymentTenants || {};

    const firmFromSession = tenantMap[ticketKey];
    if (firmFromSession) {
        try {
            const { models, sequelize } = await getTenantConnection(firmFromSession);
            const ticketPayment = await models.TicketPayment.findByPk(ticketPaymentId);
            if (ticketPayment) {
                return { firmKey: firmFromSession, models, sequelize, ticketPayment };
            }
        } catch (error) {
            console.error("resolveTicketPaymentContext session hata:", error);
        }
    }

    await ensureTenantsReady(req);

    const searchResults = await runForAllTenants(async ({ firmKey, models, sequelize }) => {
        const record = await models.TicketPayment.findByPk(ticketPaymentId);
        if (!record) return null;
        return { firmKey };
    });

    for (const entry of searchResults) {
        if (entry.result?.firmKey) {
            try {
                const { models, sequelize } = await getTenantConnection(
                    entry.result.firmKey
                );
                const ticketPayment = await models.TicketPayment.findByPk(
                    ticketPaymentId
                );

                if (ticketPayment) {
                    if (!req.session.ticketPaymentTenants) {
                        req.session.ticketPaymentTenants = {};
                    }
                    req.session.ticketPaymentTenants[ticketKey] = entry.result.firmKey;

                    return {
                        firmKey: entry.result.firmKey,
                        models,
                        sequelize,
                        ticketPayment,
                    };
                }
            } catch (error) {
                console.error("resolveTicketPaymentContext fetch hata:", error);
            }
        }
    }

    return null;
}

async function buildPaymentViewData(models, ticketPayment) {
    const seatNumbers = normaliseStoredArray(ticketPayment.seatNumbers);
    const genders = normaliseStoredArray(ticketPayment.genders);

    const seatDetails = seatNumbers.map((seat, index) => ({
        seatNumber: String(seat),
        gender: genders[index] || null,
    }));

    const trip = ticketPayment.tripId
        ? await models.Trip.findByPk(ticketPayment.tripId, { raw: true })
        : null;

    const fromStop = ticketPayment.fromStopId
        ? await models.Stop.findByPk(ticketPayment.fromStopId, { raw: true })
        : null;

    const toStop = ticketPayment.toStopId
        ? await models.Stop.findByPk(ticketPayment.toStopId, { raw: true })
        : null;

    let pricePerSeat = 0;
    if (ticketPayment.fromStopId && ticketPayment.toStopId) {
        const price = await models.Price.findOne({
            where: {
                fromStopId: ticketPayment.fromStopId,
                toStopId: ticketPayment.toStopId,
            },
            raw: true,
        });

        if (price) {
            const candidate =
                price.webPrice ?? price.price1 ?? price.price2 ?? price.price3 ?? 0;
            pricePerSeat = Number(candidate) || 0;
        }
    }

    return {
        seatDetails,
        trip,
        fromStop,
        toStop,
        pricePerSeat,
        totalPrice: pricePerSeat * seatDetails.length,
    };
}

function buildPendingPnr(ticketPaymentId) {
    return `PENDING-${ticketPaymentId}`;
}
