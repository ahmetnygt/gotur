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

    const AUTH_POPUP_SELECTOR = ".auth-popup";
    const AUTH_POPUP_OPEN_CLASS = "is-open";
    const AUTH_POPUP_BODY_CLASS = "auth-popup-open";

    function clearAuthFormState(form, alertElement) {
        if (!form) {
            return;
        }

        form.reset();
        clearFormErrors(form);
        if (alertElement) {
            clearGlobalError(alertElement);
        }
    }

    function openAuthPopup(popup) {
        if (!popup) {
            return;
        }

        popup.classList.add(AUTH_POPUP_OPEN_CLASS);
        popup.setAttribute("aria-hidden", "false");
        document.body.classList.add(AUTH_POPUP_BODY_CLASS);

        if (popup.id === "loginPopup") {
            clearAuthFormState(loginForm, loginAlert);
        } else if (popup.id === "registerPopup") {
            clearAuthFormState(registerForm, registerAlert);
        }
    }

    function closeAuthPopup(popup) {
        if (!popup) {
            return;
        }

        popup.classList.remove(AUTH_POPUP_OPEN_CLASS);
        popup.setAttribute("aria-hidden", "true");

        const isAnyPopupOpen = document.querySelector(`${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`);
        if (!isAnyPopupOpen) {
            document.body.classList.remove(AUTH_POPUP_BODY_CLASS);
        }

        if (popup.id === "loginPopup") {
            clearAuthFormState(loginForm, loginAlert);
        } else if (popup.id === "registerPopup") {
            clearAuthFormState(registerForm, registerAlert);
        }
    }

    function setupAuthPopups() {
        const popups = document.querySelectorAll(AUTH_POPUP_SELECTOR);
        if (!popups.length) {
            return;
        }

        document.querySelectorAll("[data-popup-open]").forEach((trigger) => {
            trigger.addEventListener("click", (event) => {
                event.preventDefault();
                const targetId = trigger.getAttribute("data-popup-open");
                if (!targetId) {
                    return;
                }

                const targetPopup = document.getElementById(targetId);
                if (!targetPopup) {
                    return;
                }

                document.querySelectorAll(`${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`).forEach((openPopup) => {
                    if (openPopup !== targetPopup) {
                        closeAuthPopup(openPopup);
                    }
                });

                openAuthPopup(targetPopup);
            });
        });

        document.querySelectorAll("[data-popup-close]").forEach((trigger) => {
            trigger.addEventListener("click", (event) => {
                event.preventDefault();
                const popup = trigger.closest(AUTH_POPUP_SELECTOR);
                if (popup) {
                    closeAuthPopup(popup);
                }
            });
        });

        document.querySelectorAll("[data-popup-switch]").forEach((trigger) => {
            trigger.addEventListener("click", (event) => {
                event.preventDefault();
                const targetId = trigger.getAttribute("data-popup-switch");
                if (!targetId) {
                    return;
                }

                const currentPopup = trigger.closest(AUTH_POPUP_SELECTOR);
                const targetPopup = document.getElementById(targetId);

                if (currentPopup) {
                    closeAuthPopup(currentPopup);
                }

                if (targetPopup) {
                    openAuthPopup(targetPopup);
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }

            const openPopups = document.querySelectorAll(`${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`);
            if (!openPopups.length) {
                return;
            }

            const lastPopup = openPopups[openPopups.length - 1];
            closeAuthPopup(lastPopup);
        });
    }

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

    }

    function initBusTicketResults() {
        const section = document.querySelector(".bus-ticket-results");
        if (!section) {
            return;
        }

        const { fromId, toId, defaultDate } = section.dataset;
        if (!fromId || !toId || !defaultDate) {
            return;
        }

        const grid = section.querySelector(".bus-ticket-results__grid");
        const loadingEl = section.querySelector(".bus-ticket-results__loading");
        const errorEl = section.querySelector(".bus-ticket-results__error");
        const emptyEl = section.querySelector(".bus-ticket-results__empty");
        const seeAllLink = section.querySelector(".bus-ticket-results__see-all");

        const dateDisplay = section.dataset.defaultDateDisplay || defaultDate;
        const weekday = section.dataset.defaultDateWeekday || "";

        if (seeAllLink) {
            seeAllLink.href = `/trips/${fromId}-${toId}/${defaultDate}`;
        }

        const loadingText = loadingEl?.querySelector("span.ms-2");
        const dayLabel = weekday
            ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`
            : "Yarın";

        const subtitle = section.querySelector(".bus-ticket-results__subtitle");
        if (subtitle) {
            subtitle.textContent = `${dayLabel} (${dateDisplay}) için uygun seferleri sizin için listeliyoruz.`;
        }

        if (loadingText) {
            loadingText.textContent = `${dayLabel} (${dateDisplay}) için seferler yükleniyor...`;
        }

        const setVisibility = (element, isVisible) => {
            if (!element) {
                return;
            }

            element.classList.toggle("d-none", !isVisible);
        };

        const showState = (state) => {
            setVisibility(loadingEl, state === "loading");
            setVisibility(errorEl, state === "error");
            setVisibility(emptyEl, state === "empty");
        };

        const formatTime = (value) => {
            if (!value) {
                return "--:--";
            }

            const [hour = "", minute = ""] = String(value).split(":");
            const formattedHour = hour.padStart(2, "0");
            const formattedMinute = minute.padStart(2, "0");
            return `${formattedHour}:${formattedMinute}`;
        };

        const formatPrice = (value) => {
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue) || numericValue <= 0) {
                return null;
            }

            try {
                return new Intl.NumberFormat("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 0,
                }).format(numericValue);
            } catch (error) {
                console.warn("Fiyat biçimlendirme başarısız oldu:", error);
                return `${numericValue} TL`;
            }
        };

        const getFirmInitials = (text) => {
            const normalized = String(text || "").trim();
            if (!normalized) {
                return "?";
            }

            const parts = normalized.split(/\s+/);
            const initials = parts
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join("");

            return initials || normalized.charAt(0).toUpperCase();
        };

        const createTimeRow = (label, timeText, location) => {
            const row = document.createElement("div");
            row.className = "bus-ticket-card__time-row";

            const time = document.createElement("strong");
            time.textContent = timeText;

            const detail = document.createElement("span");
            detail.textContent = location ? `${label} · ${location}` : label;

            row.append(time, detail);
            return row;
        };

        const renderTrips = (trips) => {
            if (!grid) {
                return;
            }

            grid.innerHTML = "";

            trips.forEach((trip) => {
                const firmName = trip?.firmName || trip?.firm || "Otobüs Firması";
                const departureTime = formatTime(trip?.time);
                const timeline = Array.isArray(trip?.routeTimeline)
                    ? trip.routeTimeline.filter(Boolean)
                    : [];
                const arrivalEntry = timeline.length ? timeline[timeline.length - 1] : null;
                const arrivalTime = formatTime(arrivalEntry?.time || null);
                const arrivalLocation = arrivalEntry?.title || trip?.toStr || "Varış";

                const priceText = formatPrice(trip?.price);
                const durationText = typeof trip?.duration === "string" && trip.duration.trim()
                    ? trip.duration.trim()
                    : null;
                const features = Array.isArray(trip?.busFeatures)
                    ? trip.busFeatures.slice(0, 3)
                    : [];

                const card = document.createElement("article");
                card.className = "bus-ticket-card";
                card.setAttribute("role", "listitem");

                const header = document.createElement("div");
                header.className = "bus-ticket-card__header";

                const firmWrapper = document.createElement("div");
                firmWrapper.className = "bus-ticket-card__firm";

                const firmLogo = document.createElement("div");
                firmLogo.className = "bus-ticket-card__firm-logo";
                firmLogo.textContent = getFirmInitials(firmName);
                firmWrapper.appendChild(firmLogo);

                const firmTitle = document.createElement("p");
                firmTitle.className = "bus-ticket-card__firm-name";
                firmTitle.textContent = firmName;
                firmWrapper.appendChild(firmTitle);

                header.appendChild(firmWrapper);

                const priceWrapper = document.createElement("div");
                priceWrapper.className = "bus-ticket-card__price";

                const priceValue = document.createElement("strong");
                priceValue.textContent = priceText || "Fiyat bekleniyor";
                priceWrapper.appendChild(priceValue);

                const priceHint = document.createElement("span");
                priceHint.textContent = priceText ? "Kişi başı bilet" : "Satın alma sırasında netleşir";
                priceWrapper.appendChild(priceHint);

                header.appendChild(priceWrapper);

                card.appendChild(header);

                const body = document.createElement("div");
                body.className = "bus-ticket-card__body";

                const timeBlock = document.createElement("div");
                timeBlock.className = "bus-ticket-card__time";
                timeBlock.appendChild(
                    createTimeRow("Kalkış", departureTime, trip?.fromStr || "")
                );
                timeBlock.appendChild(
                    createTimeRow("Varış", arrivalTime, arrivalLocation)
                );

                const routeBlock = document.createElement("div");
                routeBlock.className = "bus-ticket-card__route";

                const routeTitle = document.createElement("strong");
                routeTitle.textContent = `${trip?.fromStr || "Kalkış"} → ${trip?.toStr || "Varış"}`;
                routeBlock.appendChild(routeTitle);

                if (durationText) {
                    const durationEl = document.createElement("span");
                    durationEl.textContent = `Tahmini süre: ${durationText}`;
                    routeBlock.appendChild(durationEl);
                }

                if (trip?.routeDescription) {
                    const descriptionEl = document.createElement("span");
                    descriptionEl.textContent = trip.routeDescription;
                    routeBlock.appendChild(descriptionEl);
                }

                body.appendChild(timeBlock);
                body.appendChild(routeBlock);

                card.appendChild(body);

                if (features.length) {
                    const featuresWrapper = document.createElement("div");
                    featuresWrapper.className = "bus-ticket-card__meta";

                    features.forEach((feature) => {
                        const badge = document.createElement("span");
                        badge.className = "bus-ticket-card__feature";

                        if (feature?.icon) {
                            const icon = document.createElement("img");
                            icon.src = feature.icon;
                            icon.alt = feature?.label || "Özellik";
                            icon.loading = "lazy";
                            badge.appendChild(icon);
                        }

                        const label = document.createElement("span");
                        label.textContent = feature?.label || "Özellik";
                        badge.appendChild(label);

                        featuresWrapper.appendChild(badge);
                    });

                    card.appendChild(featuresWrapper);
                }

                const actions = document.createElement("div");
                actions.className = "bus-ticket-card__actions";

                const fullness = document.createElement("span");
                fullness.className = "bus-ticket-card__fullness";
                fullness.textContent = trip?.fullness
                    ? `Doluluk: ${trip.fullness}`
                    : "Koltuk durumu: Anlık olarak güncellenir";
                actions.appendChild(fullness);

                const actionUrl = `/trips/${fromId}-${toId}/${defaultDate}`;
                const actionBtn = document.createElement("a");
                actionBtn.className = "bus-ticket-card__action-btn";
                actionBtn.href = actionUrl;
                actionBtn.textContent = "SATIN AL";
                actionBtn.setAttribute(
                    "aria-label",
                    `${firmName} seferi için bilet satın al`
                );

                actions.appendChild(actionBtn);
                card.appendChild(actions);

                grid.appendChild(card);
            });
        };

        const fetchTrips = async () => {
            showState("loading");

            try {
                const response = await fetch(
                    `/trips/${fromId}-${toId}/${defaultDate}?format=json`,
                    {
                        headers: {
                            Accept: "application/json",
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const trips = Array.isArray(data?.trips) ? data.trips : [];

                if (!trips.length) {
                    if (grid) {
                        grid.innerHTML = "";
                    }
                    showState("empty");
                    return;
                }

                showState(null);
                renderTrips(trips);
            } catch (error) {
                console.error("Yarınki seferler alınamadı:", error);
                showState("error");
            }
        };

        fetchTrips();
    }

    initBusTicketResults();

    setupAuthPopups();

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
