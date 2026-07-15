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
    
    const sequelize = new Sequelize(tenant.dbName, process.env.DB_USER, process.env.DB_PASS, {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "mysql",
        logging: false,
    });

    const models = initModels(sequelize);

    // NOT: `sync()` (alter olmadan) sadece eksik tabloları oluşturur, VAR
    // OLAN tablolara yeni kolon eklemez veya kolon tipini düzeltmez (örn.
    // ticketModel.price'ın FLOAT'tan DECIMAL(12,2)'ye taşınması). goturyzhn
    // (ERP) bu tenant veritabanına `alter: true` ile bağlandığından, burada
    // da aynı stratejiyle tutarlı davranmak için `alter: true` kullanılıyor.
    await sequelize.sync({ alter: true });

    const entry = { sequelize, models };
    connections.set(firmKey, entry);
    return entry;
}

module.exports = { getTenantConnection };
