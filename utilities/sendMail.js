const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "a.qimse.n@gmail.com",   // kendi Gmail adresin
        pass: "djpa xmge lxab pkzn" // Google’ın verdiği App Password
    }
});

async function sendEmail(to, subject, text) {
    try {
        const info = await transporter.sendMail({
            from: 'Götür',
            to,
            subject,
            text
        });
        console.log("Mail gönderildi:", info.messageId);
    } catch (err) {
        console.error("Hata:", err);
    }
}

module.exports = sendEmail;
