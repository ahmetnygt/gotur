const { getTenantConnection } = require("../utilities/tenantDb");
const generateVerificationCode = require("../utilities/generateVerificationCode");
const { sendVerification } = require("../utilities/sendVerification");
const verificationCache = require("../utilities/verificationCache");

function normaliseString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalisePnr(value) {
  return normaliseString(value).toUpperCase();
}

function normaliseCode(value) {
  return normaliseString(value).replace(/\D+/g, "");
}

async function ensureTenantsReady(req) {
  if (req.app?.locals?.waitForTenants) {
    await req.app.locals.waitForTenants();
  }
}

function buildCacheKey(firmKey, pnr) {
  return `${firmKey}:${pnr}`;
}

exports.requestVerificationCode = async (req, res) => {
  try {
    await ensureTenantsReady(req);
  } catch (error) {
    console.error("Tenant yüklenirken hata oluştu:", error);
    return res.status(500).json({ success: false, message: "Sistem hazır değil." });
  }

  const pnr = normalisePnr(req.body?.pnr);
  const firmKey = normaliseString(req.body?.firmKey);

  if (!pnr) {
    return res
      .status(400)
      .json({ success: false, message: "PNR bilgisi gereklidir." });
  }

  if (!firmKey) {
    return res
      .status(400)
      .json({ success: false, message: "Firma bilgisi gereklidir." });
  }

  try {
    const connection = await getTenantConnection(firmKey);
    const { Ticket } = connection.models || {};

    if (!Ticket) {
      return res
        .status(500)
        .json({ success: false, message: "Ticket modeli bulunamadı." });
    }

    const ticket = await Ticket.findOne({ where: { pnr } });

    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Bilet bulunamadı." });
    }

    const verificationCode = generateVerificationCode();
    const cacheKey = buildCacheKey(firmKey, pnr);

    verificationCache.set(cacheKey, {
      code: verificationCode,
      firmKey,
      ticketId: ticket.id,
      pnr,
    });

    await sendVerification({
      phoneNumber: ticket.phoneNumber,
      emailAddress: ticket.email,
      code: verificationCode,
      pnr,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Doğrulama kodu gönderilirken hata oluştu:", error);
    return res
      .status(500)
      .json({ success: false, message: "Doğrulama kodu gönderilemedi." });
  }
};

exports.verifyCancellation = async (req, res) => {
  try {
    await ensureTenantsReady(req);
  } catch (error) {
    console.error("Tenant yüklenirken hata oluştu:", error);
    return res.status(500).json({ success: false, message: "Sistem hazır değil." });
  }

  const pnr = normalisePnr(req.body?.pnr);
  const firmKey = normaliseString(req.body?.firmKey);
  const code = normaliseCode(req.body?.code);

  if (!pnr || !firmKey || !code) {
    return res.status(400).json({
      success: false,
      message: "PNR, firma ve doğrulama kodu gereklidir.",
    });
  }

  try {
    const cacheKey = buildCacheKey(firmKey, pnr);
    const cachedVerification = verificationCache.get(cacheKey);

    if (!cachedVerification || cachedVerification.code !== code) {
      return res.json({ success: false, message: "Invalid code" });
    }

    const connection = await getTenantConnection(firmKey);
    const { Ticket } = connection.models || {};

    if (!Ticket) {
      return res
        .status(500)
        .json({ success: false, message: "Ticket modeli bulunamadı." });
    }

    const ticket = await Ticket.findOne({ where: { pnr } });

    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Bilet bulunamadı." });
    }

    ticket.status = "canceled";
    await ticket.save();

    verificationCache.del(cacheKey);

    return res.json({ success: true });
  } catch (error) {
    console.error("Bilet iptali doğrulanırken hata oluştu:", error);
    return res
      .status(500)
      .json({ success: false, message: "İşlem tamamlanamadı." });
  }
};
