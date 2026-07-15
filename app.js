require("dotenv").config();

var createError = require("http-errors");
var express = require("express");
var path = require("path");
const session = require("express-session");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var blogRouter = require("./routes/blog");

const { goturDB, initGoturModels } = require("./utilities/goturDb");
const { loadTenants, startPeriodicRefresh } = require("./utilities/tenantCatalog");
const { ensureCsrfToken, verifyCsrfToken } = require("./middlewares/csrf");
const SequelizeStore = require("connect-session-sequelize")(session.Store);

var store = new SequelizeStore({
  db: goturDB,
});
store.sync(); // Sessions tablosu otomatik oluşur

var app = express();

const isProduction = app.get("env") === "production";

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "anadolutat")) {
  // eslint-disable-next-line no-console
  console.error(
    "UYARI: SESSION_SECRET .env üzerinde tanımlanmamış veya varsayılan değerde. " +
    "Production ortamında güçlü, benzersiz bir SESSION_SECRET ayarlanmalı."
  );
}
const sessionSecret = process.env.SESSION_SECRET || "anadolutat";

if (isProduction) {
  app.set("trust proxy", 1);
}

let tenantInitError = null;
const tenantsReady = (async () => {
  try {
    await goturDB.authenticate();
    console.log("Gotur DB bağlantısı başarılı.");
    await loadTenants();
    console.log("Tenant katalogu başarıyla yüklendi.");
    // BUG DÜZELTMESİ: Katalog artık periyodik olarak yenileniyor; ERP'de
    // eklenen/durumu değiştirilen firmalar süreç yeniden başlatılmadan da
    // yansır (bkz. utilities/tenantCatalog.js).
    startPeriodicRefresh();
  } catch (error) {
    tenantInitError = error;
    console.error("Tenant katalogu yüklenirken hata oluştu:", error);
  }
})();

app.locals.waitForTenants = async () => {
  await tenantsReady;
  if (tenantInitError) {
    throw tenantInitError;
  }
};

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// GÜVENLİK: helmet ile temel HTTP güvenlik başlıkları (X-Frame-Options,
// X-Content-Type-Options, HSTS vb.) ekleniyor. CSP kapalı bırakıldı çünkü
// mevcut Pug şablonları geniş çapta satır-içi <script>/<style> ve harici CDN
// script'leri kullanıyor; varsayılan CSP tüm arayüzü kırardı. Ayrı bir görev
// olarak, şablonlar nonce/hash tabanlı CSP'ye uyumlu hale getirildikten sonra
// etkinleştirilebilir (goturyzhn'deki aynı yaklaşımla tutarlı).
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// GÜVENLİK: Brute-force login/register denemelerini sınırlamak için rate limit.
// routes/users.js'deki POST /login ve /register rotalarında uygulanıyor.
app.set(
  "authRateLimiter",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin." },
  })
);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "node_modules")));

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: store,
    // GÜVENLİK: cookie'ler production'da secure (HTTPS-only) ve sameSite=lax
    // olarak işaretleniyor; CSRF ve HTTP üzerinden çalınma riskini azaltır.
    // Local/geliştirme ortamı HTTPS kullanmadığından secure orada kapalı
    // bırakılıyor (aksi halde session hiç kalıcı olmazdı).
    cookie: {
      maxAge: 86400000, // 1 gün
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  })
);

// GÜVENLİK: CSRF koruması (double submit cookie) - bkz. middlewares/csrf.js.
// Session'dan sonra, route'lardan önce uygulanmalı.
app.use(ensureCsrfToken);
app.use(verifyCsrfToken);

app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user ?? null;
  next();
});

// ✅ ortak modelleri request'e ekle
app.use((req, res, next) => {
  req.commonModels = initGoturModels();
  next();
});

// routerlar
app.use("/", indexRouter);
app.use("/user", usersRouter);
app.use("/blog", blogRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
