$(".trip").on("click", function () {
    $(this).find(".trip_content").slideToggle(300);
    trip.classList.toggle("open");
});

document.querySelectorAll(".trip_seat").forEach(seat => {
    seat.addEventListener("click", e => {
        const genderPick = document.querySelector(".gender-pick");

        // Koltuğun konumunu al
        const rect = seat.getBoundingClientRect();

        // Ortaya ve altına hizala
        const left = rect.left + rect.width / 2 + window.scrollX;
        const top = rect.bottom + window.scrollY;

        // gender-pick’i pozisyonla
        genderPick.style.position = "absolute";
        genderPick.style.left = left + "px";
        genderPick.style.top = top + "px";
        genderPick.style.transform = "translate(-50%,-125%)"; // ortalamak için

        // göster
        genderPick.classList.add("show");
    });
});