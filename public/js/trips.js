$(".trip").on("click", function () {
    $(this).find(".trip_content").slideToggle(300);
    trip.classList.toggle("open");
});