const tripFinderDate = $(".trip-finder_date")
flatpickr(tripFinderDate, {
    locale: "tr",
    defaultDate: new Date(),
})

$(".trip-finder_search-button").off()
$(".trip-finder_search-button").on("click", async e => {
    const fromId = $(".trip-finder_from").val()
    const toId = $(".trip-finder_to").val()
    const date = tripFinderDate.val()
    await $.ajax({
        url: "/get-trips",
        type: "GET",
        data: { fromId, toId, date },
        success: async function (response) {
            console.log(response)
        },
        error: function (xhr, status, error) {
            console.log(error.message);
        }
    });
})