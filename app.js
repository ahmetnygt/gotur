var createError = require("http-errors");
var express = require("express");
var path = require("path");
const session = require("express-session");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");

const { goturDB, initGoturModels } = require("./utilities/goturDb");
const { loadTenants } = require("./utilities/tenantCatalog");
const SequelizeStore = require("connect-session-sequelize")(session.Store);

var store = new SequelizeStore({
  db: goturDB,
});
store.sync(); // Sessions tablosu otomatik oluşur

var app = express();

let tenantInitError = null;
const tenantsReady = (async () => {
  try {
    await goturDB.authenticate();
    console.log("Gotur DB bağlantısı başarılı.");
    await loadTenants();
    console.log("Tenant katalogu başarıyla yüklendi.");
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

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "node_modules")));

app.use(
  session({
    secret: "anadolutat",
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
      maxAge: 86400000, // 1 gün
    },
  })
);

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
