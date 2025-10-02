(function () {
  const form = document.getElementById("find-ticket-form");
  const statusContainer = document.getElementById("find-ticket-status");
  const resultsContainer = document.getElementById("find-ticket-results");
  const submitButton = form?.querySelector("button[type='submit']");
  const submitText = submitButton?.querySelector(".find-ticket-submit-text");
  const submitSpinner = submitButton?.querySelector(".find-ticket-submit-spinner");
  const firmSelectElement = document.getElementById("firm-select");
  const firmSelect = firmSelectElement ? window.jQuery(firmSelectElement) : null;
  const contactRadios = form
    ? Array.from(form.querySelectorAll("input[name='contactType']"))
    : [];
  const contactInputWrappers = form
    ? Array.from(form.querySelectorAll(".contact-input-wrapper"))
    : [];
  let firmsLoaded = false;

  function setSubmitting(isSubmitting) {
    if (!submitButton || !submitText || !submitSpinner) {
      return;
    }

    submitButton.disabled = isSubmitting;
    submitSpinner.style.display = isSubmitting ? "inline-block" : "none";
    submitText.style.opacity = isSubmitting ? "0.65" : "1";
  }

  function getSelectedContactType() {
    const selectedRadio = contactRadios.find((radio) => radio.checked);
    return selectedRadio?.value === "email" ? "email" : "phone";
  }

  function updateContactInputs() {
    const selectedType = getSelectedContactType();

    contactInputWrappers.forEach((wrapper) => {
      const wrapperType = wrapper.dataset.contactType;
      const isActive = wrapperType === selectedType;
      wrapper.classList.toggle("is-active", isActive);

      const input = wrapper.querySelector("input");
      if (input) {
        input.disabled = !isActive;
      }
    });
  }

  function normalisePhoneValue(value) {
    return (value || "").replace(/\D+/g, "").slice(0, 10);
  }

  function formatPhoneValue(value) {
    const digits = normalisePhoneValue(value);
    const segments = [];

    if (digits.length > 0) {
      segments.push(digits.slice(0, 3));
    }
    if (digits.length > 3) {
      segments.push(digits.slice(3, 6));
    }
    if (digits.length > 6) {
      segments.push(digits.slice(6, 8));
    }
    if (digits.length > 8) {
      segments.push(digits.slice(8, 10));
    }

    return segments.join(" ");
  }

  function handlePhoneInput(event) {
    const { value } = event.target;
    event.target.value = formatPhoneValue(value);
  }

  function renderStatus(message, type = "info") {
    if (!statusContainer) {
      return;
    }

    statusContainer.innerHTML = "";

    if (!message) {
      return;
    }

    const alert = document.createElement("div");
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    statusContainer.appendChild(alert);
  }

  function clearResults(message) {
    if (!resultsContainer) {
      return;
    }

    resultsContainer.innerHTML = "";
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-container";
    placeholder.innerHTML = `<p class="text-muted mb-0">${message}</p>`;
    resultsContainer.appendChild(placeholder);
  }

  function formatDate(dateString) {
    if (!dateString) {
      return "-";
    }

    try {
      const formatter = new Intl.DateTimeFormat("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return formatter.format(new Date(`${dateString}T00:00:00`));
    } catch (error) {
      return dateString;
    }
  }

  function formatTime(timeString) {
    if (!timeString) {
      return "-";
    }

    const [hours = "00", minutes = "00"] = String(timeString).split(":");
    return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
  }

  function buildStatusBadge(status) {
    if (!status) {
      return "";
    }

    const lower = status.toLowerCase();
    const baseClass = "status-badge";
    if (lower === "pending") {
      return `<span class="${baseClass} status-pending">Beklemede</span>`;
    }
    if (lower === "canceled" || lower === "refund") {
      return `<span class="${baseClass} status-canceled">İptal</span>`;
    }
    if (lower === "completed" || lower === "web" || lower === "gotur") {
      return `<span class="${baseClass}">Onaylandı</span>`;
    }
    return `<span class="${baseClass}">${status}</span>`;
  }

  function renderTickets(tickets) {
    if (!resultsContainer) {
      return;
    }

    resultsContainer.innerHTML = "";

    if (!Array.isArray(tickets) || !tickets.length) {
      clearResults("Eşleşen bilet bulunamadı.");
      return;
    }

    const list = document.createElement("div");
    list.className = "find-ticket-results-list";

    tickets.forEach((ticket) => {
      const item = document.createElement("article");
      item.className = "find-ticket-result-item";

      const header = document.createElement("div");
      header.className = "ticket-header";
      header.innerHTML = `
        <div>
          <div class="label text-uppercase">Yolcu</div>
          <div class="value">${ticket.passenger?.fullName || "-"}</div>
        </div>
        <div class="pnr-badge">${ticket.pnr || "PNR YOK"}</div>
      `;

      const body = document.createElement("div");
      body.className = "ticket-body";

      const fromStop = ticket.fromStop?.title || ticket.trip?.fromPlace || "-";
      const toStop = ticket.toStop?.title || ticket.trip?.toPlace || "-";
      const tripDate = formatDate(ticket.trip?.date);
      const tripTime = formatTime(ticket.trip?.time);
      const phoneNumber = formatPhoneValue(ticket.phoneNumber || "");

      body.innerHTML = `
        <div>
          <div class="label">Kalkış</div>
          <div class="value">${fromStop}</div>
        </div>
        <div>
          <div class="label">Varış</div>
          <div class="value">${toStop}</div>
        </div>
        <div>
          <div class="label">Seyahat Tarihi</div>
          <div class="value">${tripDate}</div>
        </div>
        <div>
          <div class="label">Seyahat Saati</div>
          <div class="value">${tripTime}</div>
        </div>
        <div>
          <div class="label">Koltuk</div>
          <div class="value">${ticket.seatNo || "-"}</div>
        </div>
        <div>
          <div class="label">Telefon</div>
          <div class="value">${phoneNumber || "-"}</div>
        </div>
        <div>
          <div class="label">E-posta</div>
          <div class="value">${ticket.contactEmail || "-"}</div>
        </div>
      `;

      const footer = document.createElement("div");
      footer.className = "ticket-footer";
      footer.innerHTML = `
        ${buildStatusBadge(ticket.status)}
        <span class="meta-item">
          <i class="fa-regular fa-calendar"></i>
          ${ticket.createdAtFormatted || "Oluşturulma tarihi bilinmiyor"}
        </span>
      `;

      item.appendChild(header);
      item.appendChild(body);
      item.appendChild(footer);
      list.appendChild(item);
    });

    resultsContainer.appendChild(list);
  }

  async function loadFirms() {
    if (!firmSelect || firmsLoaded) {
      return;
    }

    try {
      const response = await fetch("/api/firms");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const firms = Array.isArray(data) ? data : [];

      firms.forEach((firm) => {
        const option = new Option(
          firm.displayName || firm.key,
          firm.key,
          false,
          false
        );
        firmSelect.append(option);
      });

      firmSelect.trigger("change");
      firmsLoaded = true;
    } catch (error) {
      console.error("Firmalar yüklenirken hata oluştu:", error);
      renderStatus(
        "Firmalar yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.",
        "danger"
      );
    }
  }

  function initialiseSelect() {
    if (!firmSelect) {
      return;
    }

    firmSelect.select2({
      placeholder: firmSelectElement?.dataset.placeholder || "Firma seçin",
      width: "100%",
      allowClear: true,
      language: {
        noResults: () => "Sonuç bulunamadı",
        searching: () => "Aranıyor...",
      },
    });

    loadFirms();
  }

  function buildPayload(formData) {
    const payload = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = typeof value === "string" ? value.trim() : value;
    }

    const contactType = payload.contactType === "email" ? "email" : "phone";
    const phone = contactType === "phone" ? normalisePhoneValue(payload.phone) : "";
    const email = contactType === "email" ? payload.email || "" : "";

    return {
      firmKey: payload.firmKey || "",
      pnr: payload.pnr || "",
      contactType,
      phone,
      email,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form) {
      return;
    }

    const payload = buildPayload(new FormData(form));

    if (!payload.firmKey) {
      renderStatus("Lütfen bir firma seçin.", "warning");
      return;
    }

    if (!payload.pnr && !payload.phone && !payload.email) {
      renderStatus(
        "Lütfen PNR veya iletişim bilgilerinizden en az birini girin.",
        "warning"
      );
      return;
    }

    if (payload.contactType === "phone" && payload.phone && payload.phone.length !== 10) {
      renderStatus(
        "Telefon numarası 10 haneli olmalıdır.",
        "warning"
      );
      return;
    }

    renderStatus("", "info");
    setSubmitting(true);

    try {
      const response = await fetch("/api/find-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Bilet aranırken bir hata oluştu.";
        try {
          const errorPayload = await response.json();
          if (errorPayload && errorPayload.message) {
            message = errorPayload.message;
          }
        } catch (error) {
          // Yoksay
        }
        throw new Error(message);
      }

      const data = await response.json();
      renderTickets(data && Array.isArray(data.tickets) ? data.tickets : []);

      if (!data || !Array.isArray(data.tickets) || !data.tickets.length) {
        renderStatus("Eşleşen bilet bulunamadı.", "info");
      } else {
        renderStatus(`${data.tickets.length} bilet bulundu.`, "success");
      }
    } catch (error) {
      console.error("Bilet arama hatası:", error);
      renderStatus(error.message || "Bilet aranırken bir hata oluştu.", "danger");
      clearResults("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  contactRadios.forEach((radio) => {
    radio.addEventListener("change", updateContactInputs);
  });

  if (phoneInput) {
    phoneInput.addEventListener("input", handlePhoneInput);
    phoneInput.addEventListener("blur", handlePhoneInput);
  }

  updateContactInputs();

  if (firmSelect) {
    window.jQuery(document).ready(initialiseSelect);
  }
})();
