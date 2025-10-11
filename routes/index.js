var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")
const ticketSearchController = require("../controllers/ticketSearchController");
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

  res.render('index', {
    title: "Götür | Türkiye'nin en yeni online yazıhanesi",
    promoRoutes,
  });
});

router.get('/find-ticket', ticketSearchController.renderFindTicketPage);

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

    res.render("bus-ticket", {
      fromTitle: fromPlace.title,
      toTitle: toPlace.title,
      fromValue: fromPlace.id,
      toValue: toPlace.id,
      defaultDate,
      defaultDateDisplay,
      defaultDateWeekday,
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
