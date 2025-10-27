const sendEmail = require("./sendMail");
const sendSMS = require("./sendSms");

async function sendVerification({ phoneNumber, emailAddress, code, pnr }) {
  const verificationMessage = `PNR ${pnr} için bilet iptal doğrulama kodunuz: ${code}`;
  const emailSubject = "Bilet İptal Doğrulama Kodu";

  await Promise.all([
    sendSMS(phoneNumber, verificationMessage),
    sendEmail(emailAddress, emailSubject, verificationMessage),
  ]);
}

module.exports = {
  sendVerification,
};
