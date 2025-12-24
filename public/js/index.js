(() => {
    const placeSelectModule = window.GTR && window.GTR.placeSelect;
    if (placeSelectModule && typeof placeSelectModule.init === "function") {
        Promise.resolve(placeSelectModule.init()).catch((error) => {
            console.error("Failed to initialise trip finder place selector:", error);
        });
    }

    const tripFinderDate = $(".trip-finder_date");
    const dayButtons = $(".trip-finder_day-button");
    const dayOffsets = {
        today: 0,
        tomorrow: 1,
    };

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const getRelativeDate = (offset) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + offset);
        return date;
    };

    const updateActiveDayButton = (dateStr) => {
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
            locale: "en",
            defaultDate: new Date(),
            altInput: true,
            altFormat: "d M Y",
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

    const changeButton = $(".trip-finder_change");
    changeButton.off("click");
    changeButton.on("click", (event) => {
        event.preventDefault();

        const fromInput = $(".trip-finder_from");
        const toInput = $(".trip-finder_to");

        if (!fromInput.length || !toInput.length) {
            return;
        }

        const fromValue = fromInput.val();
        const toValue = toInput.val();

        if (!fromValue && !toValue) {
            return;
        }

        let handledByPlaceSelect = false;
        const placeSelectModule = window.GTR && window.GTR.placeSelect;

        if (placeSelectModule && typeof placeSelectModule.getInstance === "function") {
            const fromRoot = fromInput.closest(".place-select");
            const toRoot = toInput.closest(".place-select");

            const fromInstance =
                fromRoot.length && placeSelectModule.getInstance(fromRoot.get(0));
            const toInstance =
                toRoot.length && placeSelectModule.getInstance(toRoot.get(0));

            const applyValue = (instance, value, fallbackInput) => {
                if (!instance) {
                    return false;
                }

                if (value) {
                    if (typeof instance.selectById === "function") {
                        instance.selectById(value);
                        return true;
                    }
                    if (typeof instance.setSelected === "function") {
                        const match = Array.isArray(instance.places)
                            ? instance.places.find((place) => String(place.id) === String(value))
                            : null;
                        if (match) {
                            instance.setSelected(match);
                            return true;
                        }
                    }
                } else if (typeof instance.clear === "function") {
                    instance.clear();
                    return true;
                }

                if (fallbackInput && fallbackInput.length) {
                    fallbackInput.val(value || "").trigger("change");
                }

                return false;
            };

            const fromHandled = applyValue(fromInstance, toValue, fromInput);
            const toHandled = applyValue(toInstance, fromValue, toInput);

            handledByPlaceSelect = fromHandled || toHandled;
        }

        if (!handledByPlaceSelect) {
            fromInput.val(toValue || "").trigger("change");
            toInput.val(fromValue || "").trigger("change");
        }
    });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?\d{10,15}$/;

    const getFeedbackElement = (input) =>
        input?.closest(".mb-3")?.querySelector(".invalid-feedback");

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
            submitButton.textContent = "Submitting...";
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

        const isAnyPopupOpen = document.querySelector(
            `${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`
        );
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

                document
                    .querySelectorAll(`${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`)
                    .forEach((openPopup) => {
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

            const openPopups = document.querySelectorAll(
                `${AUTH_POPUP_SELECTOR}.${AUTH_POPUP_OPEN_CLASS}`
            );
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
                fieldErrors.identifier = "Email or phone number is required.";
            } else if (!isValidIdentifier(identifier)) {
                fieldErrors.identifier = "Please enter a valid email or phone number.";
            }

            if (!password) {
                fieldErrors.password = "Password is required.";
            }

            if (Object.keys(fieldErrors).length > 0) {
                applyFieldErrors(loginForm, fieldErrors);
                showGlobalError(loginAlert, "Your login details are missing or invalid.");
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

                    const message =
                        data?.message || "An unexpected error occurred during login.";
                    showGlobalError(loginAlert, message);
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error("Login request failed:", error);
                showGlobalError(
                    loginAlert,
                    "Something went wrong while logging in. Please try again."
                );
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
            const passwordConfirm = (formData.get("passwordConfirm") || "")
                .toString()
                .trim();
            const fieldErrors = {};

            if (!identifier) {
                fieldErrors.identifier = "Email or phone number is required.";
            } else if (!isValidIdentifier(identifier)) {
                fieldErrors.identifier = "Please enter a valid email or phone number.";
            }

            if (!password) {
                fieldErrors.password = "Password is required.";
            } else if (password.length < 6) {
                fieldErrors.password = "Password must be at least 6 characters.";
            }

            if (!passwordConfirm) {
                fieldErrors.passwordConfirm = "Please confirm your password.";
            } else if (passwordConfirm !== password) {
                fieldErrors.passwordConfirm = "Passwords do not match.";
            }

            if (Object.keys(fieldErrors).length > 0) {
                applyFieldErrors(registerForm, fieldErrors);
                showGlobalError(registerAlert, "Please fix the errors in the form.");
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

                    const message =
                        data?.message || "An unexpected error occurred during sign up.";
                    showGlobalError(registerAlert, message);
                    return;
                }

                window.location.reload();
            } catch (error) {
                console.error("Sign up request failed:", error);
                showGlobalError(
                    registerAlert,
                    "Something went wrong while signing up. Please try again."
                );
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

        section
            .querySelectorAll(".bus-ticket-card")
            .forEach((card) => card.setAttribute("role", "listitem"));
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
                console.error("Logout request failed:", error);
                alert("Something went wrong while logging out. Please try again.");
                logoutButton.classList.remove("disabled");
                logoutButton.removeAttribute("aria-disabled");
            }
        });
    }
})();