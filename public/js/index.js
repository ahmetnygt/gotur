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

$(".trip-finder_search-button").off();
$(".trip-finder_search-button").on("click", async e => {
    const fromId = $(".trip-finder_from").val();
    const toId = $(".trip-finder_to").val();
    const date = tripFinderDate.val();
    const url = `/trips/${fromId}-${toId}/${date}`;
    window.location.href = url;
});
