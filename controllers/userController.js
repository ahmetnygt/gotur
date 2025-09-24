const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

const GENDER_OPTIONS = [
    { value: "m", label: "Erkek" },
    { value: "f", label: "Kadın" },
];

const CUSTOMER_TYPE_OPTIONS = [
    { value: "adult", label: "Yetişkin" },
    { value: "child", label: "Çocuk" },
    { value: "student", label: "Öğrenci" },
    { value: "disabled", label: "Engelli" },
    { value: "retired", label: "Emekli" },
];

const CUSTOMER_TYPE_VALUES = new Set(CUSTOMER_TYPE_OPTIONS.map((option) => option.value));

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

function normalizeText(value = "") {
    return typeof value === "string" ? value.trim() : "";
}

function sanitizeIdNumber(value = "") {
    return String(value || "").replace(/\D+/g, "");
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

function buildPersonalInfoPayload(userInstance = {}) {
    return {
        idNumber: userInstance.idNumber ? String(userInstance.idNumber) : "",
        name: userInstance.name || "",
        surname: userInstance.surname || "",
        email: userInstance.email || "",
        phoneNumber: userInstance.phoneNumber || "",
        gender: userInstance.gender || "",
        nationality: userInstance.nationality || "",
        customerType: userInstance.customerType || "",
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

exports.redirectToPersonalInformation = (req, res) => {
    if (!req.session?.user) {
        return res.redirect("/");
    }

    return res.redirect("/user/personal-information");
};

exports.personalInformation = async (req, res, next) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.redirect("/");
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        const personalInfo = userInstance
            ? buildPersonalInfoPayload(userInstance)
            : buildPersonalInfoPayload(sessionUser);

        return res.render("user/personal-information", {
            title: "Götür | Kişisel Bilgilerim",
            personalInfo,
            genderOptions: GENDER_OPTIONS,
            customerTypeOptions: CUSTOMER_TYPE_OPTIONS,
        });
    } catch (error) {
        return next(error);
    }
};

exports.updatePersonalInformation = async (req, res) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res
                .status(401)
                .json({ success: false, message: "Bu işlem için giriş yapmalısınız." });
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        if (!userInstance) {
            return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
        }

        const {
            name,
            surname,
            email,
            phoneNumber,
            idNumber,
            gender,
            nationality,
            customerType,
        } = req.body || {};

        const fieldErrors = {};

        const normalizedName = normalizeText(name);
        const normalizedSurname = normalizeText(surname);
        const normalizedEmail = normalizeText(email).toLowerCase();
        const normalizedPhoneInput = typeof phoneNumber === "string" ? phoneNumber : "";
        const normalizedPhone = sanitizePhone(normalizedPhoneInput);
        const normalizedIdNumber = sanitizeIdNumber(idNumber);
        const normalizedGender = normalizeText(gender).toLowerCase();
        const normalizedNationality = normalizeText(nationality);
        const normalizedCustomerType = normalizeText(customerType).toLowerCase();

        if (!normalizedName) {
            fieldErrors.name = "Ad zorunludur.";
        }

        if (!normalizedSurname) {
            fieldErrors.surname = "Soyad zorunludur.";
        }

        if (normalizedEmail && !isEmail(normalizedEmail)) {
            fieldErrors.email = "Lütfen geçerli bir e-posta girin.";
        }

        if (normalizedPhone && !isPhone(normalizedPhone)) {
            fieldErrors.phoneNumber = "Lütfen geçerli bir telefon numarası girin.";
        }

        if (normalizedIdNumber && !/^\d{11}$/.test(normalizedIdNumber)) {
            fieldErrors.idNumber = "Kimlik numarası 11 haneli olmalıdır.";
        }

        if (normalizedGender && !GENDER_OPTIONS.some((option) => option.value === normalizedGender)) {
            fieldErrors.gender = "Lütfen geçerli bir cinsiyet seçin.";
        }

        if (normalizedCustomerType && !CUSTOMER_TYPE_VALUES.has(normalizedCustomerType)) {
            fieldErrors.customerType = "Lütfen geçerli bir müşteri tipi seçin.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        userInstance.name = normalizedName;
        userInstance.surname = normalizedSurname;
        userInstance.email = normalizedEmail || null;
        userInstance.phoneNumber = normalizedPhone || null;
        userInstance.idNumber = normalizedIdNumber || null;
        userInstance.gender = normalizedGender || null;
        userInstance.nationality = normalizedNationality || null;
        userInstance.customerType = normalizedCustomerType || null;

        await userInstance.save();

        const sessionPayload = createSessionUserPayload(userInstance);
        req.session.user = sessionPayload;

        return res.json({
            success: true,
            message: "Bilgileriniz başarıyla güncellendi.",
            personalInfo: buildPersonalInfoPayload(userInstance),
        });
    } catch (error) {
        console.error("Kişisel bilgiler güncellenirken hata oluştu:", error);
        return res.status(500).json({ success: false, message: "Bilgiler güncellenemedi." });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res
                .status(401)
                .json({ success: false, message: "Bu işlem için giriş yapmalısınız." });
        }

        if (req.app?.locals?.waitForTenants) {
            await req.app.locals.waitForTenants();
        }

        const User = getUserModel(req);
        const userInstance = await User.findByPk(sessionUser.id);

        if (!userInstance) {
            return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
        }

        const { currentPassword, newPassword, newPasswordConfirm } = req.body || {};

        const fieldErrors = {};

        const normalizedCurrentPassword = normalizeText(currentPassword);
        const normalizedNewPassword = normalizeText(newPassword);
        const normalizedNewPasswordConfirm = normalizeText(newPasswordConfirm);

        if (!normalizedCurrentPassword) {
            fieldErrors.currentPassword = "Mevcut şifre zorunludur.";
        }

        if (!normalizedNewPassword) {
            fieldErrors.newPassword = "Yeni şifre zorunludur.";
        } else if (normalizedNewPassword.length < 6) {
            fieldErrors.newPassword = "Şifre en az 6 karakter olmalıdır.";
        }

        if (!normalizedNewPasswordConfirm) {
            fieldErrors.newPasswordConfirm = "Şifre tekrarı zorunludur.";
        } else if (normalizedNewPassword !== normalizedNewPasswordConfirm) {
            fieldErrors.newPasswordConfirm = "Şifreler eşleşmiyor.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return buildFieldErrorResponse(res, fieldErrors);
        }

        const isCurrentPasswordValid = await bcrypt.compare(
            normalizedCurrentPassword,
            userInstance.password || "",
        );

        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                fieldErrors: { currentPassword: "Mevcut şifrenizi kontrol edin." },
                message: "Şifre değiştirilemedi.",
            });
        }

        const hashedPassword = await bcrypt.hash(normalizedNewPassword, SALT_ROUNDS);
        userInstance.password = hashedPassword;
        await userInstance.save();

        return res.json({ success: true, message: "Şifreniz başarıyla güncellendi." });
    } catch (error) {
        console.error("Şifre değiştirilirken hata oluştu:", error);
        return res.status(500).json({ success: false, message: "Şifreniz güncellenemedi." });
    }
};

exports.myAccount = (req, res) => {
    const currentUser = req.session?.user ?? null;
    res.render("user", { user: currentUser, title: "Götür | Hesabım" });
};
