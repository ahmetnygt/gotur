import nodemailer from "nodemailer";
import fs from "fs";

// ======================= //
//   LOGO DOSYALARI        //
// ======================= //

const LOGO_GOTUR = "./public/images/gotur_vip_logo_white.png";
const LOGO_FIRMA = "./public/images/anafartalarturizm.png";

const logos = [LOGO_GOTUR, LOGO_FIRMA];
for (const l of logos) if (!fs.existsSync(l)) console.log("⚠ Eksik logo →", l);

// ======================= //
//  MAIL VERİLERİ          //
// ======================= //

const data = {
    firmaAdi: "Anafartalar VIP",
    firmaTel: "0549 790 00 17",
    tarih: "17.11.2025",
    saat: "01:00",
    kalkis: "Çanakkale İskele",
    varis: "İstanbul Esenler",
    pnr: "3G801ERSF",
    koltuklar: "24 - 25",
    yolcular: [
        { ad: "Tülay Öztürk", koltuk: "24", ucret: "850₺", cinsiyet: "Kadın" },
        { ad: "Nehir Öztürk", koltuk: "25", ucret: "850₺", cinsiyet: "Kadın" }
    ],
    pdf: "https://gotur.link/pdf/3G801ERSF",
    link: "https://gotur.app/pnr/3G801ERSF",
};

// ======================= HTML ======================= //

const HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width">

