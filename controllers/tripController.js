var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../models/tripModel');
const RouteStop = require('../models/routeStopModel');
const Stop = require('../models/stopModel');
const Route = require('../models/routeModel');
const Price = require('../models/priceModel');
const BusModel = require('../models/busModelModel');
const Ticket = require('../models/ticketModel');

function addTime(baseTime, addTime) {
    // "12:30:00" ve "01:00:00" gibi stringleri alır
    const [h1, m1, s1] = baseTime.split(":").map(Number);
    const [h2, m2, s2] = addTime.split(":").map(Number);

    // toplam saniye
    let totalSeconds = (h1 * 3600 + m1 * 60 + s1) + (h2 * 3600 + m2 * 60 + s2);

    // 24 saati geçerse mod 24 yap
    totalSeconds = totalSeconds % (24 * 3600);

    // geri formatla
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
}

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
            raw: true
        });

        // placeId -> stopId listesi ve stopId -> placeId eşleşmesi tutuyoruz.
        const stopIdsByPlace = new Map();
        const stopIdToPlace = new Map();

        for (const stop of stops) {
            const placeKey = String(stop.placeId);
            const stopKey = String(stop.id);

            if (!stopIdsByPlace.has(placeKey)) {
                stopIdsByPlace.set(placeKey, []);
            }

            stopIdsByPlace.get(placeKey).push(stop.id);
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
            raw: true
        });

        // Hiç eşleşen route-stop yoksa sefer bulunamamıştır.
        if (!routeStops.length) {
            res.json([]);
            return;
        }

        // Her bir route'un hangi place'lere hizmet verdiğini takip eden bir map oluşturuyoruz.
        const routesWithPlaces = new Map();

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

        const routesOfTrips = await Route.findAll({
            where: {
                id: { [Op.in]: [...new Set(trips.map(t => t.routeId))] }
            }
        })
        const routeStopsOfTrips = await RouteStop.findAll({
            where: {
                routeId: {
                    [Op.in]: [...new Set(routesOfTrips.map(r => r.id))]
                }
            },
            raw: true
        });

        for (let i = 0; i < trips.length; i++) {
            const trip = trips[i];
            trip.duration = "00:00:00"

            const _routeStops = routeStopsOfTrips.filter(rs => rs.routeId == trip.routeId)
            const fromRouteStopOrder = _routeStops.find(rs => rs.stopId == stops.find(s => s.placeId == fromId).id).order
            const toRouteStopOrder = _routeStops.find(rs => rs.stopId == stops.find(s => s.placeId == toId).id).order

            if (fromRouteStopOrder !== _routeStops.length - 1) {

                for (let j = 0; j < _routeStops.length; j++) {
                    const rs = _routeStops[j];

                    trip.time = addTime(trip.time, rs.duration)

                    if (rs.order == fromRouteStopOrder)
                        break
                }

                for (let j = 0; j < _routeStops.length; j++) {
                    const rs = _routeStops[j];
                    if (rs.order > fromRouteStopOrder && rs.order <= toRouteStopOrder)
                        trip.duration = addTime(trip.duration, rs.duration)
                }
            }

            const price = await Price.findOne({ where: { fromStopId: stops.find(s => s.placeId == fromId).id, toStopId: stops.find(s => s.placeId == toId).id } })

            const busModel = await BusModel.findOne({ where: { id: trip.busModelId } })

            const tickets = await Ticket.findAll({ where: { tripId: trip.id, status: { [Op.notIn]: ["refund", "canceled"] } }, order: [["seatNo", "ASC"]] })

            let newTickets = []

            for (let i = 0; i < tickets.length; i++) {
                const t = tickets[i];
                newTickets[t.seatNo] = t
            }
            console.log(trip.id, newTickets.map(w => w.seatNo), newTickets.map(w => w.gender))

            const [h, m] = trip.duration.split(":").map(Number);

            let result = "";
            if (h > 0) result += `${h} saat `;
            if (m > 0) result += `${m} dakika`;

            trip.duration = result.trim();
            trip.fromStr = stops.find(s => s.placeId == fromId).title
            trip.toStr = stops.find(s => s.placeId == toId).title
            trip.price = price ? price.webPrice : 0
            trip.fullness = tickets.length + "/" + busModel.maxPassenger
            trip.busPlanBinary = busModel.planBinary
            trip.busPlan = JSON.parse(busModel.plan)
            trip.tickets = newTickets
        }

        // Sonuç olarak sadece tripId listesini döndürüyoruz.
        res.render("trips", { trips })

    } catch (err) {
        console.error('Trip search error:', err);
        res.status(500).json({ message: err.message });
    }
};