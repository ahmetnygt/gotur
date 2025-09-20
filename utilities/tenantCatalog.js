const { goturDB } = require("./goturDB");
const FirmFactory = require("../models/firmModel");

const Firm = FirmFactory(goturDB);

let cache = null;

/**
 * Uygulama açılırken çağır → cache'e firmaları alır
 */
async function loadTenants() {
    await goturDB.sync(); // firms tablosu yoksa oluşturur
    const rows = await Firm.findAll({ raw: true });
    cache = rows.map(r => ({ key: r.key, dbName: r.dbName }));
    return cache;
}

/**
 * Bellekteki firmaları getir
 */
function getTenantsSync() {
    return cache || [];
}

/**
 * Tek firmayı anahtarına göre bul
 */
function getTenantByKey(key) {
    const list = getTenantsSync();
    return list.find(t => t.key === key) || null;
}

module.exports = { loadTenants, getTenantsSync, getTenantByKey };
