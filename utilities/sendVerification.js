async function sendSMS(phoneNumber, message) {
  if (!phoneNumber) {
    console.warn("SMS gönderimi atlandı: Telefon numarası bulunamadı.");
    return;
  }

  console.log(`[SMS] ${phoneNumber}: ${message}`);
}

async function sendEmail(emailAddress, subject, message) {
  if (!emailAddress) {
    console.warn("E-posta gönderimi atlandı: E-posta adresi bulunamadı.");
    return;
  }

  console.log(`[EMAIL] ${emailAddress}: ${subject} -> ${message}`);
}

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
