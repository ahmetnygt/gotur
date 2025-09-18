var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../models/tripModel');
const RouteStop = require('../models/routeStopModel');

exports.getTrips = async (req, res, next) => {
    try {
        const fromId = req.query.fromId
        const toId = req.query.toId
        const date = req.query.date

        if (!fromId || !toId || !date) {
            res.status(400).json({ message: "Eksik bilgi gönderildi." })
            return; // eklemezsen alttaki query yine çalışır
        }
        const routeStops = await RouteStop.findAll({
            where: {
                stopId: {
                    [Op.in]: [fromId, toId]
                }
            },
            attributes: ['routeId', 'stopId'],
            raw: true
        });

        const fromIdStr = String(fromId);
        const toIdStr = String(toId);

        const stopsByRoute = new Map();

        for (const routeStop of routeStops) {
            const routeIdKey = String(routeStop.routeId);
            const stopIdValue = String(routeStop.stopId);

            if (!stopsByRoute.has(routeIdKey)) {
                stopsByRoute.set(routeIdKey, {
                    routeId: routeStop.routeId,
                    stopIds: new Set()
                });
            }

            stopsByRoute.get(routeIdKey).stopIds.add(stopIdValue);
        }

        const matchingRouteIds = Array.from(stopsByRoute.values())
            .filter(({ stopIds }) => stopIds.has(fromIdStr) && stopIds.has(toIdStr))
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
