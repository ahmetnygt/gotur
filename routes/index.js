var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")
const ticketSearchController = require("../controllers/ticketSearchController");
const userController = require("../controllers/userController");
const { fetchRandomRouteSuggestions } = require("../utilities/randomRouteSuggestions");
const { Op } = require('sequelize');

/* GET home page. */
router.get('/', async function (req, res) {
  let promoRoutes = [];

  try {
    if (req.app?.locals?.waitForTenants) {
      await req.app.locals.waitForTenants();
    }

    const Place = req.commonModels?.Place;
    if (Place) {
      promoRoutes = await fetchRandomRouteSuggestions({
        Place,
        count: 6,
      });
    }
  } catch (error) {
    console.error("Anasayfa rota önerileri alınırken hata oluştu:", error);
  }

  let blogPosts = [];
  const Blog = req.commonModels?.Blog;

  if (Blog) {
    try {
      blogPosts = await Blog.findAll({
        order: [["createdAt", "DESC"]],
        limit: 4,
      });

      blogPosts = (Array.isArray(blogPosts) ? blogPosts : []).map((post) => {
        const plain = post?.get ? post.get({ plain: true }) : post;
        const tags = Array.isArray(plain?.tags)
          ? plain.tags
          : typeof plain?.tags === "string"
          ? plain.tags.split(",")
          : [];

        return {
          ...plain,
          tags: tags
            .map((tag) => String(tag || "").trim())
            .filter((tag) => tag.length > 0),
          createdAt: plain?.createdAt ? new Date(plain.createdAt) : null,
          displayDate: plain?.createdAt
            ? new Date(plain.createdAt).toLocaleDateString("tr-TR")
            : "",
        };
      });
    } catch (error) {
      console.error("Anasayfa blog yazıları alınırken hata oluştu:", error);
      blogPosts = [];
    }
  }

  res.render('index', {
    title: "Götür | Türkiye'nin en yeni online yazıhanesi",
    promoRoutes,
    blogPosts,
  });
});

router.get('/find-ticket', ticketSearchController.renderFindTicketPage);
router.get('/user/my-trips', userController.renderMyTripsPage);

router.get('/api/places', async (req, res) => {
  try {
    if (req.app?.locals?.waitForTenants) {
      await req.app.locals.waitForTenants();
    }

    const { Place } = req.commonModels ?? {};

    if (!Place) {
      return res.status(500).json({ message: 'Place modeli bulunamadı.' });
    }

    const places = await Place.findAll({
      attributes: ['id', 'title', 'provinceId'],
      order: [['title', 'ASC']],
      raw: true,
    });

    res.json(places);
  } catch (error) {
    console.error('Yerler alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Yerler alınamadı.' });
  }
});

router.get('/api/firms', async (req, res) => {
  try {
    if (req.app?.locals?.waitForTenants) {
      await req.app.locals.waitForTenants();
    }

    const { Firm } = req.commonModels ?? {};

    if (!Firm) {
      return res.status(500).json({ message: 'Firma modeli bulunamadı.' });
    }

    const firms = await Firm.findAll({
      where: { status: 'active' },
      attributes: ['key', 'displayName'],
      raw: true,
    });

    const normalized = firms
      .map((firm) => ({
        key: firm.key,
        displayName: firm.displayName || firm.key,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));

    res.json(normalized);
  } catch (error) {
    console.error('Firmalar alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Firmalar alınamadı.' });
  }
});

router.get('/api/find-ticket', ticketSearchController.searchTickets);

router.get('/api/places', async (req, res) => {
  try {
    if (req.app?.locals?.waitForTenants) {
      await req.app.locals.waitForTenants();
    }

    const { Place } = req.commonModels ?? {};

    if (!Place) {
      return res.status(500).json({ message: 'Place modeli bulunamadı.' });
    }

    const places = await Place.findAll({
      attributes: ['id', 'title', 'provinceId'],
      order: [['title', 'ASC']],
      raw: true,
    });

    res.json(places);
  } catch (error) {
    console.error('Yerler alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Yerler alınamadı.' });
  }
});

router.get('/trips/:route/:date', tripController.searchAllTrips)

