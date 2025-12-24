const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const {
    COUNTRY_OPTIONS,
    COUNTRY_CODE_SET,
} = require("../utilities/countryOptions");
const { runForAllTenants } = require("../utilities/runAllTenants");

const SALT_ROUNDS = 10;

const GENDER_OPTIONS = [
    { value: "m", label: "Erkek" },
    { value: "f", label: "Kadın" },
];

const CUSTOMER_TYPE_OPTIONS = [
    { value: "adult", label: "Adult" },
    { value: "child", label: "Child" },
    { value: "student", label: "Studen" },
    { value: "disabled", label: "Disabled" },
    { value: "retired", label: "Retired" },
];

const CUSTOMER_TYPE_VALUES = new Set(CUSTOMER_TYPE_OPTIONS.map((option) => option.value));

function getUserModel(req) {
    const { User } = req.commonModels || {};

    if (!User) {
        const error = new Error("Couldn't find user model.");
        error.status = 500;
        throw error;
    }

    return User;
}

function normalizeIdentifier(value = "") {
    return value.trim();
}

function sanitizePhone(value = "") {
    return value.replace(/\s+/g, "");
}

function normalizeText(value = "") {
    return typeof value === "string" ? value.trim() : "";
}

function sanitizeIdNumber(value = "") {
    return String(value || "").replace(/\D+/g, "");
}

function createDate(value) {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date?.getTime?.())) {
        return date;
    }

    return null;
}

function formatTripDate(dateValue) {
    const date = createDate(dateValue);
    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(date);
}

