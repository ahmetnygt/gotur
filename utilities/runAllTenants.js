const { getTenantsSync } = require("./tenantCatalog");
const { getTenantConnection } = require("./tenantDb");

/**
 * Tüm tenant'larda aynı işlemi çalıştırır.
 * @param {Function} fnPerTenant async ({ firmKey, models, sequelize }) => any
 * @returns {Promise<Array<{ firmKey, result }>>}
 */
async function runForAllTenants(fnPerTenant) {
    const tenants = getTenantsSync();
    const results = [];

    for (const t of tenants) {
        try {
            const { sequelize, models } = await getTenantConnection(t.key);
            const r = await fnPerTenant({ firmKey: t.key, models, sequelize });
            results.push({ firmKey: t.key, result: r });
        } catch (err) {
            console.error(`Tenant ${t.key} hata:`, err);
            results.push({ firmKey: t.key, error: err.message });
        }
    }

    return results;
}

module.exports = { runForAllTenants };