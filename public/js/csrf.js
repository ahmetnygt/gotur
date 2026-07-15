// GÜVENLİK: Sunucu her istekte "XSRF-TOKEN" adında (httpOnly=false) bir
// cookie yazıyor (bkz. middlewares/csrf.js). Bu dosya o değeri okuyup
// fetch() ile yapılan durum değiştiren (POST/PUT/PATCH/DELETE) isteklere
// "X-CSRF-Token" header'ı olarak ekleyen tek bir merkezi yardımcı sağlar.
window.GoturCsrf = (function () {
    function getToken() {
        const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    // Var olan fetch() çağrılarına tek satırla CSRF header'ı eklemek için:
    // fetch(url, GoturCsrf.withCsrf({ method: "POST", ... }))
    function withCsrf(options) {
        const opts = options ? { ...options } : {};
        const token = getToken();

        if (token) {
            opts.headers = { ...(opts.headers || {}), "X-CSRF-Token": token };
        }

        return opts;
    }

    return { getToken, withCsrf };
})();
