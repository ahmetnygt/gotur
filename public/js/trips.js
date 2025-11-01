(() => {
    const placeSelectModule = window.GTR && window.GTR.placeSelect;
    if (placeSelectModule && typeof placeSelectModule.init === "function") {
        Promise.resolve(placeSelectModule.init()).catch((error) => {
            console.error(
                "Seyahat araması için yer seçici başlatılırken hata oluştu:",
                error
            );
        });
    }

    const changeButton = $(".trip-search_change");
    changeButton.off("click");
    changeButton.on("click", event => {
        event.preventDefault();

        const fromInput = $(".trip-search_from");
        const toInput = $(".trip-search_to");

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
                            ? instance.places.find(
                                place => String(place.id) === String(value)
                            )
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

    const tripSearchDateInput = document.querySelector(".trip-search_date");

    if (tripSearchDateInput) {
        const defaultDate = tripSearchDateInput.value || new Date();
        flatpickr(tripSearchDateInput, {
            locale: "tr",
            defaultDate,
            altInput: true,
            altFormat: "d F Y",
            altInputClass: "trip-search_date-alt",
            dateFormat: "Y-m-d",
        });
    }

    const searchButton = $(".trip-search_search-button");
    const getHiddenValue = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.value : "";
    };

    searchButton.off("click");
    searchButton.on("click", (event) => {
        event.preventDefault();

        const fromId = getHiddenValue(".trip-search_from");
        const toId = getHiddenValue(".trip-search_to");
        const dateValue = tripSearchDateInput ? tripSearchDateInput.value : "";

        if (!fromId || !toId || !dateValue) {
            return;
        }

        window.location.href = `/trips/${fromId}-${toId}/${dateValue}`;
    });
})();

const parseTimeToMinutes = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }

    const parts = text.split(":").map((part) => parseInt(part, 10));
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
    }

    return parts[0] * 60 + parts[1];
};

const parseDurationToMinutes = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).toLowerCase();
    if (!text.trim()) {
        return null;
    }

    let totalMinutes = 0;

    const hourMatch = text.match(/(\d+)\s*saat/);
    if (hourMatch) {
        const parsed = parseInt(hourMatch[1], 10);
        if (Number.isFinite(parsed)) {
            totalMinutes += parsed * 60;
        }
    }

    const minuteMatch = text.match(/(\d+)\s*dakika/);
    if (minuteMatch) {
        const parsed = parseInt(minuteMatch[1], 10);
        if (Number.isFinite(parsed)) {
            totalMinutes += parsed;
        }
    }

    if (!totalMinutes) {
        const colonMatch = text.match(/(\d+):(\d+)/);
        if (colonMatch) {
            const hours = parseInt(colonMatch[1], 10);
            const minutes = parseInt(colonMatch[2], 10);
            if (Number.isFinite(hours) && Number.isFinite(minutes)) {
                totalMinutes = hours * 60 + minutes;
            }
        }
    }

    return totalMinutes || null;
};

