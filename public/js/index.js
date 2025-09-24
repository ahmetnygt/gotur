(() => {
    const placeSelectModule = window.GTR && window.GTR.placeSelect;
    if (placeSelectModule && typeof placeSelectModule.init === "function") {
        Promise.resolve(placeSelectModule.init()).catch(error => {
            console.error(
                "Trip finder için yer seçici başlatılırken hata oluştu:",
                error
            );
        });
    }

    const tripFinderDate = $(".trip-finder_date");
    const dayButtons = $(".trip-finder_day-button");
    const dayOffsets = {
        today: 0,
        tomorrow: 1,
    };

    const formatDate = date => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const getRelativeDate = offset => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + offset);
        return date;
    };

    const updateActiveDayButton = dateStr => {
        dayButtons.removeClass("active");
        if (!dateStr) {
            return;
        }

        Object.entries(dayOffsets).forEach(([key, offset]) => {
            if (dateStr === formatDate(getRelativeDate(offset))) {
                dayButtons.filter(`[data-day="${key}"]`).addClass("active");
            }
        });
    };

    let datePicker;

    if (tripFinderDate.length) {
        datePicker = flatpickr(tripFinderDate[0], {
            locale: "tr",
            defaultDate: new Date(),
            altInput: true,
            altFormat: "d F Y",
            onChange: (_, dateStr) => {
                updateActiveDayButton(dateStr);
            },
        });

        updateActiveDayButton(datePicker.input.value);

        tripFinderDate.on("change", () => {
            updateActiveDayButton(tripFinderDate.val());
        });
    }

    dayButtons.on("click", function () {
        if (!datePicker) {
            return;
        }

        const dayKey = $(this).data("day");
        const offset = dayOffsets[dayKey];

        if (offset === undefined) {
            return;
        }

        const targetDate = getRelativeDate(offset);
        datePicker.setDate(targetDate, true);
    });

    const searchButton = $(".trip-finder_search-button");
    searchButton.off("click");
    searchButton.on("click", () => {
        const fromId = $(".trip-finder_from").val();
        const toId = $(".trip-finder_to").val();
        const date = tripFinderDate.val();

        if (!fromId || !toId || !date) {
            return;
        }

        const url = `/trips/${fromId}-${toId}/${date}`;
        window.location.href = url;
    });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?\d{10,15}$/;

    const getFeedbackElement = (input) => input?.closest(".mb-3")?.querySelector(".invalid-feedback");

    const setFieldError = (input, message) => {
        if (!input) {
            return;
        }

        input.classList.add("is-invalid");
        const feedback = getFeedbackElement(input);
        if (feedback) {
            feedback.textContent = message;
        }
    };

    const clearFieldError = (input) => {
        if (!input) {
            return;
        }

        input.classList.remove("is-invalid");
        const feedback = getFeedbackElement(input);
        if (feedback) {
            feedback.textContent = "";
        }
    };

    const clearFormErrors = (form) => {
        if (!form) {
            return;
        }

        form.querySelectorAll("input").forEach((input) => {
            clearFieldError(input);
        });
    };

    const applyFieldErrors = (form, errors) => {
        if (!form || !errors) {
            return;
        }

        Object.entries(errors).forEach(([field, message]) => {
            const input = form.querySelector(`[name="${field}"]`);
            if (input) {
                setFieldError(input, message);
            }
        });
    };

    const showGlobalError = (element, message) => {
        if (!element || !message) {
            return;
        }

        element.classList.remove("d-none");
        element.innerHTML = message;
    };

    const clearGlobalError = (element) => {
        if (!element) {
            return;
        }

        element.classList.add("d-none");
        element.innerHTML = "";
    };

    const setSubmitting = (form, isSubmitting) => {
        if (!form) {
            return;
        }

        const submitButton = form.querySelector("button[type='submit']");

        if (!submitButton) {
            return;
        }

        if (isSubmitting) {
            if (!submitButton.dataset.originalText) {
                submitButton.dataset.originalText = submitButton.textContent;
            }
            submitButton.disabled = true;
            submitButton.textContent = "Gönderiliyor...";
        } else {
            submitButton.disabled = false;
            if (submitButton.dataset.originalText) {
                submitButton.textContent = submitButton.dataset.originalText;
                delete submitButton.dataset.originalText;
            }
        }
    };

    const attachInputListeners = (form, globalErrorElement) => {
        if (!form) {
            return;
        }

        form.querySelectorAll("input").forEach((input) => {
            input.addEventListener("input", () => {
                clearFieldError(input);
                if (globalErrorElement) {
                    clearGlobalError(globalErrorElement);
                }
            });
        });
    };

    const isValidIdentifier = (value = "") => {
        const trimmed = value.trim();
        return emailRegex.test(trimmed) || phoneRegex.test(trimmed);
    };

    const loginForm = document.getElementById("loginForm");
    const loginAlert = document.querySelector("[data-error-target='login']");

    if (loginForm) {
        attachInputListeners(loginForm, loginAlert);

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            clearGlobalError(loginAlert);
            clearFormErrors(loginForm);

            const formData = new FormData(loginForm);
            const identifier = (formData.get("identifier") || "").toString().trim();
            const password = (formData.get("password") || "").toString().trim();
            const fieldErrors = {};

            if (!identifier) {
                fieldErrors.identifier = "E-posta veya telefon numarası zorunludur.";
            } else if (!isValidIdentifier(identifier)) {
                fieldErrors.identifier = "Lütfen geçerli bir e-posta veya telefon numarası girin.";
            }

            if (!password) {
                fieldErrors.password = "Şifre zorunludur.";
            }

            if (Object.keys(fieldErrors).length > 0) {
                applyFieldErrors(loginForm, fieldErrors);
                showGlobalError(loginAlert, "Giriş bilgileri eksik veya hatalı.");
                return;
            }

            try {
                setSubmitting(loginForm, true);

                const response = await fetch("/user/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({ identifier, password }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    if (data?.fieldErrors) {
                        applyFieldErrors(loginForm, data.fieldErrors);
                    }

                    const message = data?.message || "Giriş sırasında beklenmeyen bir hata oluştu.";
                    showGlobalError(loginAlert, message);
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error("Giriş isteği başarısız oldu:", error);
                showGlobalError(loginAlert, "Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
            } finally {
                setSubmitting(loginForm, false);
            }
        });

        const loginModalElement = document.getElementById("loginModal");
        if (loginModalElement) {
            loginModalElement.addEventListener("hidden.bs.modal", () => {
                loginForm.reset();
                clearFormErrors(loginForm);
                clearGlobalError(loginAlert);
            });
        }
    }

    const registerForm = document.getElementById("registerForm");
    const registerAlert = document.querySelector("[data-error-target='register']");

    if (registerForm) {
        attachInputListeners(registerForm, registerAlert);

        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            clearGlobalError(registerAlert);
            clearFormErrors(registerForm);

            const formData = new FormData(registerForm);
            const identifier = (formData.get("identifier") || "").toString().trim();
            const password = (formData.get("password") || "").toString().trim();
            const passwordConfirm = (formData.get("passwordConfirm") || "").toString().trim();
            const fieldErrors = {};

            if (!identifier) {
                fieldErrors.identifier = "E-posta veya telefon numarası zorunludur.";
            } else if (!isValidIdentifier(identifier)) {
                fieldErrors.identifier = "Lütfen geçerli bir e-posta veya telefon numarası girin.";
            }

            if (!password) {
                fieldErrors.password = "Şifre zorunludur.";
            } else if (password.length < 6) {
                fieldErrors.password = "Şifre en az 6 karakter olmalıdır.";
            }

            if (!passwordConfirm) {
                fieldErrors.passwordConfirm = "Şifre tekrarı zorunludur.";
            } else if (passwordConfirm !== password) {
                fieldErrors.passwordConfirm = "Şifreler eşleşmiyor.";
            }

            if (Object.keys(fieldErrors).length > 0) {
                applyFieldErrors(registerForm, fieldErrors);
                showGlobalError(registerAlert, "Lütfen formdaki hataları düzeltin.");
                return;
            }

            try {
                setSubmitting(registerForm, true);

                const response = await fetch("/user/register", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({ identifier, password, passwordConfirm }),
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    if (data?.fieldErrors) {
                        applyFieldErrors(registerForm, data.fieldErrors);
                    }

                    const message = data?.message || "Kayıt sırasında beklenmeyen bir hata oluştu.";
                    showGlobalError(registerAlert, message);
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error("Kayıt isteği başarısız oldu:", error);
                showGlobalError(registerAlert, "Kayıt yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
            } finally {
                setSubmitting(registerForm, false);
            }
        });

        const registerModalElement = document.getElementById("registerModal");
        if (registerModalElement) {
            registerModalElement.addEventListener("hidden.bs.modal", () => {
                registerForm.reset();
                clearFormErrors(registerForm);
                clearGlobalError(registerAlert);
            });
        }
    }

    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener("click", async (event) => {
            event.preventDefault();

            if (logoutButton.classList.contains("disabled")) {
                return;
            }

            logoutButton.classList.add("disabled");
            logoutButton.setAttribute("aria-disabled", "true");

            try {
                const response = await fetch("/user/logout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({}),
                });

                if (!response.ok) {
                    throw new Error("Logout failed");
                }

                window.location.reload();
            } catch (error) {
                console.error("Çıkış isteği başarısız oldu:", error);
                alert("Çıkış yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
                logoutButton.classList.remove("disabled");
                logoutButton.removeAttribute("aria-disabled");
            }
        });
    }

})();
