const { Op } = require("sequelize");
const { getTenantConnection } = require("../utilities/tenantDb");

function normaliseString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalisePnr(value) {
  return normaliseString(value).toUpperCase();
}

function normalisePhone(value) {
  return normaliseString(value).replace(/\D+/g, "");
}

function normaliseEmail(value) {
  return normaliseString(value).toLowerCase();
}

function formatCreatedAt(dateValue) {
  if (!dateValue) {
    return "";
  }

  try {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    return "";
  }
}

function formatTripDate(dateString) {
  if (!dateString) {
    return "";
  }

  try {
    const formatter = new Intl.DateTimeFormat("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return formatter.format(new Date(`${dateString}T00:00:00`));
  } catch (error) {
    return "";
  }
}

function formatTripTime(timeString) {
  if (!timeString) {
    return "";
  }

  const [hours = "00", minutes = "00"] = String(timeString).split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function formatPhoneNumber(value) {
  const digits = normalisePhone(value).slice(0, 10);
  const segments = [];

  if (digits.length > 0) {
    segments.push(digits.slice(0, 3));
  }
  if (digits.length > 3) {
    segments.push(digits.slice(3, 6));
  }
  if (digits.length > 6) {
    segments.push(digits.slice(6, 8));
  }
  if (digits.length > 8) {
    segments.push(digits.slice(8, 10));
  }

  return segments.join(" ");
}

function getStatusInfo(status) {
  const normalised = normaliseString(status).toLowerCase();

  if (!normalised) {
    return { label: "", className: "" };
  }

  if (normalised === "pending") {
    return { label: "Beklemede", className: "status-pending" };
  }

  if (normalised === "canceled" || normalised === "refund") {
    return { label: "İptal", className: "status-canceled" };
  }

  if (["completed", "web", "gotur"].includes(normalised)) {
    return { label: "Onaylandı", className: "" };
  }

  return { label: status, className: "" };
}

function buildTicketViewModel(ticket) {
  if (!ticket) {
    return null;
  }

  const fallbackIdentifier = `ticket-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const identifierSource = ticket.id ?? ticket.pnr ?? fallbackIdentifier;
  const trimmedIdentifier = String(identifierSource).trim();
  const ticketId = trimmedIdentifier
    ? trimmedIdentifier.replace(/[^a-zA-Z0-9_-]/g, "-")
    : fallbackIdentifier;

  const fromTitle =
    ticket.fromStop?.title || ticket.trip?.fromPlace || "";
  const toTitle = ticket.toStop?.title || ticket.trip?.toPlace || "";
  const statusInfo = getStatusInfo(ticket.status);

  return {
    id: ticketId,
    passengerName: ticket.passenger?.fullName || "",
    pnr: ticket.pnr || "",
    fromTitle,
    toTitle,
    tripDate: formatTripDate(ticket.trip?.date),
    tripTime: formatTripTime(ticket.trip?.time),
    seatNo: ticket.seatNo || "",
    phoneNumber: formatPhoneNumber(ticket.phoneNumber),
    contactEmail: ticket.contactEmail || "",
    statusLabel: statusInfo.label,
    statusClass: statusInfo.className,
    createdAtText: ticket.createdAtFormatted || "",
  };
}

function renderTicketResultsView(app, locals) {
  if (!app) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    app.render("components/find-ticket-results", locals, (error, html) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(html || "");
    });
  });
}

async function ensureTenantsReady(req) {
  if (req.app?.locals?.waitForTenants) {
    await req.app.locals.waitForTenants();
  }
}

exports.renderFindTicketPage = async (req, res) => {
  try {
    await ensureTenantsReady(req);
  } catch (error) {
    console.error("Find ticket sayfası yüklenirken hata oluştu:", error);
  }

  res.render("find-ticket", {
    title: "Biletimi Bul",
    tickets: [],
    resultsMessage: "Henüz arama yapılmadı.",
  });
};

exports.searchTickets = async (req, res) => {
  try {
    await ensureTenantsReady(req);
  } catch (error) {
    console.error("Find ticket arama ön hazırlık hatası:", error);
    return res.status(500).json({
      message: "Sistem hazır değil. Lütfen daha sonra tekrar deneyin.",
    });
  }

  const firmKey = normaliseString(req.body?.firmKey);
  const pnr = normalisePnr(req.body?.pnr);
  const phone = normalisePhone(req.body?.phone);
  const email = normaliseEmail(req.body?.email);

  const defaultEmptyMessage = "Eşleşen bilet bulunamadı.";
  const sendTicketResponse = async (
    tickets,
    emptyMessage = defaultEmptyMessage
  ) => {
    const viewTickets = tickets
      .map((ticket) => buildTicketViewModel(ticket))
      .filter(Boolean);

    try {
      const html = await renderTicketResultsView(req.app, {
        tickets: viewTickets,
        emptyMessage,
      });

      return res.json({
        html,
        ticketCount: viewTickets.length,
      });
    } catch (renderError) {
      console.error(
        "Bilet sonuçları render edilirken hata oluştu:",
        renderError
      );
      return res.status(500).json({
        message: "Biletler hazırlanırken bir sorun oluştu.",
      });
    }
  };

  if (!firmKey) {
    return res.status(400).json({ message: "Lütfen bir firma seçin." });
  }

  if (!pnr && !phone && !email) {
    return res.status(400).json({
      message: "Lütfen PNR veya iletişim bilgilerinizden en az birini girin.",
    });
  }

  try {
    const connection = await getTenantConnection(firmKey);
    if (!connection || !connection.models) {
      return res.status(500).json({
        message: "Firma bağlantısı kurulamadı.",
      });
    }

    const { Ticket, Trip, RouteStop, Stop, User } = connection.models;

    if (!Ticket || !Trip || !RouteStop || !Stop) {
      return res.status(500).json({
        message: "Firma veritabanında gerekli tablolar bulunamadı.",
      });
    }

    const andConditions = [];

    if (pnr) {
      andConditions.push({ pnr });
    }

    const contactConditions = [];
    if (phone) {
      contactConditions.push({ phoneNumber: phone });
    }

    let userEmailUserIds = [];
    if (email && User) {
      const matchingUsers = await User.findAll({
        where: { email },
        attributes: ["id"],
        raw: true,
      });

      userEmailUserIds = matchingUsers
        .map((user) => user?.id)
        .filter((id) => Number.isFinite(Number(id)));

      if (userEmailUserIds.length) {
        contactConditions.push({ userId: { [Op.in]: userEmailUserIds } });
      } else if (!phone && !pnr) {
        return sendTicketResponse([], defaultEmptyMessage);
      }
    }

    if (contactConditions.length) {
      andConditions.push({ [Op.or]: contactConditions });
    }

    const whereClause = andConditions.length ? { [Op.and]: andConditions } : {};

    const tickets = await Ticket.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    if (!tickets.length) {
      return sendTicketResponse([], defaultEmptyMessage);
    }

    const tripIds = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.tripId)
          .filter((tripId) => Number.isFinite(Number(tripId)))
      )
    );

    const fromRouteStopIds = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.fromRouteStopId)
          .filter((id) => Number.isFinite(Number(id)))
      )
    );
    const toRouteStopIds = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.toRouteStopId)
          .filter((id) => Number.isFinite(Number(id)))
      )
    );

    const allRouteStopIds = Array.from(
      new Set([...fromRouteStopIds, ...toRouteStopIds])
    );

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
          .filter((id) => Number.isFinite(Number(id)))
      )
    );

    const stops = stopIds.length
      ? await Stop.findAll({ where: { id: { [Op.in]: stopIds } }, raw: true })
      : [];

    const usersById = new Map();
    if (User) {
      const ticketUserIds = Array.from(
        new Set(
          tickets
            .map((ticket) => ticket.userId)
            .filter((id) => Number.isFinite(Number(id)))
        )
      );

      if (ticketUserIds.length) {
        const userRows = await User.findAll({
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
    const routeStopMap = new Map(
      routeStops.map((routeStop) => [String(routeStop.id), routeStop])
    );
    const stopMap = new Map(stops.map((stop) => [String(stop.id), stop]));

    const responseTickets = tickets.map((ticket) => {
      const trip = tripMap.get(String(ticket.tripId)) || null;
      const fromRouteStop = routeStopMap.get(String(ticket.fromRouteStopId));
      const toRouteStop = routeStopMap.get(String(ticket.toRouteStopId));
      const fromStop = fromRouteStop
        ? stopMap.get(String(fromRouteStop.stopId))
        : null;
      const toStop = toRouteStop ? stopMap.get(String(toRouteStop.stopId)) : null;
      const user = ticket.userId
        ? usersById.get(String(ticket.userId)) || null
        : null;

      const passengerName = [ticket.name, ticket.surname]
        .filter((part) => Boolean(part))
        .join(" ")
        .trim();

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
        trip: trip
          ? {
              id: trip.id,
              date: trip.date || null,
              time: trip.time || null,
              fromPlace: trip.fromPlaceString || "",
              toPlace: trip.toPlaceString || "",
            }
          : null,
        fromStop: fromStop
          ? { id: fromStop.id, title: fromStop.title }
          : null,
        toStop: toStop ? { id: toStop.id, title: toStop.title } : null,
        contactEmail: user?.email || "",
        createdAt: ticket.createdAt || null,
        createdAtFormatted: formatCreatedAt(ticket.createdAt),
        firmKey,
      };
    });

    return sendTicketResponse(responseTickets, defaultEmptyMessage);
  } catch (error) {
    console.error("Bilet arama hatası:", error);
    return res.status(500).json({
      message: "Biletler aranırken bir sorun oluştu.",
    });
  }
};
