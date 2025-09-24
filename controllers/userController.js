const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

function getUserModel(req) {
    const { User } = req.commonModels || {};

    if (!User) {
        const error = new Error("User modeli bulunamadı.");
        error.status = 500;
        throw error;
    }

    return User;
}

function normalizeIdentifier(value = "") {
    return value.trim();
}

function sanitizePhone(value = "") {
    return value.replace(/\s+/g, "");
}

function isEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value = "") {
    return /^\+?\d{10,15}$/.test(value);
}

function buildFieldErrorResponse(res, fieldErrors, message = "Lütfen formdaki hataları düzeltin.") {
    return res.status(400).json({ success: false, fieldErrors, message });
}

function createSessionUserPayload(userInstance) {
    return {
        id: userInstance.id,
        email: userInstance.email,
        phoneNumber: userInstance.phoneNumber,
        name: userInstance.name,
        surname: userInstance.surname,
    };
}

exports.register = async (req, res) => {
    try {
        const User = getUserModel(req);
        const { identifier, password, passwordConfirm } = req.body || {};
        const fieldErrors = {};

        const normalizedIdentifier = normalizeIdentifier(identifier);
        const normalizedPassword = typeof password === "string" ? password.trim() : "";
        const normalizedPasswordConfirm = typeof passwordConfirm === "string" ? passwordConfirm.trim() : "";

        if (!normalizedIdentifier) {
            fieldErrors.identifier = "E-posta veya telefon numarası zorunludur.";
        } else if (!isEmail(normalizedIdentifier) && !isPhone(normalizedIdentifier)) {
            fieldErrors.identifier = "Lütfen geçerli bir e-posta veya telefon numarası girin.";
        }

        if (!normalizedPassword) {
            fieldErrors.password = "Şifre zorunludur.";
        } else if (normalizedPassword.length < 6) {
            fieldErrors.password = "Şifre en az 6 karakter olmalıdır.";
        }

        if (!normalizedPasswordConfirm) {
            fieldErrors.passwordConfirm = "Şifre tekrarı zorunludur.";
        } else if (normalizedPassword !== normalizedPasswordConfirm) {
            fieldErrors.passwordConfirm = "Şifreler eşleşmiyor.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        const whereClause = {};
        let payload = {};

        if (isEmail(normalizedIdentifier)) {
            const email = normalizedIdentifier.toLowerCase();
            whereClause.email = email;
            payload.email = email;
        } else {
            const phone = sanitizePhone(normalizedIdentifier);
            whereClause.phoneNumber = phone;
            payload.phoneNumber = phone;
        }

        const existingUser = await User.findOne({ where: whereClause });

        if (existingUser) {
            fieldErrors.identifier = "Bu bilgilerle zaten bir hesabınız var.";
            return buildFieldErrorResponse(res, fieldErrors, "Kayıt işlemi tamamlanamadı.");
        }

        const hashedPassword = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);

        const createdUser = await User.create({
            ...payload,
            password: hashedPassword,
        });

        const sessionUser = createSessionUserPayload(createdUser);
        req.session.user = sessionUser;

        return res.json({ success: true, user: sessionUser });
    } catch (error) {
        console.error("Kayıt sırasında hata oluştu:", error);
        const status = error.status || 500;
        const message =
            status === 500
                ? "Kayıt sırasında beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
                : error.message;
        return res.status(status).json({ success: false, message });
    }
};

exports.login = async (req, res) => {
    try {
        const User = getUserModel(req);
        const { identifier, password } = req.body || {};
        const fieldErrors = {};

        const normalizedIdentifier = normalizeIdentifier(identifier);
        const normalizedPassword = typeof password === "string" ? password.trim() : "";

        if (!normalizedIdentifier) {
            fieldErrors.identifier = "E-posta veya telefon numarası zorunludur.";
        } else if (!isEmail(normalizedIdentifier) && !isPhone(normalizedIdentifier)) {
            fieldErrors.identifier = "Lütfen geçerli bir e-posta veya telefon numarası girin.";
        }

        if (!normalizedPassword) {
            fieldErrors.password = "Şifre zorunludur.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors, "Giriş bilgileri eksik veya hatalı.");
        }

        const whereClause = isEmail(normalizedIdentifier)
            ? { email: normalizedIdentifier.toLowerCase() }
            : { phoneNumber: sanitizePhone(normalizedIdentifier) };

        const user = await User.findOne({ where: whereClause });

        if (!user) {
            return res.status(401).json({
                success: false,
                fieldErrors: { identifier: "Bu bilgilerle kayıtlı kullanıcı bulunamadı." },
                message: "Giriş bilgileri doğrulanamadı.",
            });
        }

        const isPasswordValid = await bcrypt.compare(normalizedPassword, user.password || "");

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                fieldErrors: { password: "Şifreyi kontrol edin." },
                message: "Giriş bilgileri doğrulanamadı.",
            });
        }

        const sessionUser = createSessionUserPayload(user);
        req.session.user = sessionUser;

        return res.json({ success: true, user: sessionUser });
    } catch (error) {
        console.error("Giriş sırasında hata oluştu:", error);
        const status = error.status || 500;
        const message =
            status === 500
                ? "Giriş sırasında beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
                : error.message;
        return res.status(status).json({ success: false, message });
    }
};

exports.logout = (req, res) => {
    try {
        if (!req.session) {
            return res.json({ success: true });
        }

        req.session.destroy((error) => {
            if (error) {
                console.error("Çıkış yapılırken oturum sonlandırılamadı:", error);
                return res
                    .status(500)
                    .json({ success: false, message: "Çıkış yapılırken bir hata oluştu. Lütfen tekrar deneyin." });
            }

            res.clearCookie("connect.sid");
            return res.json({ success: true });
        });
    } catch (error) {
        console.error("Çıkış yapılırken hata oluştu:", error);
        return res
            .status(500)
            .json({ success: false, message: "Çıkış yapılırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." });
    }
};

exports.myAccount = (req, res, next) => {
    const currentUser = req.session.user
    res.render("user", { user: currentUser });
}