const parsePrice = (value) => {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const tripGrid = document.getElementById("trip-results-grid");
const tripEmptyState = document.querySelector(".trip-results_empty");

const tripRows = tripGrid
    ? Array.from(tripGrid.querySelectorAll(".trip")).map((tripEl, index) => {
        const wrapper = tripEl.closest(".col-4");

        return {
            index,
            wrapper,
            element: tripEl,
            firm: String(tripEl.dataset.firm || ""),
            fromStopId: tripEl.dataset.fromStopId
                ? String(tripEl.dataset.fromStopId)
                : "",
            toStopId: tripEl.dataset.toStopId
                ? String(tripEl.dataset.toStopId)
                : "",
            departureMinutes: parseTimeToMinutes(tripEl.dataset.departureTime),
            durationMinutes: parseDurationToMinutes(tripEl.dataset.duration),
            price: parsePrice(tripEl.dataset.price),
            isVisible: true,
        };
    })
    : [];

const sortSelect = document.getElementById("trip-sort-select");
const firmFilter = document.getElementById("trip-filter-firm");
const fromFilter = document.getElementById("trip-filter-from");
const toFilter = document.getElementById("trip-filter-to");
const timeStartInput = document.getElementById("trip-filter-time-start");
const timeEndInput = document.getElementById("trip-filter-time-end");

const compareNumbers = (firstValue, secondValue) => {
    const a = Number.isFinite(firstValue)
        ? firstValue
        : Number.POSITIVE_INFINITY;
    const b = Number.isFinite(secondValue)
        ? secondValue
        : Number.POSITIVE_INFINITY;

    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
};

const buildComparator = (key) => {
    switch (key) {
        case "price":
            return (a, b) =>
                compareNumbers(a.price, b.price) || a.index - b.index;
        case "duration":
            return (a, b) =>
                compareNumbers(a.durationMinutes, b.durationMinutes) ||
                a.index - b.index;
        case "departureTime":
        default:
            return (a, b) =>
                compareNumbers(a.departureMinutes, b.departureMinutes) ||
                a.index - b.index;
    }
};

const parseTimeInputValue = (input) => {
    if (!input) {
        return null;
    }

    return parseTimeToMinutes(input.value);
};

const applyFiltersAndSorting = () => {
    if (!tripGrid || !tripRows.length) {
        if (tripEmptyState) {
            tripEmptyState.style.display = tripRows.length ? "none" : "";
        }
        return;
    }

    const sortKey = sortSelect ? sortSelect.value : "departureTime";
    const firmValue = firmFilter ? firmFilter.value : "";
    const fromValue = fromFilter ? fromFilter.value : "";
    const toValue = toFilter ? toFilter.value : "";

    let startMinutes = parseTimeInputValue(timeStartInput);
    let endMinutes = parseTimeInputValue(timeEndInput);

    if (
        startMinutes !== null &&
        endMinutes !== null &&
        Number.isFinite(startMinutes) &&
        Number.isFinite(endMinutes) &&
        endMinutes < startMinutes
    ) {
        const temp = startMinutes;
        startMinutes = endMinutes;
        endMinutes = temp;
    }

    tripRows.forEach((row) => {
        const matchesFirm = !firmValue || row.firm === firmValue;
        const matchesFrom = !fromValue || row.fromStopId === fromValue;
        const matchesTo = !toValue || row.toStopId === toValue;

        const matchesStart =
            startMinutes === null ||
            (Number.isFinite(row.departureMinutes) &&
                row.departureMinutes >= startMinutes);

        const matchesEnd =
            endMinutes === null ||
            (Number.isFinite(row.departureMinutes) &&
                row.departureMinutes <= endMinutes);

        const isVisible =
            matchesFirm && matchesFrom && matchesTo && matchesStart && matchesEnd;

        row.isVisible = isVisible;

        if (row.wrapper) {
            row.wrapper.style.display = isVisible ? "" : "none";
        }
    });

    const comparator = buildComparator(sortKey);
    const sortedRows = [...tripRows].sort(comparator);

    sortedRows.forEach((row) => {
        if (row.wrapper) {
            tripGrid.appendChild(row.wrapper);
        }
    });

    if (tripEmptyState) {
        const hasVisible = tripRows.some((row) => row.isVisible);
        tripEmptyState.style.display = hasVisible ? "none" : "";
    }
};

if (tripGrid) {
    const triggerUpdate = () => applyFiltersAndSorting();

    if (sortSelect) {
        sortSelect.addEventListener("change", triggerUpdate);
    }

    [firmFilter, fromFilter, toFilter].forEach((select) => {
        if (select) {
            select.addEventListener("change", triggerUpdate);
        }
    });

    [timeStartInput, timeEndInput].forEach((input) => {
        if (input) {
            input.addEventListener("input", triggerUpdate);
        }
    });

    applyFiltersAndSorting();
}

var ticketPairs = [];

const currencyFormatter = (() => {
    try {
        return new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency: "TRY",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch (error) {
        return null;
    }
})();

const formatCurrency = (value) => {
    if (!Number.isFinite(value)) {
        return "";
    }

    if (currencyFormatter) {
        return currencyFormatter.format(value);
    }

    try {
        return `${value.toFixed(2)} TL`;
    } catch (error) {
        return `${value} TL`;
    }
};

const updateTripSeatSummary = (tripId) => {
    if (!tripId) {
        return;
    }

    const $trip = $(`.trip[data-trip-id='${tripId}']`);
    if (!$trip.length) {
        return;
    }

    const $summary = $trip.find(".trip_info-selection");
    if (!$summary.length) {
        return;
    }

    const placeholder = $summary.data("placeholder") || "";
    const selectedTickets = ticketPairs.filter(
        (ticket) => ticket.tripId === tripId
    );

    if (!selectedTickets.length) {
        $summary.text(placeholder);
        return;
    }

    const seats = selectedTickets
        .map((ticket) => ticket.seatNumber)
        .sort((firstSeat, secondSeat) => {
            const firstNumber = Number(firstSeat);
            const secondNumber = Number(secondSeat);

            if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
                return firstNumber - secondNumber;
            }

            return String(firstSeat).localeCompare(String(secondSeat), "tr");
        });

    const seatText = seats.join(", ");

    const pricePerSeat = Number($trip.data("price"));
    let totalText = "";

    if (Number.isFinite(pricePerSeat)) {
        const totalPrice = pricePerSeat * selectedTickets.length;
        const formatted = formatCurrency(totalPrice);
        if (formatted) {
            totalText = ` - Toplam: ${formatted}`;
        }
    }

    $summary.text(`Koltuklar: ${seatText}${totalText}`);
};

$(".trip").on("click", function () {
    $(this).find(".trip_content").slideToggle(300);
    this.classList.toggle("open");
});

$(".trip_content").on("click", function (e) {
    e.stopPropagation();
});

const tripDescriptionContainers = Array.from(
    document.querySelectorAll(".trip-description")
);

if (tripDescriptionContainers.length) {
    const mobileQuery = window.matchMedia("(max-width: 768px)");

    const syncDescriptionState = () => {
        const isMobile = mobileQuery.matches;

        tripDescriptionContainers.forEach((container) => {
            const header = container.querySelector(".trip-description_header");

            if (!header) {
                return;
            }

            if (container.dataset.userToggled !== "true") {
                container.dataset.userToggled = "false";
            }

            if (isMobile) {
                const shouldBeOpen = container.dataset.userToggled === "true";
                container.classList.toggle("is-open", shouldBeOpen);
            } else {
                container.classList.add("is-open");
            }

            header.setAttribute(
                "aria-expanded",
                container.classList.contains("is-open") ? "true" : "false"
            );
        });
    };

    const toggleDescription = (container) => {
        if (!mobileQuery.matches) {
            return;
        }

        const header = container.querySelector(".trip-description_header");

        if (!header) {
            return;
        }

        const nextState = !container.classList.contains("is-open");
        container.classList.toggle("is-open", nextState);
        container.dataset.userToggled = nextState ? "true" : "false";
        header.setAttribute("aria-expanded", nextState ? "true" : "false");
    };

    tripDescriptionContainers.forEach((container) => {
        const header = container.querySelector(".trip-description_header");

        if (!header) {
            return;
        }

        if (container.dataset.userToggled !== "true") {
            container.dataset.userToggled = "false";
        }

        header.addEventListener("click", () => {
            toggleDescription(container);
        });

        header.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleDescription(container);
            }
        });
    });

    syncDescriptionState();

    const handleMediaChange = () => {
        syncDescriptionState();
    };

    if (typeof mobileQuery.addEventListener === "function") {
        mobileQuery.addEventListener("change", handleMediaChange);
    } else if (typeof mobileQuery.addListener === "function") {
        mobileQuery.addListener(handleMediaChange);
    }
}

