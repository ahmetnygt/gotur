var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
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