function formatTripTime(timeValue) {
    if (!timeValue && timeValue !== 0) {
        return "";
    }

    if (typeof timeValue === "string") {
        const trimmed = timeValue.trim();
        if (trimmed) {
            const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
            if (match) {
                const hours = match[1].padStart(2, "0");
                return `${hours}:${match[2]}`;
            }
        }
    }

    const date = createDate(timeValue);
    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function formatTicketTimestamp(dateValue) {
    const date = createDate(dateValue);

    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function mapTicketStatus(status) {
    const normalisedStatus = String(status || "").toLowerCase();

    const statusMap = {
        pending: { label: "Pending", cssClass: "status-pending" },
        reservation: { label: "Reservation", cssClass: "status-pending" },
        canceled: { label: "Canceled", cssClass: "status-canceled" },
        refund: { label: "Refunded", cssClass: "status-refund" },
        completed: { label: "Completed", cssClass: "" },
        web: { label: "Web", cssClass: "" },
        gotur: { label: "GoTur", cssClass: "" },
        open: { label: "Open", cssClass: "" },
    };

    const mapping = statusMap[normalisedStatus] || {
        label: normalisedStatus ? normalisedStatus.toUpperCase() : "",
        cssClass: "",
    };

    return mapping;
}

function buildTicketResponse({ ticket, trip, fromStop, toStop, user, firmKey }) {
    const passengerName = [ticket.name, ticket.surname]
        .filter((part) => Boolean(part))
        .join(" ")
        .trim();

    const { label: statusLabel, cssClass: statusClass } = mapTicketStatus(ticket.status);

    return {
        id: ticket.id,
        pnr: ticket.pnr || "",
        seatNo: ticket.seatNo,
        phoneNumber: ticket.phoneNumber || "",
        status: ticket.status || "",
        passenger: {
            firstName: ticket.name || "",
            lastName: ticket.surname || "",
            fullName: passengerName || "",
        },
        trip: {
            id: trip?.id || null,
            tripDate: formatTripDate(trip?.date),
            tripDateRaw: trip?.date || "",
            tripTime: formatTripTime(trip?.time),
            tripTimeRaw: trip?.time || "",
            fromTitle: trip?.fromPlaceString || fromStop?.title || "",
            toTitle: trip?.toPlaceString || toStop?.title || "",
        },
        fromStop: fromStop ? { id: fromStop.id, title: fromStop.title } : null,
        toStop: toStop ? { id: toStop.id, title: toStop.title } : null,
        contactEmail: user?.email || "",
        createdAt: ticket.createdAt || null,
        createdAtFormatted: formatTicketTimestamp(ticket.createdAt),
        createdAtText: formatTicketTimestamp(ticket.createdAt),
        statusLabel,
        statusClass,
        firmKey,
    };
}

async function fetchTicketsForUser({ searchFilters }) {
    if (!Array.isArray(searchFilters) || !searchFilters.length) {
        return [];
    }

    const tenantResults = await runForAllTenants(async ({ firmKey, models }) => {
        const { Ticket, Trip, RouteStop, Stop, User: TenantUser } = models;

        if (!Ticket || !Trip || !RouteStop || !Stop) {
            return [];
        }

        const whereClause =
            searchFilters.length === 1 ? searchFilters[0] : { [Op.or]: searchFilters };

        const tickets = await Ticket.findAll({
            where: whereClause,
            order: [["createdAt", "DESC"]],
            raw: true,
        });

        if (!tickets.length) {
            return [];
        }

        const tripIds = Array.from(
            new Set(
                tickets
                    .map((ticket) => ticket.tripId)
                    .filter((tripId) => Number.isFinite(Number(tripId))),
            ),
        );

        const fromRouteStopIds = Array.from(
            new Set(
                tickets
                    .map((ticket) => ticket.fromRouteStopId)
                    .filter((id) => Number.isFinite(Number(id))),
            ),
        );

        const toRouteStopIds = Array.from(
            new Set(
                tickets
                    .map((ticket) => ticket.toRouteStopId)
                    .filter((id) => Number.isFinite(Number(id))),
            ),
        );

        const allRouteStopIds = Array.from(new Set([...fromRouteStopIds, ...toRouteStopIds]));

        const [trips, routeStops] = await Promise.all([
            tripIds.length
                ? Trip.findAll({ where: { id: { [Op.in]: tripIds } }, raw: true })
                : [],
            allRouteStopIds.length
                ? RouteStop.findAll({
                    where: { id: { [Op.in]: allRouteStopIds } },
                    raw: true,
                })
                : [],
        ]);

        const stopIds = Array.from(
            new Set(
                routeStops
                    .map((routeStop) => routeStop.stopId)
                    .filter((id) => Number.isFinite(Number(id))),
            ),
        );

        const stops = stopIds.length
            ? await Stop.findAll({ where: { id: { [Op.in]: stopIds } }, raw: true })
            : [];

        const usersById = new Map();
        if (TenantUser) {
            const ticketUserIds = Array.from(
                new Set(
                    tickets
                        .map((ticket) => ticket.userId)
                        .filter((id) => Number.isFinite(Number(id))),
                ),
            );

            if (ticketUserIds.length) {
                const userRows = await TenantUser.findAll({
                    where: { id: { [Op.in]: ticketUserIds } },
                    attributes: ["id", "email", "name", "surname"],
                    raw: true,
                });

                for (const row of userRows) {
                    usersById.set(String(row.id), row);
                }
            }
        }

        const tripMap = new Map(trips.map((trip) => [String(trip.id), trip]));
        const routeStopMap = new Map(routeStops.map((routeStop) => [String(routeStop.id), routeStop]));
        const stopMap = new Map(stops.map((stop) => [String(stop.id), stop]));

        return tickets.map((ticket) => {
            const trip = tripMap.get(String(ticket.tripId)) || null;
            const fromRouteStop = routeStopMap.get(String(ticket.fromRouteStopId));
            const toRouteStop = routeStopMap.get(String(ticket.toRouteStopId));
            const fromStop = fromRouteStop ? stopMap.get(String(fromRouteStop.stopId)) : null;
            const toStop = toRouteStop ? stopMap.get(String(toRouteStop.stopId)) : null;
            const user = ticket.userId ? usersById.get(String(ticket.userId)) || null : null;

            return buildTicketResponse({
                ticket,
                trip,
                fromStop,
                toStop,
                user,
                firmKey,
            });
        });
    });

    const mergedTickets = [];
    const seenKeys = new Set();

    for (const tenantResult of tenantResults) {
        const tickets = Array.isArray(tenantResult.result) ? tenantResult.result : [];

        for (const ticket of tickets) {
            const dedupeKey = `${ticket.firmKey || ""}-${ticket.id}`;

            if (seenKeys.has(dedupeKey)) {
                continue;
            }

            seenKeys.add(dedupeKey);
            mergedTickets.push(ticket);
        }
    }

    mergedTickets.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
    });

    return mergedTickets;
}

function isEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value = "") {
    return /^\+?\d{10,15}$/.test(value);
}

function buildFieldErrorResponse(res, fieldErrors, message = "Please fix the errors in the form.") {
    return res.status(400).json({ success: false, fieldErrors, message });
}

function createSessionUserPayload(userInstance) {
    return {
        id: userInstance.id,
        email: userInstance.email,
        phoneNumber: userInstance.phoneNumber,
        name: userInstance.name,
        surname: userInstance.surname,
    };
}

function buildPersonalInfoPayload(userInstance = {}) {
    return {
        idNumber: userInstance.idNumber ? String(userInstance.idNumber) : "",
        name: userInstance.name || "",
        surname: userInstance.surname || "",
        email: userInstance.email || "",
        phoneNumber: userInstance.phoneNumber || "",
        gender: userInstance.gender || "",
        nationality: userInstance.nationality
            ? String(userInstance.nationality).toUpperCase()
            : "",
        customerType: userInstance.customerType || "",
    };
}

exports.register = async (req, res) => {
    try {
        const User = getUserModel(req);
        const { identifier, password, passwordConfirm } = req.body || {};
        const fieldErrors = {};

        const normalizedIdentifier = normalizeIdentifier(identifier);
        const normalizedPassword = typeof password === "string" ? password.trim() : "";
        const normalizedPasswordConfirm =
            typeof passwordConfirm === "string" ? passwordConfirm.trim() : "";

        if (!normalizedIdentifier) {
            fieldErrors.identifier = "Email or phone number is required.";
        } else if (!isEmail(normalizedIdentifier) && !isPhone(normalizedIdentifier)) {
            fieldErrors.identifier = "Please enter a valid email address or phone number.";
        }

        if (!normalizedPassword) {
            fieldErrors.password = "Password is required.";
        } else if (normalizedPassword.length < 6) {
            fieldErrors.password = "Password must be at least 6 characters long.";
        }

        if (!normalizedPasswordConfirm) {
            fieldErrors.passwordConfirm = "Password confirmation is required.";
        } else if (normalizedPassword !== normalizedPasswordConfirm) {
            fieldErrors.passwordConfirm = "Passwords do not match.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        const whereClause = {};
        let payload = {};

        if (isEmail(normalizedIdentifier)) {
            const email = normalizedIdentifier.toLowerCase();
            whereClause.email = email;
            payload.email = email;
        } else {
            const phone = sanitizePhone(normalizedIdentifier);
            whereClause.phoneNumber = phone;
            payload.phoneNumber = phone;
        }

        const existingUser = await User.findOne({ where: whereClause });

        if (existingUser) {
            fieldErrors.identifier = "An account already exists with these details.";
            return buildFieldErrorResponse(res, fieldErrors, "Registration could not be completed.");
        }

        const hashedPassword = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);

        const createdUser = await User.create({
            ...payload,
            password: hashedPassword,
        });

        const sessionUser = createSessionUserPayload(createdUser);
        req.session.user = sessionUser;

        return res.json({ success: true, user: sessionUser });
    } catch (error) {
        console.error("An error occurred during registration:", error);
        const status = error.status || 500;
        const message =
            status === 500
                ? "An unexpected error occurred during registration. Please try again later."
                : error.message;
        return res.status(status).json({ success: false, message });
    }
};

exports.login = async (req, res) => {
    try {
        const User = getUserModel(req);
        const { identifier, password } = req.body || {};
        const fieldErrors = {};

        const normalizedIdentifier = normalizeIdentifier(identifier);
        const normalizedPassword = typeof password === "string" ? password.trim() : "";

        if (!normalizedIdentifier) {
            fieldErrors.identifier = "Email or phone number is required.";
        } else if (!isEmail(normalizedIdentifier) && !isPhone(normalizedIdentifier)) {
            fieldErrors.identifier = "Please enter a valid email address or phone number.";
        }

        if (!normalizedPassword) {
            fieldErrors.password = "Password is required.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors, "Login details are missing or invalid.");
        }

        const whereClause = isEmail(normalizedIdentifier)
            ? { email: normalizedIdentifier.toLowerCase() }
            : { phoneNumber: sanitizePhone(normalizedIdentifier) };

        const user = await User.findOne({ where: whereClause });

        if (!user) {
            return res.status(401).json({
                success: false,
                fieldErrors: { identifier: "No user found with these details." },
                message: "Login details could not be verified.",
            });
        }

        const isPasswordValid = await bcrypt.compare(
            normalizedPassword,
            user.password || ""
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                fieldErrors: { password: "Please check your password." },
                message: "Login details could not be verified.",
            });
        }

        const sessionUser = createSessionUserPayload(user);
        req.session.user = sessionUser;

        return res.json({ success: true, user: sessionUser });
    } catch (error) {
        console.error("An error occurred during login:", error);
        const status = error.status || 500;
        const message =
            status === 500
                ? "An unexpected error occurred during login. Please try again later."
                : error.message;
        return res.status(status).json({ success: false, message });
    }
};