var selectedSeat = null;
var selectedTrip = null;

$(".trip_seat")
    .off()
    .on("click", (seat) => {
        const $seat = $(seat.currentTarget);
        const isAvailable = $seat.data("is-available");
        if (!isAvailable) {
            return;
        }

        const seatNumber = String($seat.data("seat-number"));
        const tripId = String($seat.data("trip"));
        const isSameSelection =
            seatNumber === selectedSeat && tripId === selectedTrip;

        if (!isSameSelection) {
            selectedSeat = seatNumber;
            selectedTrip = tripId;
            seat.stopPropagation();
            const genderPick = document.querySelector(".gender-pick");

            const rect = seat.currentTarget.getBoundingClientRect();
            const left = rect.left + rect.width / 2 + window.scrollX;
            const top = rect.bottom + window.scrollY;

            genderPick.style.position = "absolute";
            genderPick.style.left = left + "px";
            genderPick.style.top = top + "px";
            genderPick.style.transform = "translate(-50%,-125%)";

            genderPick.classList.add("show");
        } else {
            selectedSeat = null;
            selectedTrip = null;
            document.querySelector(".gender-pick").classList.remove("show");
        }
    });

const highlightSeat = (tripId, seatNumber) => {
    const $seat = $(
        `.trip_seat[data-trip='${tripId}'][data-seat-number='${seatNumber}']`
    );
    $seat.find("rect").attr({
        fill: "#02ff89",
        stroke: "#00c76a",
    });
    $seat.find("span").css("color", "#008346ff");
};

