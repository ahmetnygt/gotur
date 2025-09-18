var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../models/tripModel');
const RouteStop = require('../models/routeStopModel');
const Stop = require('../models/stopModel');

exports.getTrips = async (req, res, next) => {
    try {
        const fromId = req.query.fromId
        const toId = req.query.toId
        const date = req.query.date

        if (!fromId || !toId || !date) {
            res.status(400).json({ message: "Eksik bilgi gönderildi." })
            return; // eklemezsen alttaki query yine çalışır
        }

        const stops = await Stop.findAll({
            where: {
                placeId: {
                    [Op.in]: [fromId, toId]
                }
            },
            attributes: ['id', 'placeId'],
            raw: true
        });

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

        if (!fromPlaceStopIds || !fromPlaceStopIds.length || !toPlaceStopIds || !toPlaceStopIds.length) {
            res.json([]);
            return;
        }

        const allStopIds = Array.from(new Set([...fromPlaceStopIds, ...toPlaceStopIds]));

        const routeStops = await RouteStop.findAll({
            where: {
                stopId: {
                    [Op.in]: allStopIds
                }
            },
            attributes: ['routeId', 'stopId'],
            raw: true
        });

        if (!routeStops.length) {
            res.json([]);
            return;
        }

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

        const matchingRouteIds = Array.from(routesWithPlaces.values())
            .filter(({ placeIds }) => placeIds.has(fromPlaceKey) && placeIds.has(toPlaceKey))
            .map(({ routeId }) => routeId);

        if (!matchingRouteIds.length) {
            res.json([]);
            return;
        }

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

        res.json(trips.map(t => t.id))

    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
};
