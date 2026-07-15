require("dotenv").config();
const { Sequelize } = require("sequelize");
const PlaceFactory = require("../models/placeModel");
const FirmFactory = require("../models/firmModel");
const UserFactory = require("../models/userModel");
const BlogFactory = require("../models/blogModel");
const TicketPaymentFactory = require("../models/ticketPaymentModel");
const placesSeedData = require("../places.json");

const goturDB = new Sequelize(process.env.DB_GOTUR_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
});

let cachedModels = null;
let goturSyncPromise = null;

function initGoturModels() {
    if (!cachedModels) {
        const Place = PlaceFactory(goturDB);
        const User = UserFactory(goturDB);
        const Firm = FirmFactory(goturDB);
        const Blog = BlogFactory(goturDB);
        // TicketPayment, goturyzhn (ERP) ile PAYLAŞILAN ortak veritabanında
        // yaşar (bkz. goturyzhn/utilities/goturDb.js). Bu sayede web'den
        // alınan bir ödeme kaydı, tenantKey ile etiketlenip ERP tarafından da
        // güvenle (tenant izolasyonu bozulmadan) görülebilir/yönetilebilir.
        const TicketPayment = TicketPaymentFactory(goturDB);

        cachedModels = { Place, Firm, User, Blog, TicketPayment };

        // Senkronizasyonu tetikle (idempotent; bkz. getGoturSyncPromise).
        getGoturSyncPromise();
    }

    return cachedModels;
}

async function getGoturSyncPromise() {
    if (!goturSyncPromise) {
        // NOT: `sync({})` sadece eksik tabloları oluşturur, VAR OLAN tablolara
        // yeni kolon eklemez (örn. TicketPayment.tenantKey). goturyzhn ile aynı
        // ortak veritabanını paylaştığımızdan, şema değişikliklerinin (örn.
        // tenantKey eklenmesi) burada da yansıması için `alter: true`
        // kullanılıyor.
        goturSyncPromise = goturDB.sync({ alter: true })
            .then(async () => {
                const Place = cachedModels?.Place;
                if (Place) {
                    const placeCount = await Place.count();

                    if (placeCount === 0 && Array.isArray(placesSeedData) && placesSeedData.length > 0) {
                        await Place.bulkCreate(placesSeedData, { ignoreDuplicates: true });
                    }
                }
            })
            .catch((error) => {
                goturSyncPromise = null;
                console.error("Ortak veritabanı senkronizasyonu/başlangıç verileri yüklenirken hata oluştu:", error);
                throw error;
            });
    }

    return goturSyncPromise;
}

module.exports = { goturDB, initGoturModels, getGoturSyncPromise };
