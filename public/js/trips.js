var ticketPairs = [];

$(".trip").on("click", function () {
    $(this).find(".trip_content").slideToggle(300);
    this.classList.toggle("open");
});

$(".trip_content").on("click", function (e) {
    e.stopPropagation();
});

var selectedSeat = null;
$(".trip_seat").off().on("click", seat => {
    if ($(seat.currentTarget).data("is-available") == true) {
        if ($(seat.currentTarget).data("seat-number") != selectedSeat) {
            selectedSeat = $(seat.currentTarget).data("seat-number");
            seat.stopPropagation();
            const genderPick = document.querySelector(".gender-pick");

            // Koltuğun konumunu al
            const rect = seat.currentTarget.getBoundingClientRect();

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
        }
        else {
            selectedSeat = null;
            const genderPick = document.querySelector(".gender-pick");
            genderPick.classList.remove("show");
        }
    }
})

$(".gender-pick .m").off().on("click", e => {
    $(".gender-pick .m").off().on("click", e => {
        if (!selectedSeat) return; // seçili seat yoksa çık

        // Seçilen seat elementini bul
        const $seat = $(`.trip_seat[data-seat-number='${selectedSeat}']`);

        // İçindeki rect’leri renklendir
        $seat.find("rect").attr({
            fill: "#02ff89",   // sarı
            stroke: "#00c76a", // daha koyu sarı/kahverengi
        });

        // Koltuk numarası yazısını daha okunaklı yapmak için siyah yap
        $seat.find("span").css("color", "#008346ff");

        ticketPairs.push([$seat.data("seat-number"),"m"])
        
        // Gender pick popup'ı kapat
        $(".gender-pick").removeClass("show");
    });
    
})

$(".gender-pick .f").off().on("click", e => {
    $(".gender-pick .f").off().on("click", e => {
        if (!selectedSeat) return; // seçili seat yoksa çık
        
        // Seçilen seat elementini bul
        const $seat = $(`.trip_seat[data-seat-number='${selectedSeat}']`);
        
        // İçindeki rect’leri renklendir
        $seat.find("rect").attr({
            fill: "#02ff89",   // sarı
            stroke: "#00c76a", // daha koyu sarı/kahverengi
        });
        
        // Koltuk numarası yazısını daha okunaklı yapmak için siyah yap
        $seat.find("span").css("color", "#008346ff");

        ticketPairs.push([$seat.data("seat-number"),"f"])

        // Gender pick popup'ı kapat
        $(".gender-pick").removeClass("show");
    });

})