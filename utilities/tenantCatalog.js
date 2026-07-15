const { goturDB } = require("./goturDb");
const FirmFactory = require("../models/firmModel");

const Firm = FirmFactory(goturDB);

// Tenant anahtarları (ve dolaylı olarak DB adları) sadece küçük harf, rakam
// ve alt çizgiden oluşabilir. goturyzhn/utilities/tenantConfig.js ile aynı
// desen: enjeksiyon/istismar riski taşımayan bir whitelist doğrulaması.
const TENANT_KEY_PATTERN = /^[a-z0-9_]+$/i;

function isValidTenantKey(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && TENANT_KEY_PATTERN.test(value);
}

let cache = null;

// GÜVENLİK/BUG DÜZELTMESİ: Önceden burada `status` hiç kontrol edilmiyordu;
// ERP'de pasife alınan bir firma, bu (bellek içi) katalogda hâlâ mevcut
// olduğu sürece rezervasyon sitesinden erişilebiliyordu. Artık sadece
// `active` firmalar yükleniyor, ve dbName formatı doğrulanıyor.
async function loadTenants() {
    await goturDB.sync(); // firms tablosu yoksa oluşturur
    const rows = await Firm.findAll({ where: { status: "active" }, raw: true });
    cache = rows
        .filter((r) => isValidTenantKey(r.dbName))
        .map((r) => ({ key: r.key, dbName: r.dbName }));
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

// BUG DÜZELTMESİ: Katalog önceden SADECE uygulama açılırken bir kez
// yükleniyordu; ERP'de eklenen yeni bir firma veya değiştirilen bir durum
// (active/inactive), gotur süreci yeniden başlatılmadan hiç yansımıyordu.
// Artık periyodik olarak (varsayılan 5 dakika) yenileniyor.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function startPeriodicRefresh() {
    const timer = setInterval(() => {
        loadTenants().catch((error) => {
            console.error("Tenant katalogu yenilenirken hata oluştu:", error);
        });
    }, REFRESH_INTERVAL_MS);
    timer.unref?.();
    return timer;
}

module.exports = { loadTenants, getTenantsSync, getTenantByKey, isValidTenantKey, startPeriodicRefresh };
