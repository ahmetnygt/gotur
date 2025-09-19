var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/trips/:route/:date', tripController.searchAllTrips)

// router.get('/payment/:route/:date', tripController.getTrips)

module.exports = router;
