const { Sequelize } = require("sequelize");

// 🔑 Ortak DB connection
const goturDb = new Sequelize("gotur", "doadmin", "AVNS_rfP7FS1Hdg-KSHpn02u", {
    host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
    port: 25060,
    dialect: "mysql",
    logging: false,
});

// 📌 modelleri import et
// const UserFactory = require("../models/userModel");
const PlaceFactory = require("../models/placeModel");
const FirmFactory = require("../models/firmModel");

function initGoturModels() {
    // const User = UserFactory(goturDb);
    const Place = PlaceFactory(goturDb);
    const Firm = FirmFactory(goturDb);

    return { Place, Firm };
}

module.exports = { goturDb, initGoturModels };
