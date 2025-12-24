if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const phoneInput = document.getElementById("contact-phone");
        const phoneGroups = [3, 3, 2, 2];
        const idGroups = [11];

        const extractDigits = (value = "") => value.replace(/\D/g, "");

        const formatWithGroups = (digits, groups) => {
            let index = 0;
            const parts = [];

            groups.forEach((groupSize) => {
                if (index >= digits.length) {
                    return;
                }

                const part = digits.slice(index, index + groupSize);
                if (part) {
                    parts.push(part);
                }
                index += groupSize;
            });

            return parts.join(" ");
        };

        const validatePhoneNumber = (digits) => {
            if (!digits) {
                return { valid: true, message: "" };
            }

            if (digits.length !== 10) {
                return { valid: false, message: "Phone number must be 10 digits." };
            }

            if (digits[0] !== "5") {
                return { valid: false, message: "Phone number must start with 5." };
            }

            return { valid: true, message: "" };
        };

        const isValidTurkishId = (digits) => {
            if (digits.length !== 11 || digits[0] === "0") {
                return false;
            }

            const nums = digits.split("").map(Number);
            const oddSum = nums[0] + nums[2] + nums[4] + nums[6] + nums[8];
            const evenSum = nums[1] + nums[3] + nums[5] + nums[7];
            const tenthDigitCheck = ((oddSum * 7 - evenSum) % 10 + 10) % 10;

            if (nums[9] !== tenthDigitCheck) {
                return false;
            }

            const firstTenSum = nums.slice(0, 10).reduce((acc, value) => acc + value, 0);
            const eleventhDigitCheck = firstTenSum % 10;

            return nums[10] === eleventhDigitCheck;
        };

        const validateIdNumber = (digits) => {
            if (!digits) {
                return { valid: true, message: "" };
            }

            if (!isValidTurkishId(digits)) {
                return { valid: false, message: "Please enter a valid Turkish ID number." };
            }

            return { valid: true, message: "" };
        };

        const applyFormatting = (input, groups, validator) => {
            if (!input) {
                return;
            }

            const rawDigits = extractDigits(input.value);
            input.value = formatWithGroups(rawDigits, groups);

            const validation = validator(rawDigits);
            input.setCustomValidity(validation.valid ? "" : validation.message);
        };

        const attachHandlers = (input, groups, validator) => {
            if (!input) {
                return;
            }

            const handleInput = () => applyFormatting(input, groups, validator);

            input.addEventListener("input", handleInput);
            input.addEventListener("blur", () => {
                handleInput();
                if (!input.checkValidity()) {
                    input.reportValidity();
                }
            });

            handleInput();
        };

        attachHandlers(phoneInput, phoneGroups, validatePhoneNumber);

        document.querySelectorAll('input[name="idNumbers"]').forEach((input) => {
            attachHandlers(input, idGroups, validateIdNumber);
        });
    });
}