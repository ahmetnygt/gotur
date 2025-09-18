var express = require('express');
var router = express.Router();
const tripController = require("../controllers/tripController")

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

// router.get('/get-trips', tripController.getTrips)

router.get('/trips/:route/:date', tripController.getTrips)

module.exports = router;