router.get("/bus-ticket/:from-:to", async (req, res) => {
  const { from, to } = req.params;

  // normalize edilmiş parametreler
  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[çÇ]/g, "c")
      .replace(/[ğĞ]/g, "g")
      .replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o")
      .replace(/[şŞ]/g, "s")
      .replace(/[üÜ]/g, "u")
      .replace(/\s+/g, "-");

  const fromSlug = normalize(from);
  const toSlug = normalize(to);

  try {
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    );
    const defaultDate = `${tomorrow.getUTCFullYear()}-${String(
      tomorrow.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;

    const fromPlace = await req.commonModels.Place.findOne({
      where: {
        [Op.or]: [{ slug: fromSlug }, { title: from }],
      },
    });

    const toPlace = await req.commonModels.Place.findOne({
      where: {
        [Op.or]: [{ slug: toSlug }, { title: to }],
      },
    });

    if (!fromPlace || !toPlace) {
      return res.status(404).render("404", { message: "Rota bulunamadı." });
    }

    const title = `${fromPlace.title} ${toPlace.title} Otobüs Bileti - Götür`;
    const description = `${fromPlace.title}’den ${toPlace.title}’ne en uygun otobüs biletlerini Götür ile bulun. Güvenli, konforlu ve ekonomik seyahat için hemen yerinizi ayırtın.`;

    const defaultDateDisplay = tomorrow.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const defaultDateWeekday = tomorrow.toLocaleDateString("tr-TR", {
      weekday: "long",
    });

    const { trips: upcomingTrips } = await tripController.fetchTripsForRouteDate(req, {
      fromId: fromPlace.id,
      toId: toPlace.id,
      date: defaultDate,
    });

    const parseTimeToMinutes = (value) => {
      if (!value) {
        return Number.POSITIVE_INFINITY;
      }

      const [hour = "0", minute = "0"] = String(value).split(":");
      const h = Number(hour);
      const m = Number(minute);

      if (!Number.isFinite(h) || !Number.isFinite(m)) {
        return Number.POSITIVE_INFINITY;
      }

      return h * 60 + m;
    };

    const formatTime = (value) => {
      if (!value) return "--:--";
      const [hour = "00", minute = "00"] = String(value).split(":");
      return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    };

    const formatPrice = (value) => {
      const numeric = Number(value);

      if (!Number.isFinite(numeric) || numeric <= 0) {
        return "";
      }

      try {
        return new Intl.NumberFormat("tr-TR", {
          style: "currency",
          currency: "TRY",
          maximumFractionDigits: 0,
        }).format(numeric);
      } catch (error) {
        return `${numeric} TL`;
      }
    };

    const getFirmInitials = (text) => {
      const normalized = String(text || "").trim();
      if (!normalized) {
        return "?";
      }

      const parts = normalized.split(/\s+/);
      const initials = parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
      return initials || normalized.charAt(0).toUpperCase();
    };

    const popularTrips = (Array.isArray(upcomingTrips) ? upcomingTrips : [])
      .slice()
      .sort((a, b) => parseTimeToMinutes(a?.time) - parseTimeToMinutes(b?.time))
      .slice(0, 4)
      .map((trip) => {
        const timelineEntries = Array.isArray(trip?.routeTimeline)
          ? trip.routeTimeline.filter(Boolean)
          : [];
        const arrivalEntry = timelineEntries.length
          ? timelineEntries[timelineEntries.length - 1]
          : null;
        const firmLabel = trip?.firmName || trip?.firm || "Otobüs Firması";
        const priceText = formatPrice(trip?.price);
        const durationText =
          typeof trip?.duration === "string" && trip.duration.trim()
            ? trip.duration.trim()
            : "";
        return {
          firm: {
            name: firmLabel,
            key: trip.firm,
          },
          price: {
            primary: priceText || "Fiyat bekleniyor",
            secondary: priceText
              ? "Kişi başı bilet"
              : "Satın alma sırasında netleşir",
            hasValue: Boolean(priceText),
          },
          departure: {
            time: formatTime(trip?.time),
            location: trip?.fromStr || "",
          },
          arrival: {
            time: formatTime(arrivalEntry?.time || trip?.arrivalTime),
            location: arrivalEntry?.title || trip?.toStr || "",
          },
          routeTitle: `${trip?.fromStr || "Kalkış"} → ${trip?.toStr || "Varış"}`,
          durationText,
          features: Array.isArray(trip?.busFeatures)
            ? trip.busFeatures.map((feature) => ({
              icon: feature?.icon || null,
              label: feature?.label || "Özellik",
            }))
            : [],
        };
      });

    let blogPosts = [];
    const Blog = req.commonModels?.Blog;

    if (Blog) {
      try {
        const tagConditions = [];

        if (fromSlug) {
          tagConditions.push({ tags: { [Op.like]: `%${fromSlug}%` } });
        }

        if (toSlug) {
          tagConditions.push({ tags: { [Op.like]: `%${toSlug}%` } });
        }

        if (tagConditions.length > 0) {
          blogPosts = await Blog.findAll({
            where: {
              [Op.or]: tagConditions,
            },
            order: [["createdAt", "DESC"]],
            limit: 4,
          });
        }

        if (!Array.isArray(blogPosts) || blogPosts.length === 0) {
          const fallbackQuery = {
            limit: 4,
          };

          if (Blog.sequelize?.random) {
            fallbackQuery.order = Blog.sequelize.random();
          } else if (Blog.sequelize?.literal) {
            fallbackQuery.order = [Blog.sequelize.literal("RAND()")];
          } else {
            fallbackQuery.order = [["createdAt", "DESC"]];
          }

          blogPosts = await Blog.findAll(fallbackQuery);
        }

        blogPosts = (Array.isArray(blogPosts) ? blogPosts : []).map((post) => {
          const plain = post?.get ? post.get({ plain: true }) : post;
          const tags = Array.isArray(plain?.tags)
            ? plain.tags
            : typeof plain?.tags === "string"
            ? plain.tags.split(",")
            : [];

          return {
            ...plain,
            tags: tags
              .map((tag) => String(tag || "").trim())
              .filter((tag) => tag.length > 0),
            createdAt: plain?.createdAt ? new Date(plain.createdAt) : null,
            displayDate: plain?.createdAt
              ? new Date(plain.createdAt).toLocaleDateString("tr-TR")
              : "",
          };
        });
      } catch (error) {
        console.error("Blog yazıları alınırken hata oluştu:", error);
        blogPosts = [];
      }
    }

    res.render("bus-ticket", {
      fromTitle: fromPlace.title,
      toTitle: toPlace.title,
      fromValue: fromPlace.id,
      toValue: toPlace.id,
      defaultDate,
      defaultDateDisplay,
      defaultDateWeekday,
      popularTrips,
      blogPosts,
      title,
      description,
      request: req
    });
  } catch (err) {
    console.error("Hata:", err);
    res.status(500).render("500", { message: "Bir hata oluştu." });
  }
});

router.post('/payment', tripController.createTicketPayment)
router.get('/payment/:ticketPaymentId', tripController.renderPaymentPage)
router.post('/payment/:ticketPaymentId/complete', tripController.completePayment)
router.get('/payment/:ticketPaymentId/success', tripController.renderPaymentSuccess)

// router.get('/payment/:route/:date', tripController.getTrips)

module.exports = router;
