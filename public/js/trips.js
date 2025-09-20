var ticketPairs = [];

$(".trip").on("click", function () {
    $(this).find(".trip_content").slideToggle(300);
    this.classList.toggle("open");
});

$(".trip_content").on("click", function (e) {
    e.stopPropagation();
});

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

        highlightSeat(selectedTrip, selectedSeat);
        upsertTicketPair(selectedTrip, selectedSeat, "m");

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

        highlightSeat(selectedTrip, selectedSeat);
        upsertTicketPair(selectedTrip, selectedSeat, "f");

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

        try {
            const response = await fetch("/payment", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            let data = null;
            try {
                data = await response.json();
            } catch (parseError) {
                data = null;
            }

            if (!response.ok || !data) {
                throw new Error(
                    data && data.message
                        ? data.message
                        : "Ödeme isteği oluşturulamadı."
                );
            }

            if (!data.ticketPaymentId) {
                throw new Error("Beklenmeyen sunucu cevabı alındı.");
            }

            ticketPairs = ticketPairs.filter((ticket) => ticket.tripId !== tripId);

            window.location.href = `/payment/${data.ticketPaymentId}`;
        } catch (error) {
            alert(error.message || "Ödeme isteği oluşturulamadı.");
        }
    });
