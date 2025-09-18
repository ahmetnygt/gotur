var express = require('express');
// var router = express.Router();
// const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const Trip = require('../../gotur_yzhn/models/tripModel');
const RouteStop = require('../../gotur_yzhn/models/routeStopModel');

exports.getTrips = async (req, res, next) => {
    try {
        const fromId = req.query.fromId
        const toId = req.query.toId
        const date = req.query.date

        if (!fromId || !toId || !date) {
            res.status(400).json({ message: "Eksik bilgi gönderildi." })
            return; // eklemezsen alttaki query yine çalışır
        }
        // const routeStops = await RouteStop.findAll({ where: { stopId: { [Op.in]: [fromId, toId] } } })

        const trips = await Trip.findAll({ where: { date: { [Op.eq]: date } } });

        res.json(trips.map(t => t.id))

    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
};