var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Götür' });
});

router.get('/trips/:route/:date', tripController.searchAllTrips)

router.post('/payment', tripController.createTicketPayment)
router.get('/payment/:ticketPaymentId', tripController.renderPaymentPage)
router.post('/payment/:ticketPaymentId/complete', tripController.completePayment)
router.get('/payment/:ticketPaymentId/success', tripController.renderPaymentSuccess)

// router.get('/payment/:route/:date', tripController.getTrips)

module.exports = router;
