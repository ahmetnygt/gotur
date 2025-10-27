(function () {
  function ready(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function hideAlert(element) {
    if (!element) return;
    element.classList.add("d-none");
    element.textContent = "";
  }

  function showAlert(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove("d-none");
  }

  function clearFieldErrors(form) {
    if (!form) return;
    form.querySelectorAll(".is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
      if (typeof el.removeAttribute === "function") {
        el.removeAttribute("aria-invalid");
      }
    });
    form
      .querySelectorAll(".place-select.is-invalid")
      .forEach((el) => el.classList.remove("is-invalid"));
    form.querySelectorAll(".invalid-feedback").forEach((el) => {
      el.textContent = "";
    });
  }

  function applyFieldErrors(form, errors) {
    if (!form || !errors) return;
    Object.entries(errors).forEach(([field, message]) => {
      const fieldElement = form.querySelector(`[name="${field}"]`);
      if (!fieldElement) return;
      fieldElement.classList.add("is-invalid");
      if (typeof fieldElement.setAttribute === "function") {
        fieldElement.setAttribute("aria-invalid", "true");
      }
      const selectWrapper = fieldElement.closest(".place-select");
      if (selectWrapper) {
        selectWrapper.classList.add("is-invalid");
      }
      const feedback = form.querySelector(`#${field}-feedback`);
      if (feedback) {
        feedback.textContent = message;
      }
    });
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }
      button.textContent = loadingText || button.dataset.originalText || "Kaydediliyor";
      button.disabled = true;
    } else {
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
      button.disabled = false;
    }
  }

  async function submitForm(form, { successAlert, errorAlert, loadingText, onSuccess }) {
    if (!form) return;
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideAlert(successAlert);
      hideAlert(errorAlert);
      clearFieldErrors(form);

      const formData = new FormData(form);
      const payload = {};
      formData.forEach((value, key) => {
        payload[key] = value;
      });

      try {
        setButtonLoading(submitButton, true, loadingText);
        const response = await fetch(form.action, {
          method: form.method || "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          const message = data.message || "İşlem tamamlanamadı. Lütfen formu kontrol edin.";
          showAlert(errorAlert, message);
          if (data.fieldErrors) {
            applyFieldErrors(form, data.fieldErrors);
          }
          return;
        }

        showAlert(successAlert, data.message || "İşlem başarıyla tamamlandı.");
        if (typeof onSuccess === "function") {
          onSuccess(data, form);
        }
      } catch (error) {
        console.error("Form gönderilirken hata oluştu:", error);
        showAlert(errorAlert, "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
      } finally {
        setButtonLoading(submitButton, false);
      }
    });
  }

  ready(function () {
    const personalInfoForm = document.getElementById("personal-information-form");
    const personalInfoSuccess = document.getElementById("personal-info-success");
    const personalInfoError = document.getElementById("personal-info-error");

    if (personalInfoForm) {
      personalInfoForm.querySelectorAll(".place-select_input").forEach((input) => {
        input.addEventListener("change", () => {
          input.classList.remove("is-invalid");
          input.removeAttribute("aria-invalid");
          const wrapper = input.closest(".place-select");
          if (wrapper) {
            wrapper.classList.remove("is-invalid");
          }
        });
      });
    }

    submitForm(personalInfoForm, {
      successAlert: personalInfoSuccess,
      errorAlert: personalInfoError,
      loadingText: "Kaydediliyor...",
      onSuccess: (data, form) => {
        clearFieldErrors(form);
        if (data.personalInfo) {
          Object.entries(data.personalInfo).forEach(([key, value]) => {
            const field = form.querySelector(`[name="${key}"]`);
            if (!field) return;
            if (field.tagName === "SELECT") {
              field.value = value || "";
            } else {
              field.value = value || "";
            }
          });
        }
      },
    });

    const passwordForm = document.getElementById("password-form");
    const passwordSuccess = document.getElementById("password-success");
    const passwordError = document.getElementById("password-error");

    submitForm(passwordForm, {
      successAlert: passwordSuccess,
      errorAlert: passwordError,
      loadingText: "Güncelleniyor...",
      onSuccess: (_, form) => {
        form.reset();
      },
    });
  });
})();

