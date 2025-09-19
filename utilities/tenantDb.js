const { Sequelize } = require("sequelize");
const initModels = require("./initModels"); // senin tüm modelleri toplayan dosyan
const { getTenantByKey } = require("./tenantCatalog");

const connections = new Map();

/**
 * Belirli bir firmanın veritabanı bağlantısını getirir.
 * Daha önce oluşturulduysa cache’den döner.
 */
async function getTenantConnection(firmKey) {
    if (connections.has(firmKey)) {
        return connections.get(firmKey);
    }

    const tenant = getTenantByKey(firmKey);
    if (!tenant) {
        throw new Error(`Tenant bulunamadı: ${firmKey}`);
    }

    const sequelize = new Sequelize(
        tenant.dbName,
        "doadmin",
        "AVNS_rfP7FS1Hdg-KSHpn02u",
        {
            host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
            port: 25060,
            dialect: "mysql",
            logging: false,
            pool: {
                max: 10,
                min: 0,
                idle: 10000,
            },
        }
    );

    const models = initModels(sequelize);

    // Geliştirme aşamasında tabloların oluşması için:
    await sequelize.sync();

    const entry = { sequelize, models };
    connections.set(firmKey, entry);
    return entry;
}

module.exports = { getTenantConnection };
