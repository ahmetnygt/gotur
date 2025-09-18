var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../models/tripModel');
const RouteStop = require('../models/routeStopModel');
const Stop = require('../models/stopModel');

exports.getTrips = async (req, res, next) => {
    try {
        // İstekten gelen kalkış, varış ve tarih bilgilerini alıyoruz.
        const fromId = req.query.fromId
        const toId = req.query.toId
        const date = req.query.date

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
            attributes: ['routeId', 'stopId'],
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

        // Sonuç olarak sadece tripId listesini döndürüyoruz.
        res.json(trips.map(t => t.id))

    } catch (err) {
        console.error('Trip search error:', err);
        res.status(500).json({ message: err.message });
    }
};