<!-- FONT AWESOME ICONS -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<style>
body{margin:0;background:#f4f6f9;font-family:Arial, Helvetica, sans-serif;}
.container{max-width:620px;margin:auto;background:#fff;border-radius:10px;overflow:hidden}

/* GÖTÜR HEADER */
.header{
    background:#2660FF;
    padding:22px;
    text-align:center;
}
.header img{
    height:32px;           /* ↓↓ Küçültüldü */
    max-width:120px;       /* ↓↓ Masaüstü sabitlendi */
    object-fit:contain;
}

/* FIRMA BİLGİSİ BLOĞU - YAPIŞIKLIK TEMİZLENDİ */
.firma-box{
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap:18px;                /* ↑ spacing artırıldı */
    padding:18px 22px;
    background:#f8f8f8;
    border-bottom:1px solid #e4e4e4;
}
.firma-box img{
    height:32px;            /* ↓ daha küçük logo */
    max-width:110px;
    object-fit:contain;
}
.firma-info{
    font-size:14px;
    line-height:1.45;
}
.firma-info strong{font-size:16px}

/* PNR ALANI — Artık GERÇEK background var */
.pnr-box{
    text-align:center;
    font-size:26px;
    font-weight:900;
    color:#2660FF;
    background:#ffffff;
    border-bottom:2px solid #d9d9d9;
    padding:22px;
}

/* SEFER */
.section{
    padding:20px 22px;
    border-bottom:1px solid #ececec;
}
.title{font-size:16px;font-weight:bold;margin-bottom:8px;color:#111}
.item{font-size:14.5px;margin:3px 0;}
.label{font-weight:700}

/* Yolcular */
.passenger{
    background:#eef1ff;
    padding:10px 12px;
    border-radius:6px;
    margin-bottom:6px;
}
.passenger div{font-size:14px;margin:1px 0}

/* Kurallar */
.rules{
    background:#FFF6D5;
    border-left:5px solid #D8A200;
    padding:10px;
    border-radius:4px;
    font-size:13.5px;
}

/* Butonlar */
.btn{display:block;padding:12px;font-size:15px;font-weight:700;border-radius:6px;text-align:center;text-decoration:none;margin-top:10px;color:#fff}
.btn-blue{background:#2660FF}
.btn-dark{background:#000}

/* Sosyal */
.footer{
    text-align:center;
    padding:18px;
    background:#f7f7f7;
}
.footer i{
    font-size:18px;
    margin:0 8px;
    color:#2660FF;
}

/* Mobile optimisation */
@media(max-width:480px){
    .firma-box{flex-direction:column;gap:10px;text-align:center;}
    .firma-info{text-align:center;}
}
</style>
</head>

<body>
<div class="container">

<!-- GÖTÜR -->
<div class="header"><img src="cid:logo_gotur"></div>

<!-- FİRMA + TELEFON -->
<div class="firma-box">
    <img src="cid:logo_firma">
    <div class="firma-info">
        <strong>${data.firmaAdi}</strong><br>
        İrtibat: ${data.firmaTel}
    </div>
</div>

<!-- PNR ORTADA VE ARTIK GERÇEK BG İLE -->
<div class="pnr-box">PNR: ${data.pnr}</div>

<!-- SEFER -->
<div class="section">
    <div class="title">📍 Sefer Bilgileri</div>
    <div class="item"><span class="label">Kalkış:</span> ${data.kalkis}</div>
    <div class="item"><span class="label">Varış:</span> ${data.varis}</div>
    <div class="item"><span class="label">Tarih:</span> ${data.tarih}</div>
    <div class="item"><span class="label">Saat:</span> ${data.saat}</div>
</div>

<!-- YOLCU DETAY -->
<div class="section">
    <div class="title">🧍‍♂️ Yolcu Bilgileri</div>
    ${data.yolcular.map(p=>`
    <div class="passenger">
        <div><b>Ad Soyad:</b> ${p.ad}</div>
        <div><b>Koltuk:</b> ${p.koltuk}</div>
        <div><b>Cinsiyet:</b> ${p.cinsiyet}</div>
        <div><b>Ücret:</b> ${p.ucret}</div>
    </div>
    `).join("")}
</div>

<!-- ŞARTLAR -->
<div class="section">
    <div class="title">⚠ İptal / Değişiklik Şartları</div>
    <div class="rules">
        • İptal – Değişiklik: Sefer saatine <b>6 saat kala</b><br>
        • Açığa alma: <b>6 saat önceye kadar</b> geçerlidir.
    </div>
</div>

<!-- BUTONLAR -->
<div class="section">
    <a class="btn btn-blue" href="${data.link}">Diğer İşlemleriniz İçin</a>
    <a class="btn btn-dark" href="${data.pdf}">PDF E-Bilet İndir</a>
</div>

<!-- SOSYAL -->
<div class="footer">
    <i class="fa-solid fa-globe"></i>
    <i class="fa-brands fa-instagram"></i>
    <i class="fa-brands fa-whatsapp"></i>
    <i class="fa-brands fa-x-twitter"></i>
    <i class="fa-brands fa-facebook"></i>
</div>

</div>
</body>
</html>
`

// ======================= GÖNDER ======================= //

async function sendMail() {
    const t = nodemailer.createTransport({
        service: "gmail",
        auth: { user: "a.qimse.n@gmail.com", pass: "djpa xmge lxab pkzn" }
    });

    await t.sendMail({
        from: `Götür <info@gotur.com>`,
        to: "erdogan.200278@gmail.com",
        subject: `🎫 E-Biletiniz Hazır — PNR ${data.pnr}`,
        html: HTML,
        attachments: [
            { filename: "gotur.png", path: LOGO_GOTUR, cid: "logo_gotur" },
            { filename: "firma.png", path: LOGO_FIRMA, cid: "logo_firma" },
        ]
    });
    await t.sendMail({
        from: `Götür <info@gotur.com>`,
        to: "ahmetnygt@hotmail.com",
        subject: `🎫 E-Biletiniz Hazır — PNR ${data.pnr}`,
        html: HTML,
        attachments: [
            { filename: "gotur.png", path: LOGO_GOTUR, cid: "logo_gotur" },
            { filename: "firma.png", path: LOGO_FIRMA, cid: "logo_firma" },
        ]
    });

    console.log("\n📨 Mail gönderildi ✔\n");
}

sendMail();