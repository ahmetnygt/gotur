(function () {
  const POPUP_ID = "ticketCancelPopup";
  const OPEN_CLASS = "is-open";
  const BODY_CLASS = "auth-popup-open";
  const MESSAGE_VISIBLE_CLASS = "is-visible";
  const COUNTDOWN_SECONDS = 60;

  let activeContext = null;
  let countdownTimer = null;
  let countdownRemaining = 0;
  let isSendingCode = false;
  let isConfirming = false;

  function getPopup() {
    return document.getElementById(POPUP_ID);
  }

  function getMessageElement(popup) {
    return popup ? popup.querySelector("[data-ticket-message]") : null;
  }

  function getCodeInput(popup) {
    return popup ? popup.querySelector("[data-ticket-code-input]") : null;
  }

  function getCountdownElement(popup) {
    return popup ? popup.querySelector("[data-ticket-countdown]") : null;
  }

  function getSendButton(popup) {
    return popup ? popup.querySelector("[data-ticket-send-code]") : null;
  }

  function getResendButton(popup) {
    return popup ? popup.querySelector("[data-ticket-resend-code]") : null;
  }

  function getConfirmButton(popup) {
    return popup ? popup.querySelector("[data-ticket-confirm-cancel]") : null;
  }

  function anyPopupOpen() {
    return Boolean(document.querySelector(`.auth-popup.${OPEN_CLASS}`));
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
      return;
    }

    if (isLoading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent.trim();
      }
      button.disabled = true;
      button.textContent = loadingText || "Gönderiliyor...";
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function setMessage(type, text) {
    const popup = getPopup();
    const messageElement = getMessageElement(popup);

    if (!messageElement) {
      return;
    }

    const typeClasses = ["alert-info", "alert-success", "alert-danger", "alert-warning"];
    messageElement.classList.remove(...typeClasses);

    if (!text) {
      messageElement.textContent = "";
      messageElement.classList.remove(MESSAGE_VISIBLE_CLASS);
      messageElement.classList.add("alert-info");
      return;
    }

    let className = "alert-info";
    if (type === "success") {
      className = "alert-success";
    } else if (type === "error") {
      className = "alert-danger";
    }

    messageElement.textContent = text;
    messageElement.classList.add(className, MESSAGE_VISIBLE_CLASS);
  }

  function clearMessage() {
    setMessage(null, "");
  }

  function stopCountdown() {
    const popup = getPopup();
    const countdownElement = getCountdownElement(popup);
    const resendButton = getResendButton(popup);

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    countdownRemaining = 0;
    if (countdownElement) {
      countdownElement.textContent = "";
    }

    if (resendButton) {
      resendButton.disabled = !(activeContext && activeContext.codeSent);
    }
  }

  function updateCountdownDisplay() {
    const popup = getPopup();
    const countdownElement = getCountdownElement(popup);
    if (!countdownElement) {
      return;
    }

    if (countdownRemaining > 0) {
      countdownElement.textContent = `${countdownRemaining} saniye sonra yeniden gönderebilirsiniz.`;
    } else {
      countdownElement.textContent = "";
    }
  }

  function startCountdown() {
    stopCountdown();

    const resendButton = getResendButton(getPopup());
    if (resendButton) {
      resendButton.disabled = true;
    }

    countdownRemaining = COUNTDOWN_SECONDS;
    updateCountdownDisplay();

    countdownTimer = setInterval(() => {
      countdownRemaining -= 1;
      if (countdownRemaining <= 0) {
        stopCountdown();
        updateCountdownDisplay();
        return;
      }
      updateCountdownDisplay();
    }, 1000);
  }

  function fillDetail(popup, detail, value) {
    const target = popup ? popup.querySelector(`[data-ticket-detail='${detail}']`) : null;
    if (target) {
      target.textContent = value || "-";
    }
  }

  function fillDetails(context) {
    const popup = getPopup();
    if (!popup) {
      return;
    }

    fillDetail(popup, "pnr", context.pnr || "-");
    fillDetail(popup, "passenger", context.passenger || "-");
    fillDetail(popup, "from", context.from || "-");
    fillDetail(popup, "to", context.to || "-");
    fillDetail(popup, "date", context.date || "-");
    fillDetail(popup, "time", context.time || "-");
    fillDetail(popup, "seat", context.seat || "-");
  }

  function resetPopupState() {
    const popup = getPopup();
    const codeInput = getCodeInput(popup);
    const sendButton = getSendButton(popup);
    const resendButton = getResendButton(popup);

    stopCountdown();
    clearMessage();

    if (codeInput) {
      codeInput.value = "";
      codeInput.disabled = false;
    }

    if (sendButton) {
      setButtonLoading(sendButton, false);
      sendButton.disabled = false;
    }

    if (resendButton) {
      setButtonLoading(resendButton, false);
      resendButton.disabled = true;
    }
  }

  function openPopup(context) {
    const popup = getPopup();
    if (!popup) {
      return;
    }

    activeContext = { ...context, codeSent: false };
    resetPopupState();
    fillDetails(activeContext);

    popup.classList.add(OPEN_CLASS);
    popup.setAttribute("aria-hidden", "false");
    document.body.classList.add(BODY_CLASS);

    const codeInput = getCodeInput(popup);
    if (codeInput) {
      setTimeout(() => {
        codeInput.focus();
      }, 100);
    }
  }

  function closePopup() {
    const popup = getPopup();
    if (!popup) {
      return;
    }

    stopCountdown();

    popup.classList.remove(OPEN_CLASS);
    popup.setAttribute("aria-hidden", "true");

    if (!anyPopupOpen()) {
      document.body.classList.remove(BODY_CLASS);
    }

    activeContext = null;
  }

  function gatherContext(trigger) {
    const itemElement = trigger?.closest("[data-ticket-item]");
    if (!itemElement) {
      return null;
    }

    const {
      ticketPnr,
      ticketFirmKey,
      ticketPassenger,
      ticketFrom,
      ticketTo,
      ticketTripDate,
      ticketTripTime,
      ticketSeat,
    } = itemElement.dataset;

    return {
      itemElement,
      pnr: (ticketPnr || "").trim(),
      firmKey: (ticketFirmKey || "").trim(),
      passenger: (ticketPassenger || "").trim(),
      from: (ticketFrom || "").trim(),
      to: (ticketTo || "").trim(),
      date: (ticketTripDate || "").trim(),
      time: (ticketTripTime || "").trim(),
      seat: (ticketSeat || "").trim(),
    };
  }

  async function handleSendCode(isResend) {
    if (!activeContext || isSendingCode) {
      return;
    }

    const popup = getPopup();
    if (!popup) {
      return;
    }

    const targetButton = isResend ? getResendButton(popup) : getSendButton(popup);
    const otherButton = isResend ? getSendButton(popup) : getResendButton(popup);

    if (!targetButton) {
      return;
    }

    isSendingCode = true;
    setButtonLoading(targetButton, true, "Gönderiliyor...");
    clearMessage();

    let requestSucceeded = false;
    try {
      const response = await fetch("/api/ticket/cancel/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pnr: activeContext.pnr,
          firmKey: activeContext.firmKey,
        }),
      });

      let payload = null;
      try {
        payload = await response.clone().json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || "Doğrulama kodu gönderilemedi.";
        setMessage("error", errorMessage);
        return;
      }

      if (!payload?.success) {
        setMessage("error", payload?.message || "Doğrulama kodu gönderilemedi.");
        return;
      }

      requestSucceeded = true;
      activeContext.codeSent = true;
      setMessage("success", "Verification code sent.");

      const sendButton = getSendButton(popup);
      if (sendButton) {
        sendButton.disabled = true;
      }

      if (otherButton) {
        otherButton.disabled = true;
      }

      startCountdown();
    } catch (error) {
      setMessage("error", "Doğrulama kodu gönderilirken bir hata oluştu.");
    } finally {
      setButtonLoading(targetButton, false);
      if (requestSucceeded) {
        targetButton.disabled = true;
      }
      if (otherButton) {
        if (isResend) {
          otherButton.disabled = true;
        } else if (!requestSucceeded) {
          otherButton.disabled = true;
        }
      }
      isSendingCode = false;
    }
  }

  function updateTicketStatus(itemElement) {
    if (!itemElement) {
      return;
    }

    const statusBadge = itemElement.querySelector("[data-ticket-status-label]");
    if (statusBadge) {
      statusBadge.textContent = "Canceled";
      statusBadge.classList.add("status-canceled");
      statusBadge.classList.remove("status-pending", "status-refund");
    } else {
      const footer = itemElement.querySelector(".ticket-footer");
      if (footer) {
        const badge = document.createElement("span");
        badge.className = "status-badge status-canceled";
        badge.dataset.ticketStatusLabel = "";
        badge.textContent = "Canceled";
        footer.prepend(badge);
      }
    }

    itemElement.dataset.ticketStatus = "canceled";

    const cancelButtons = itemElement.querySelectorAll("[data-ticket-cancel-trigger]");
    cancelButtons.forEach((button) => {
      button.disabled = true;
      button.classList.add("disabled");
      button.setAttribute("aria-disabled", "true");
    });
  }

  async function handleConfirmCancellation() {
    if (!activeContext || isConfirming) {
      return;
    }

    const popup = getPopup();
    if (!popup) {
      return;
    }

    const codeInput = getCodeInput(popup);
    const confirmButton = getConfirmButton(popup);
    const code = codeInput ? codeInput.value.trim() : "";

    if (!code) {
      setMessage("error", "Lütfen doğrulama kodunu girin.");
      if (codeInput) {
        codeInput.focus();
      }
      return;
    }

    isConfirming = true;
    setButtonLoading(confirmButton, true, "İşleniyor...");
    clearMessage();

    try {
      const response = await fetch("/api/ticket/cancel/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pnr: activeContext.pnr,
          firmKey: activeContext.firmKey,
          code,
        }),
      });

      let payload = null;
      try {
        payload = await response.clone().json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || "İşlem tamamlanamadı.";
        setMessage("error", errorMessage);
        return;
      }

      if (!payload?.success) {
        const errorMessage = payload?.message || "Invalid code";
        setMessage("error", errorMessage);
        return;
      }

      updateTicketStatus(activeContext.itemElement);
      closePopup();
    } catch (error) {
      setMessage("error", "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      setButtonLoading(confirmButton, false);
      isConfirming = false;
    }
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-ticket-cancel-trigger]");
    if (trigger) {
      event.preventDefault();
      if (trigger.disabled || trigger.classList.contains("disabled")) {
        return;
      }

      const dropdownMenu = trigger.closest(".dropdown-menu");
      if (dropdownMenu) {
        dropdownMenu.classList.remove("show");
        const dropdown = dropdownMenu.closest(".dropdown");
        const toggle = dropdown
          ? dropdown.querySelector("[data-bs-toggle='dropdown']")
          : null;
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
        }
      }

      const context = gatherContext(trigger);
      if (context && context.pnr && context.firmKey) {
        openPopup(context);
      } else {
        console.warn("Bilet iptali için gerekli bilgiler bulunamadı.");
      }
      return;
    }

    const closeTrigger = event.target.closest("[data-ticket-cancel-close]");
    if (closeTrigger) {
      event.preventDefault();
      closePopup();
      return;
    }

    const sendTrigger = event.target.closest("[data-ticket-send-code]");
    if (sendTrigger) {
      event.preventDefault();
      handleSendCode(false);
      return;
    }

    const resendTrigger = event.target.closest("[data-ticket-resend-code]");
    if (resendTrigger) {
      event.preventDefault();
      handleSendCode(true);
      return;
    }

    const confirmTrigger = event.target.closest("[data-ticket-confirm-cancel]");
    if (confirmTrigger) {
      event.preventDefault();
      handleConfirmCancellation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    const popup = getPopup();
    if (popup && popup.classList.contains(OPEN_CLASS)) {
      closePopup();
    }
  });
})();
