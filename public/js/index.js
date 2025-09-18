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
    const url = `/trips/${fromId}-${toId}/${date}`
    window.location.href = url;
})