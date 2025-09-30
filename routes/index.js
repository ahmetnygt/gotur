var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")
const { fetchRandomRouteSuggestions } = require("../utilities/randomRouteSuggestions");

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

router.post('/payment', tripController.createTicketPayment)
router.get('/payment/:ticketPaymentId', tripController.renderPaymentPage)
router.post('/payment/:ticketPaymentId/complete', tripController.completePayment)
router.get('/payment/:ticketPaymentId/success', tripController.renderPaymentSuccess)

// router.get('/payment/:route/:date', tripController.getTrips)

module.exports = router;