exports.logout = (req, res) => {
    try {
        if (!req.session) {
            return res.json({ success: true });
        }

        req.session.destroy((error) => {
            if (error) {
                console.error("Session could not be destroyed during logout:", error);
                return res.status(500).json({
                    success: false,
                    message: "An error occurred while logging out. Please try again.",
                });
            }

            res.clearCookie("connect.sid");
            return res.json({ success: true });
        });
    } catch (error) {
        console.error("An error occurred during logout:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while logging out. Please try again.",
        });
    }
};

exports.redirectToPersonalInformation = (req, res) => {
    if (!req.session?.user) {
        return res.redirect("/");
    }

    return res.redirect("/user/personal-information");
};
exports.personalInformation = async (req, res, next) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.redirect("/");
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        const personalInfo = userInstance
            ? buildPersonalInfoPayload(userInstance)
            : buildPersonalInfoPayload(sessionUser);

        return res.render("user/personal-information", {
            title: "Götür | My Personal Information",
            personalInfo,
            genderOptions: GENDER_OPTIONS,
            customerTypeOptions: CUSTOMER_TYPE_OPTIONS,
            countryOptions: COUNTRY_OPTIONS,
        });
    } catch (error) {
        return next(error);
    }
};

exports.updatePersonalInformation = async (req, res) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.status(401).json({
                success: false,
                message: "You must be logged in to perform this action.",
            });
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        if (!userInstance) {
            return res
                .status(404)
                .json({ success: false, message: "User not found." });
        }

        const {
            name,
            surname,
            email,
            phoneNumber,
            idNumber,
            gender,
            nationality,
            customerType,
        } = req.body || {};

        const fieldErrors = {};

        const normalizedName = normalizeText(name);
        const normalizedSurname = normalizeText(surname);
        const normalizedEmail = normalizeText(email).toLowerCase();
        const normalizedPhoneInput = typeof phoneNumber === "string" ? phoneNumber : "";
        const normalizedPhone = sanitizePhone(normalizedPhoneInput);
        const normalizedIdNumber = sanitizeIdNumber(idNumber);
        const normalizedGender = normalizeText(gender).toLowerCase();
        const normalizedNationality = normalizeText(nationality).toUpperCase();
        const normalizedCustomerType = normalizeText(customerType).toLowerCase();

        if (!normalizedName) {
            fieldErrors.name = "First name is required.";
        }

        if (!normalizedSurname) {
            fieldErrors.surname = "Last name is required.";
        }

        if (normalizedEmail && !isEmail(normalizedEmail)) {
            fieldErrors.email = "Please enter a valid email address.";
        }

        if (normalizedPhone && !isPhone(normalizedPhone)) {
            fieldErrors.phoneNumber = "Please enter a valid phone number.";
        }

        if (normalizedIdNumber && !/^\d{11}$/.test(normalizedIdNumber)) {
            fieldErrors.idNumber = "ID number must be 11 digits.";
        }

        if (
            normalizedGender &&
            !GENDER_OPTIONS.some((option) => option.value === normalizedGender)
        ) {
            fieldErrors.gender = "Please select a valid gender.";
        }

        if (normalizedNationality && !COUNTRY_CODE_SET.has(normalizedNationality)) {
            fieldErrors.nationality = "Please select a valid nationality.";
        }

        if (
            normalizedCustomerType &&
            !CUSTOMER_TYPE_VALUES.has(normalizedCustomerType)
        ) {
            fieldErrors.customerType = "Please select a valid customer type.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        userInstance.name = normalizedName;
        userInstance.surname = normalizedSurname;
        userInstance.email = normalizedEmail || null;
        userInstance.phoneNumber = normalizedPhone || null;
        userInstance.idNumber = normalizedIdNumber || null;
        userInstance.gender = normalizedGender || null;
        userInstance.nationality = normalizedNationality || null;
        userInstance.customerType = normalizedCustomerType || null;

        await userInstance.save();

        const sessionPayload = createSessionUserPayload(userInstance);
        req.session.user = sessionPayload;

        return res.json({
            success: true,
            message: "Your information has been updated successfully.",
            personalInfo: buildPersonalInfoPayload(userInstance),
        });
    } catch (error) {
        console.error("Error while updating personal information:", error);
        return res
            .status(500)
            .json({ success: false, message: "Unable to update information." });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.status(401).json({
                success: false,
                message: "You must be logged in to perform this action.",
            });
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        if (!userInstance) {
            return res
                .status(404)
                .json({ success: false, message: "User not found." });
        }

        const { currentPassword, newPassword, newPasswordConfirm } = req.body || {};
        const fieldErrors = {};

        const normalizedCurrentPassword = normalizeText(currentPassword);
        const normalizedNewPassword = normalizeText(newPassword);
        const normalizedNewPasswordConfirm = normalizeText(newPasswordConfirm);

        if (!normalizedCurrentPassword) {
            fieldErrors.currentPassword = "Current password is required.";
        }

        if (!normalizedNewPassword) {
            fieldErrors.newPassword = "New password is required.";
        } else if (normalizedNewPassword.length < 6) {
            fieldErrors.newPassword = "Password must be at least 6 characters long.";
        }

        if (!normalizedNewPasswordConfirm) {
            fieldErrors.newPasswordConfirm = "Password confirmation is required.";
        } else if (normalizedNewPassword !== normalizedNewPasswordConfirm) {
            fieldErrors.newPasswordConfirm = "Passwords do not match.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        const isCurrentPasswordValid = await bcrypt.compare(
            normalizedCurrentPassword,
            userInstance.password || ""
        );

        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                fieldErrors: { currentPassword: "Please check your current password." },
                message: "Password could not be changed.",
            });
        }

        const hashedPassword = await bcrypt.hash(normalizedNewPassword, SALT_ROUNDS);
        userInstance.password = hashedPassword;
        await userInstance.save();

        return res.json({
            success: true,
            message: "Your password has been updated successfully.",
        });
    } catch (error) {
        console.error("Error while changing password:", error);
        return res
            .status(500)
            .json({ success: false, message: "Unable to update your password." });
    }
};

