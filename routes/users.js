const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/", userController.redirectToPersonalInformation);
router.get("/personal-information", userController.personalInformation);
router.post("/personal-information", userController.updatePersonalInformation);
router.post(
  "/personal-information/change-password",
  userController.changePassword,
);
router.get("/cards", userController.myAccount);
router.get("/passengers", userController.myAccount);

// GÜVENLİK: app.js'de tanımlanan authRateLimiter, brute-force login/kayıt
// denemelerini sınırlamak için burada uygulanıyor.
function withAuthRateLimit(req, res, next) {
  const limiter = req.app.get("authRateLimiter");
  if (limiter) return limiter(req, res, next);
  return next();
}

router.post("/login", withAuthRateLimit, userController.login);
router.post("/register", withAuthRateLimit, userController.register);
router.post("/logout", userController.logout);

module.exports = router;
