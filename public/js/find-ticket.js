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
  const phoneInput = document.getElementById("phone-input");
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

    if (!message) {
      return;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-container";

    const paragraph = document.createElement("p");
    paragraph.className = "text-muted mb-0";
    paragraph.textContent = message;

    placeholder.appendChild(paragraph);
    resultsContainer.appendChild(placeholder);
  }

  function renderTickets(html) {
    if (!resultsContainer) {
      return;
    }

    resultsContainer.innerHTML = html || "";
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
      const query = new URLSearchParams(payload).toString();
      const response = await fetch(`/api/find-ticket?${query}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let message = "Bilet aranırken bir hata oluştu.";
        try {
          const errorPayload = await response.json();
          if (errorPayload && errorPayload.message) {
            message = errorPayload.message;
          }
        } catch (error) {
          // JSON parse edilemedi, varsayılan mesaj kullanılacak
        }
        throw new Error(message);
      }

      const data = await response.json();
      renderTickets(data && typeof data.html === "string" ? data.html : "");

      if (data && typeof data.ticketCount === "number" && data.ticketCount > 0) {
        renderStatus(`${data.ticketCount} bilet bulundu.`, "success");
      } else {
        renderStatus("Eşleşen bilet bulunamadı.", "info");
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
