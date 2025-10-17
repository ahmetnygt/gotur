// 🔧 Ortam değişkenleri
const accountSid = 'AC40aa89a756d84e8d6c4d2b63a7faf2f8';
const authToken = '4b0fffec3555db062f425669e18b9bf0';
const client = require('twilio')(accountSid, authToken);

/**
 * SMS Gönderimi (demo veya gerçek)
 * @param {string} to - Alıcı numarası (ör: +905555555555)
 * @param {string} message - Gönderilecek mesaj
 * @returns {Promise<Object>} Twilio yanıtı
 */
async function sendSMS(to, message) {
    try {
        const response = await client.messages.create({
            body: message,
            from: "+15674303530",
            // to,
            to: "+18777804236"
        });

        console.log(`✅ SMS gönderildi: ${response.sid}`);
        return { success: true, sid: response.sid };
    } catch (err) {
        console.error("❌ SMS gönderim hatası:", err.message);
        return { success: false, error: err.message };
    }
}

module.exports = sendSMS;
