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

  return new Intl.DateTimeFormat("tr-TR", {
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

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

function mapTicketStatus(status) {
  const normalisedStatus = String(status || "").toLowerCase();

  const statusMap = {
    pending: { label: "Beklemede", cssClass: "status-pending" },
    reservation: { label: "Rezervasyon", cssClass: "status-pending" },
    canceled: { label: "İptal Edildi", cssClass: "status-canceled" },
    refund: { label: "İade Edildi", cssClass: "status-refund" },
    completed: { label: "Tamamlandı", cssClass: "" },
    web: { label: "Web", cssClass: "" },
    gotur: { label: "GöTÜR", cssClass: "" },
    open: { label: "Açık", cssClass: "" },
  };

  const mapping = statusMap[normalisedStatus] || {
    label: normalisedStatus ? normalisedStatus.toUpperCase() : "",
    cssClass: "",
  };

  return mapping;
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

  const firmKey = normaliseString(req.query?.firmKey);
  const pnr = normalisePnr(req.query?.pnr);
  const phone = normalisePhone(req.query?.phone);
  const email = normaliseEmail(req.query?.email);

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
        return res.json({ html: "", ticketCount: 0 });
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
      return res.json({ html: "", ticketCount: 0 });
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

      const { label: statusLabel, cssClass: statusClass } = mapTicketStatus(
        ticket.status
      );

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
        fromStop: fromStop
          ? { id: fromStop.id, title: fromStop.title }
          : null,
        toStop: toStop ? { id: toStop.id, title: toStop.title } : null,
        contactEmail: user?.email || "",
        createdAt: ticket.createdAt || null,
        createdAtFormatted: formatCreatedAt(ticket.createdAt),
        createdAtText: formatCreatedAt(ticket.createdAt),
        statusLabel,
        statusClass,
        firmKey,
      };
    });

    return res.render(
      "find-ticket-results",
      { tickets: responseTickets },
      (renderError, html) => {
        if (renderError) {
          console.error("Bilet arama sonuçları oluşturulurken hata oluştu:", renderError);
          return res.status(500).json({
            message: "Sonuçlar hazırlanırken bir sorun oluştu.",
          });
        }

        return res.json({
          html: html || "",
          ticketCount: responseTickets.length,
        });
      }
    );
  } catch (error) {
    console.error("Bilet arama hatası:", error);
    return res.status(500).json({
      message: "Biletler aranırken bir sorun oluştu.",
    });
  }
};
