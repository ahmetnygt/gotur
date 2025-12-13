require("dotenv").config();
const { Sequelize } = require("sequelize");
const PlaceFactory = require("../models/placeModel");
const FirmFactory = require("../models/firmModel");
const UserFactory = require("../models/userModel");
const BlogFactory = require("../models/blogModel");
const placesSeedData = require("../places.json");

const goturDB = new Sequelize(process.env.DB_GOTUR_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
});

let cachedModels = null;
let seedPromise = null;

async function seedPlacesIfNecessary(Place) {
    try {
        await goturDB.sync();
        const placeCount = await Place.count();

        if (placeCount === 0 && Array.isArray(placesSeedData) && placesSeedData.length > 0) {
            await Place.bulkCreate(placesSeedData, { ignoreDuplicates: true });
        }
    } catch (error) {
        console.error("Places tablosu başlangıç verileri yüklenirken hata oluştu:", error);
    }
}

function initGoturModels() {
    if (!cachedModels) {
        const Place = PlaceFactory(goturDB);
        const User = UserFactory(goturDB);
        const Firm = FirmFactory(goturDB);
        const Blog = BlogFactory(goturDB);

        cachedModels = { Place, Firm, User, Blog };

        if (!seedPromise) {
            seedPromise = seedPlacesIfNecessary(Place);
        }
    }

    return cachedModels;
}

module.exports = { goturDB, initGoturModels };
