const ticketFinderDate = $(".ticket-finder_date")
flatpickr(ticketFinderDate, {
    locale: "tr",
    defaultDate: new Date(),
})

$(".ticket-finder_search-button").off()
$(".ticket-finder_search-button").on("click", async e => {
    const fromId = $(".ticket-finder_from").val()
    const toId = $(".ticket-finder_to").val()
    const date = ticketFinderDate.val()
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