const upsertTicketPair = (tripId, seatNumber, gender) => {
    ticketPairs = ticketPairs.filter(
        (ticket) =>
            !(ticket.tripId === tripId && ticket.seatNumber === seatNumber)
    );
    ticketPairs.push({ tripId, seatNumber, gender });
};

$(".gender-pick .m")
    .off()
    .on("click", () => {
        if (!selectedSeat || !selectedTrip) {
            return;
        }

        const tripId = selectedTrip;
        const seatNumber = selectedSeat;

        highlightSeat(tripId, seatNumber);
        upsertTicketPair(tripId, seatNumber, "m");
        updateTripSeatSummary(tripId);

        selectedSeat = null;
        selectedTrip = null;
        $(".gender-pick").removeClass("show");
    });

$(".gender-pick .f")
    .off()
    .on("click", () => {
        if (!selectedSeat || !selectedTrip) {
            return;
        }

        const tripId = selectedTrip;
        const seatNumber = selectedSeat;

        highlightSeat(tripId, seatNumber);
        upsertTicketPair(tripId, seatNumber, "f");
        updateTripSeatSummary(tripId);

        selectedSeat = null;
        selectedTrip = null;
        $(".gender-pick").removeClass("show");
    });

$(".trip_confirm-button")
    .off()
    .on("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const $trip = $(e.currentTarget).closest(".trip");
        const tripIdData = $trip.data("tripId");
        const fromStopId = $trip.data("fromStopId");
        const toStopId = $trip.data("toStopId");
        const firmKey = $trip.data("firm");

        const tripId =
            typeof tripIdData === "undefined" ? null : String(tripIdData);

        if (!tripId) {
            alert("Sefer bilgisi bulunamadı.");
            return;
        }

        const selectedTickets = ticketPairs.filter(
            (ticket) => ticket.tripId === tripId
        );

        if (!selectedTickets.length) {
            alert("Lütfen en az bir koltuk seçin.");
            return;
        }

        if (
            typeof fromStopId === "undefined" ||
            typeof toStopId === "undefined"
        ) {
            alert("Sefer durak bilgileri eksik.");
            return;
        }

        if (!firmKey) {
            alert("Firma bilgisi bulunamadı.");
            return;
        }

        const payload = {
            tripId,
            fromStopId,
            toStopId,
            seatNumbers: selectedTickets.map((ticket) => ticket.seatNumber),
            genders: selectedTickets.map((ticket) => ticket.gender),
            firmKey,
        };

        window.location.href = `https://arenaturizm.com/`;

        // try {
        //     const response = await fetch("/payment", {
        //         method: "POST",
        //         headers: {
        //             "Content-Type": "application/json",
        //         },
        //         body: JSON.stringify(payload),
        //     });

        //     let data = null;
        //     try {
        //         data = await response.json();
        //     } catch (parseError) {
        //         data = null;
        //     }

        //     if (!response.ok || !data) {
        //         throw new Error(
        //             data && data.message
        //                 ? data.message
        //                 : "Ödeme isteği oluşturulamadı."
        //         );
        //     }

        //     if (!data.ticketPaymentId) {
        //         throw new Error("Beklenmeyen sunucu cevabı alındı.");
        //     }

        //     ticketPairs = ticketPairs.filter((ticket) => ticket.tripId !== tripId);
        //     updateTripSeatSummary(tripId);

        //     window.location.href = `/payment/${data.ticketPaymentId}`;
    // } catch (error) {
    //     alert(error.message || "Ödeme isteği oluşturulamadı.");
    // }
    });