exports.renderMyTripsPage = async (req, res) => {
    if (!req.session?.user) {
        return res.redirect("/");
    }

    try {
        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }
    } catch (error) {
        console.error("Error while preparing tenant data:", error);
        return res.status(500).render("error", {
            message: "The system is temporarily unavailable.",
            error,
        });
    }

    const { User } = req.commonModels ?? {};
    const sessionUserId = req.session.user?.id;
    let idNumber = "";

    if (User && sessionUserId) {
        try {
            const userRecord = await User.findByPk(sessionUserId, {
                attributes: ["idNumber"],
            });

            if (userRecord?.idNumber) {
                idNumber = sanitizeIdNumber(userRecord.idNumber);
            }
        } catch (error) {
            console.error("Error while fetching user information:", error);
        }
    }

    const searchFilters = [];

    if (sessionUserId) {
        searchFilters.push({ goturUserId: sessionUserId });
    }

    if (idNumber) {
        searchFilters.push({ idNumber });
    }

    let tickets = [];
    let emptyMessage = "You don't have any tickets saved yet.";

    try {
        tickets = await fetchTicketsForUser({ searchFilters });

        if (!tickets.length && !idNumber) {
            emptyMessage = "Your tickets will appear here once they are linked to your account.";
        }
    } catch (error) {
        console.error("Error while fetching trips:", error);
        emptyMessage =
            "There was a problem loading your trips. Please try again later.";
    }

    return res.render("my-trips", {
        title: "My Trips",
        tickets,
        emptyMessage,
        hasIdNumber: Boolean(idNumber),
    });
};

exports.myAccount = (req, res) => {
    const currentUser = req.session?.user ?? null;
    res.render("user", { user: currentUser, title: "Götür | My Account" });
};