const { getTenantConnection } = require("../utilities/tenantDb");

module.exports = async (req, res, next) => {
    try {
        // URL param, query veya header'dan firma seç
        const firmKey =
            req.params.firm ||
            req.query.firm ||
            req.headers["x-firm"];

        if (!firmKey) {
            return res.status(400).json({ error: "Firma belirtilmedi." });
        }

        const { sequelize, models } = await getTenantConnection(firmKey);

        req.db = sequelize;
        req.models = models;
        req.firmKey = firmKey;

        next();
    } catch (err) {
        console.error("firmPicker hata:", err);
        res.status(500).json({ error: "Firma bağlantısı kurulamadı." });
    }
};
