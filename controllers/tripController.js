const { Op } = require("sequelize");
const { runForAllTenants } = require("../utilities/runAllTenants");

function addTime(baseTime, addTime) {
    const [h1, m1, s1] = baseTime.split(":").map(Number);
    const [h2, m2, s2] = addTime.split(":").map(Number);

    let totalSeconds =
        h1 * 3600 + m1 * 60 + s1 + (h2 * 3600 + m2 * 60 + s2);

    totalSeconds = totalSeconds % (24 * 3600);

    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
}

exports.searchAllTrips = async (req, res) => {
    try {
        // /trips/:route/:date → örn: /trips/1-2/2025-09-25
        const [fromId, toId] = (req.params.route || "").split("-");
        const date = req.params.date;

        if (!fromId || !toId || !date) {
            return res
                .status(400)
                .json({ message: "Eksik parametre: /trips/:fromId-:toId/:date" });
        }

        const results = await runForAllTenants(async ({ firmKey, models }) => {
            const { Trip, RouteStop, Stop, Route, Price, BusModel, Ticket } = models;

            // 1) İlgili duraklar
            const stops = await Stop.findAll({
                where: { placeId: { [Op.in]: [fromId, toId] } },
                raw: true,
            });

            console.log("asdfghkjkllk")
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

            const routesOfTrips = await Route.findAll({
                where: { id: { [Op.in]: [...new Set(trips.map((t) => t.routeId))] } },
            });
            const routeStopsOfTrips = await RouteStop.findAll({
                where: {
                    routeId: { [Op.in]: [...new Set(routesOfTrips.map((r) => r.id))] },
                },
                raw: true,
            });

            // 5) Trip detaylarını hesapla
            for (let i = 0; i < trips.length; i++) {
                const trip = trips[i];
                trip.duration = "00:00:00";
                trip.time = trip.time || "00:00:00"; // güvenlik

                const _routeStops = routeStopsOfTrips.filter(
                    (rs) => rs.routeId == trip.routeId
                );
                const fromOrder = _routeStops.find(
                    (rs) => rs.stopId == stops.find((s) => s.placeId == fromId).id
                ).order;
                const toOrder = _routeStops.find(
                    (rs) => rs.stopId == stops.find((s) => s.placeId == toId).id
                ).order;

                if (fromOrder !== _routeStops.length - 1) {
                    for (const rs of _routeStops) {
                        trip.time = addTime(trip.time, rs.duration);
                        if (rs.order == fromOrder) break;
                    }
                    for (const rs of _routeStops) {
                        if (rs.order > fromOrder && rs.order <= toOrder) {
                            trip.duration = addTime(trip.duration, rs.duration);
                        }
                    }
                }

                const price = await Price.findOne({
                    where: {
                        fromStopId: stops.find((s) => s.placeId == fromId).id,
                        toStopId: stops.find((s) => s.placeId == toId).id,
                    },
                });

                const busModel = await BusModel.findOne({
                    where: { id: trip.busModelId },
                });

                const tickets = await Ticket.findAll({
                    where: {
                        tripId: trip.id,
                        status: { [Op.notIn]: ["refund", "canceled"] },
                    },
                    order: [["seatNo", "ASC"]],
                });

                let newTickets = [];
                for (const t of tickets) newTickets[t.seatNo] = t;

                const [h, m] = trip.duration.split(":").map(Number);
                let result = "";
                if (h > 0) result += `${h} saat `;
                if (m > 0) result += `${m} dakika`;

                trip.duration = result.trim();
                trip.fromStr = stops.find((s) => s.placeId == fromId).title;
                trip.toStr = stops.find((s) => s.placeId == toId).title;
                trip.price = price ? price.webPrice : 0;

                if (busModel) {
                    trip.fullness = tickets.length + "/" + busModel.maxPassenger;
                    trip.busPlanBinary = busModel.planBinary;
                    trip.busPlan = JSON.parse(busModel.plan);
                } else {
                    trip.fullness = tickets.length.toString();
                    trip.busPlanBinary = "";
                    trip.busPlan = [];
                }

                trip.tickets = newTickets;

                // hangi firmadan geldiğini belirt
                trip.firm = firmKey;
            }

            return trips;
        });

        // Tüm firmaların sonuçlarını birleştir
        const mergedTrips = results.flatMap((r) => r.result || []);

        // 👉 Şablon render edebilirsin:
        res.render("trips", { trips: mergedTrips });

        // 👉 veya JSON API olarak dönebilirsin:
        // res.json({ count: mergedTrips.length, trips: mergedTrips });
    } catch (err) {
        console.error("searchAllTrips hata:", err);
        res.status(500).json({ error: err.message });
    }
};
