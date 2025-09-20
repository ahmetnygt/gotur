const { Op } = require("sequelize");
const { runForAllTenants } = require("../utilities/runAllTenants");
const { getTenantConnection } = require("../utilities/tenantDb");

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

        await ensureTenantsReady(req);

        const results = await runForAllTenants(async ({ firmKey, models }) => {
            const { Trip, RouteStop, Stop, Route, Price, BusModel, Ticket } = models;

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
                const fromStop = stops.find((s) => s.placeId == fromId);
                const toStop = stops.find((s) => s.placeId == toId);

                if (!fromStop || !toStop) {
                    continue;
                }

                trip.duration = "00:00:00";
                trip.time = trip.time || "00:00:00"; // güvenlik

                const _routeStops = routeStopsOfTrips.filter(
                    (rs) => rs.routeId == trip.routeId
                );
                const fromOrderEntry = _routeStops.find(
                    (rs) => rs.stopId == fromStop.id
                );
                const toOrderEntry = _routeStops.find(
                    (rs) => rs.stopId == toStop.id
                );

                if (!fromOrderEntry || !toOrderEntry) {
                    continue;
                }

                const fromOrder = fromOrderEntry.order;
                const toOrder = toOrderEntry.order;

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
                        fromStopId: fromStop.id,
                        toStopId: toStop.id,
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
                trip.fromStr = fromStop.title;
                trip.toStr = toStop.title;
                trip.fromStopId = fromStop.id;
                trip.toStopId = toStop.id;
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

        const { models } = await getTenantConnection(firmKey);
        const ticketPayment = await models.TicketPayment.create({
            tripId: numericTripId,
            fromStopId: numericFromStopId,
            toStopId: numericToStopId,
            seatNumbers: normalisedSeats,
            genders: normalisedGenders,
        });

        if (!req.session.ticketPaymentTenants) {
            req.session.ticketPaymentTenants = {};
        }
        req.session.ticketPaymentTenants[String(ticketPayment.id)] = firmKey;

        res.json({ success: true, ticketPaymentId: ticketPayment.id });
    } catch (error) {
        console.error("createTicketPayment hata:", error);
        res.status(500).json({
            success: false,
            message: "Ödeme kaydı oluşturulamadı.",
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
            });
        }

        const { ticketPayment, models } = context;

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
        });
    } catch (error) {
        console.error("renderPaymentPage hata:", error);
        res.status(500).render("payment", {
            title: "Ödeme",
            ticketPaymentId: String(ticketPaymentId || ""),
            seatDetails: [],
            passengerInputs: [],
            error: "Ödeme bilgileri yüklenemedi.",
        });
    }
};

exports.completePayment = async (req, res) => {
    const { ticketPaymentId } = req.params;
    let context = null;
    let viewData = null;
    let passengerInputs = [];

    try {
        context = await resolveTicketPaymentContext(req, ticketPaymentId);

        if (!context) {
            return res.status(404).render("payment", {
                title: "Ödeme",
                ticketPaymentId: String(ticketPaymentId || ""),
                seatDetails: [],
                passengerInputs: [],
                error: "Ödeme isteği bulunamadı.",
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
            (p) => !p.name || !p.surname || !p.idNumber || !p.phoneNumber
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
                    const err = new Error(
                        `${viewData.seatDetails[i].seatNumber} numaralı koltuk artık uygun değil.`
                    );
                    err.isUserError = true;
                    throw err;
                }
            }

            for (let i = 0; i < numericSeatNumbers.length; i++) {
                await Ticket.create(
                    {
                        tripId: ticketPayment.tripId,
                        seatNo: numericSeatNumbers[i],
                        gender: viewData.seatDetails[i].gender,
                        status: "completed",
                        price: viewData.pricePerSeat || 0,
                        fromRouteStopId: ticketPayment.fromStopId,
                        toRouteStopId: ticketPayment.toStopId,
                        name: passengerInputs[i].name,
                        surname: passengerInputs[i].surname,
                        idNumber: passengerInputs[i].idNumber,
                        phoneNumber: passengerInputs[i].phoneNumber,
                        nationality: passengerInputs[i].nationality || "TR",
                        payment: "card",
                    },
                    { transaction }
                );
            }

            ticketPayment.isSuccess = true;
            await ticketPayment.save({ transaction });

            await transaction.commit();
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

function buildPassengerInputsFromBody(seatDetails, body = {}) {
    const names = normaliseBodyArray(body.names);
    const surnames = normaliseBodyArray(body.surnames);
    const idNumbers = normaliseBodyArray(body.idNumbers);
    const phoneNumbers = normaliseBodyArray(body.phoneNumbers);
    const nationalities = normaliseBodyArray(body.nationalities);

    return seatDetails.map((seat, index) => ({
        seatNumber: seat.seatNumber,
        gender: seat.gender,
        name: names[index] ? String(names[index]).trim() : "",
        surname: surnames[index] ? String(surnames[index]).trim() : "",
        idNumber: idNumbers[index] ? String(idNumbers[index]).trim() : "",
        phoneNumber: phoneNumbers[index]
            ? String(phoneNumbers[index]).trim()
            : "",
        nationality: nationalities[index]
            ? String(nationalities[index]).trim() || "TR"
            : "TR",
    }));
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
