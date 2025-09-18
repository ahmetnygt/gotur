var express = require('express');
var router = express.Router();
const ticketController = require("../controllers/tripController")

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/get-trips', ticketController.getTrips)

module.exports = router;
