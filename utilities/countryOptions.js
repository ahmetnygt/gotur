const countries = require("world-countries");

function toLocaleLower(value) {
    if (typeof value !== "string") {
        return "";
    }

    try {
        return value.toLocaleLowerCase("tr-TR");
    } catch (error) {
        return value.toLowerCase();
    }
}

const COUNTRY_OPTIONS = countries
    .map((country) => {
        const alpha2 = (country.cca2 || "").toUpperCase();

        if (!alpha2 || alpha2.length !== 2) {
            return null;
        }

        const turkishName = country?.translations?.tur?.common;
        const englishName = country?.name?.common;
        const officialName = country?.name?.official;

        const label = turkishName || englishName || officialName || alpha2;
        const displayLabel = `${label} (${alpha2})`;

        const searchParts = [label, englishName, officialName, alpha2]
            .filter(Boolean)
            .map((part) => toLocaleLower(part));

        return {
            value: alpha2,
            label,
            displayLabel,
            searchText: searchParts.join(" "),
        };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));

const COUNTRY_MAP = new Map(COUNTRY_OPTIONS.map((option) => [option.value, option]));
const COUNTRY_CODE_SET = new Set(COUNTRY_OPTIONS.map((option) => option.value));

function getCountryDisplayLabel(value) {
    if (!value) {
        return "";
    }

    const normalized = String(value).toUpperCase();
    const option = COUNTRY_MAP.get(normalized);

    return option ? option.displayLabel : "";
}

module.exports = {
    COUNTRY_OPTIONS,
    COUNTRY_MAP,
    COUNTRY_CODE_SET,
    getCountryDisplayLabel,
};
