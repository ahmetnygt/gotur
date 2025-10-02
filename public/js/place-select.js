(function (global) {
    const instances = new Set();
    const elementToInstance = new WeakMap();
    let cachedPlaces = null;
    let placesPromise = null;
    const staticOptionsCache = new Map();

    let trCollator = null;
    try {
        trCollator = new Intl.Collator("tr", { sensitivity: "base" });
    } catch (error) {
        trCollator = null;
    }

    const compareTurkish = (a, b) => {
        if (trCollator) {
            return trCollator.compare(a, b);
        }
        return String(a).localeCompare(String(b), "tr");
    };

    const toLocaleLower = value => {
        if (typeof value !== "string") {
            return "";
        }

        try {
            return value.toLocaleLowerCase("tr-TR");
        } catch (error) {
            return value.toLowerCase();
        }
    };

    const getNormalizedTitle = place => {
        if (!place) {
            return "";
        }

        if (typeof place.normalizedTitle === "string") {
            return place.normalizedTitle;
        }

        if (typeof place.title === "string") {
            return toLocaleLower(place.title);
        }

        if (typeof place.displayTitle === "string") {
            return toLocaleLower(place.displayTitle);
        }

        return "";
    };

    const sortPlacesForTerm = (places, normalizedTerm) => {
        if (!Array.isArray(places)) {
            return [];
        }

        const normalized = typeof normalizedTerm === "string" ? normalizedTerm : "";
        if (!normalized) {
            return places.slice();
        }

        return places.slice().sort((a, b) => {
            const aNormalizedTitle = getNormalizedTitle(a);
            const bNormalizedTitle = getNormalizedTitle(b);

            const aExact = aNormalizedTitle === normalized;
            const bExact = bNormalizedTitle === normalized;
            if (aExact !== bExact) {
                return aExact ? -1 : 1;
            }

            const aStarts = Boolean(a && a.searchText && a.searchText.startsWith(normalized));
            const bStarts = Boolean(b && b.searchText && b.searchText.startsWith(normalized));
            if (aStarts !== bStarts) {
                return aStarts ? -1 : 1;
            }

            const aProvince = Boolean(a && a.isProvince);
            const bProvince = Boolean(b && b.isProvince);
            if (aProvince !== bProvince) {
                return aProvince ? -1 : 1;
            }

            const aDisplay = a && a.displayTitle ? a.displayTitle : aNormalizedTitle;
            const bDisplay = b && b.displayTitle ? b.displayTitle : bNormalizedTitle;
            return compareTurkish(aDisplay, bDisplay);
        });
    };

    const parseStaticJson = text => {
        if (typeof text !== "string") {
            return [];
        }

        const trimmed = text.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error("Statik seçenekler çözümlenemedi:", error);
            return [];
        }
    };

    const normalizeStaticOptions = options => {
        if (!Array.isArray(options)) {
            return [];
        }

        const normalized = options
            .map(option => {
                if (!option || typeof option !== "object") {
                    return null;
                }

                const rawValue =
                    option.value !== undefined
                        ? option.value
                        : option.id !== undefined
                        ? option.id
                        : option.code !== undefined
                        ? option.code
                        : null;

                const value = rawValue != null ? String(rawValue).trim() : "";
                const baseLabel =
                    option.displayLabel ||
                    option.label ||
                    option.name ||
                    option.title ||
                    "";
                const label = baseLabel ? String(baseLabel).trim() : "";

                if (!value || !label) {
                    return null;
                }

                const displayTitle = option.displayLabel
                    ? String(option.displayLabel)
                    : label;

                const searchSource =
                    typeof option.searchText === "string" && option.searchText
                        ? option.searchText
                        : `${label} ${value}`;

                return Object.freeze({
                    id: String(value),
                    displayTitle,
                    searchText: toLocaleLower(searchSource),
                });
            })
            .filter(Boolean);

        return Object.freeze(normalized);
    };

    const getStaticOptionsForElement = element => {
        if (!element || !element.dataset) {
            return [];
        }

        const { optionsId, options } = element.dataset;

        if (optionsId) {
            if (staticOptionsCache.has(optionsId)) {
                return staticOptionsCache.get(optionsId);
            }

            const sourceElement = document.getElementById(optionsId);
            if (!sourceElement) {
                const empty = Object.freeze([]);
                staticOptionsCache.set(optionsId, empty);
                return empty;
            }

            const rawText =
                sourceElement.textContent || sourceElement.innerText || "";
            const normalized = normalizeStaticOptions(parseStaticJson(rawText));
            staticOptionsCache.set(optionsId, normalized);
            return normalized;
        }

        if (options) {
            return normalizeStaticOptions(parseStaticJson(options));
        }

        return [];
    };

    const elementUsesStaticOptions = element =>
        Boolean(
            element &&
                element.dataset &&
                (element.dataset.optionsId || element.dataset.options)
        );

    const enhancePlaces = rawPlaces => {
        const placeMap = new Map(
            rawPlaces.map(place => [String(place.id), place])
        );

        const enhanced = rawPlaces.map(place => {
            const isProvince =
                place.provinceId && String(place.provinceId) === String(place.id);
            const province =
                !isProvince && place.provinceId
                    ? placeMap.get(String(place.provinceId))
                    : null;
            const provinceTitle =
                province && province.title ? province.title : "";
            const displayTitle = provinceTitle
                ? `${place.title} (${provinceTitle})`
                : place.title;

            return Object.freeze(
                Object.assign({}, place, {
                    provinceTitle,
                    displayTitle,
                    isProvince,
                    normalizedTitle: toLocaleLower(place.title),
                    searchText: toLocaleLower(
                        `${place.title} ${provinceTitle}`.trim()
                    ),
                })
            );
        });

        enhanced.sort((a, b) => compareTurkish(a.displayTitle, b.displayTitle));

        return Object.freeze(enhanced);
    };

    const fetchPlaces = async () => {
        const response = await fetch("/api/places");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawPlaces = await response.json();
        if (!Array.isArray(rawPlaces)) {
            throw new Error("Geçersiz yanıt biçimi");
        }

        return enhancePlaces(rawPlaces);
    };

    const loadPlaces = async () => {
        if (cachedPlaces) {
            return cachedPlaces;
        }

        if (!placesPromise) {
            placesPromise = fetchPlaces()
                .then(places => {
                    cachedPlaces = places;
                    return places;
                })
                .catch(error => {
                    console.error("Yerler yüklenirken hata oluştu:", error);
                    throw error;
                })
                .finally(() => {
                    placesPromise = null;
                });
        }

        return placesPromise;
    };

    class PlaceSelect {
        constructor(element, places) {
            this.root = element;
            this.places = places;
            this.filteredPlaces = places;
            this.highlightIndex = -1;
            this.isOpen = false;

            this.input = this.root.querySelector("input[type='hidden']");
            this.display = this.root.querySelector(".place-select_display");
            this.label = this.root.querySelector(".place-select_label");
            this.dropdown = this.root.querySelector(".place-select_dropdown");
            this.searchInput = this.root.querySelector(".place-select_search");
            this.optionsContainer = this.root.querySelector(
                ".place-select_options"
            );
            this.placeholder = this.root.dataset.placeholder || "";
            const parsedBatch = Number.parseInt(
                this.root.dataset.visibleBatchSize,
                10
            );
            this.visibleBatchSize = Number.isFinite(parsedBatch)
                ? Math.max(parsedBatch, 1)
                : 5;
            this.renderLimit = this.visibleBatchSize;
            this.renderedCount = 0;
            this.handleOptionsScroll = () => this.onOptionsScroll();

            if (this.optionsContainer) {
                this.optionsContainer.addEventListener(
                    "scroll",
                    this.handleOptionsScroll
                );
            }

            const searchPlaceholder = this.root.dataset.searchPlaceholder;
            if (searchPlaceholder && this.searchInput) {
                this.searchInput.placeholder = searchPlaceholder;
            }

            this.bindEvents();
            this.updateDisplay();
            this.filteredPlaces = this.places;
            this.syncHighlightWithValue();
            this.resetRenderState();
            this.renderOptions();
            this.root.dataset.placeSelectReady = "true";
        }

        bindEvents() {
            if (this.display) {
                this.handleDisplayClick = event => {
                    event.preventDefault();
                    this.toggleDropdown();
                };
                this.handleDisplayKeydown = event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        this.toggleDropdown(true);
                    }
                };
                this.display.addEventListener("click", this.handleDisplayClick);
                this.display.addEventListener(
                    "keydown",
                    this.handleDisplayKeydown
                );
            }

            if (this.searchInput) {
                this.handleSearchInput = () => {
                    this.applyFilter(this.searchInput.value);
                };
                this.handleSearchKeydownBound = event =>
                    this.handleSearchKeydown(event);
                this.searchInput.addEventListener(
                    "input",
                    this.handleSearchInput
                );
                this.searchInput.addEventListener(
                    "keydown",
                    this.handleSearchKeydownBound
                );
            }
        }

        setPlaces(places) {
            this.places = places;
            let currentTerm = "";
            if (this.searchInput && typeof this.searchInput.value === "string") {
                currentTerm = this.searchInput.value;
            }
            this.applyFilter(currentTerm);
        }

        toggleDropdown(forceOpen = false) {
            if (forceOpen && this.isOpen) {
                return;
            }

            if (forceOpen || !this.isOpen) {
                this.openDropdown();
            } else {
                this.closeDropdown();
            }
        }

        openDropdown() {
            instances.forEach(instance => {
                if (instance !== this) {
                    instance.closeDropdown();
                }
            });

            this.root.classList.add("place-select_open");
            this.isOpen = true;
            if (this.display) {
                this.display.setAttribute("aria-expanded", "true");
            }
            if (this.searchInput) {
                this.searchInput.value = "";
            }
            this.filteredPlaces = this.places;
            this.syncHighlightWithValue();
            this.resetRenderState();
            this.renderOptions();

            if (this.searchInput) {
                window.requestAnimationFrame(() => {
                    this.searchInput.focus();
                });
            }
        }

        closeDropdown() {
            if (!this.isOpen) {
                return;
            }
            this.root.classList.remove("place-select_open");
            this.isOpen = false;
            if (this.display) {
                this.display.setAttribute("aria-expanded", "false");
            }
        }

        handleDocumentClick(event) {
            if (!this.root.contains(event.target)) {
                this.closeDropdown();
            }
        }

        applyFilter(term = "") {
            const normalized = toLocaleLower(term).trim();
            if (!normalized) {
                this.filteredPlaces = this.places;
            } else {
                const filtered = this.places.filter(place =>
                    place.searchText.includes(normalized)
                );
                this.filteredPlaces = sortPlacesForTerm(filtered, normalized);
            }
            this.syncHighlightWithValue();
            this.resetRenderState();
            this.renderOptions();
        }

        resetRenderState() {
            const available = Array.isArray(this.filteredPlaces)
                ? this.filteredPlaces.length
                : 0;
            const base = Math.max(this.visibleBatchSize, 1);
            const highlightTarget =
                this.highlightIndex >= 0 ? this.highlightIndex + 1 : 0;
            const desired = Math.max(base, highlightTarget);
            this.renderLimit = available ? Math.min(available, desired) : 0;
            this.renderedCount = 0;
        }

        loadMoreOptions() {
            if (
                !Array.isArray(this.filteredPlaces) ||
                this.renderLimit >= this.filteredPlaces.length
            ) {
                return;
            }

            const increment = Math.max(this.visibleBatchSize, 1);
            this.renderLimit = Math.min(
                this.filteredPlaces.length,
                this.renderLimit + increment
            );
            this.renderOptions({ append: true });
        }

        onOptionsScroll() {
            if (!this.optionsContainer) {
                return;
            }

            const { scrollTop, clientHeight, scrollHeight } =
                this.optionsContainer;
            if (scrollTop + clientHeight >= scrollHeight - 8) {
                this.loadMoreOptions();
            }
        }

        syncHighlightWithValue() {
            const currentValue = this.input
                ? String(this.input.value || "")
                : "";
            const selectedIndex = this.filteredPlaces.findIndex(
                place => String(place.id) === currentValue
            );
            if (selectedIndex !== -1) {
                this.highlightIndex = selectedIndex;
            } else {
                this.highlightIndex = this.filteredPlaces.length ? 0 : -1;
            }
        }

        renderOptions({ append = false } = {}) {
            if (!this.optionsContainer) {
                return;
            }

            if (!append) {
                this.optionsContainer.innerHTML = "";
                this.renderedCount = 0;
            }

            if (!this.filteredPlaces.length) {
                if (!append) {
                    const empty = document.createElement("div");
                    empty.className = "place-select_empty";
                    empty.textContent = "Sonuç bulunamadı";
                    this.optionsContainer.appendChild(empty);
                }
                return;
            }

            const currentValue = this.input
                ? String(this.input.value || "")
                : "";
            const startIndex = append ? this.renderedCount : 0;
            const endIndex = Math.min(
                this.renderLimit,
                this.filteredPlaces.length
            );

            if (startIndex >= endIndex) {
                return;
            }

            const fragment = document.createDocumentFragment();

            for (let index = startIndex; index < endIndex; index += 1) {
                const place = this.filteredPlaces[index];
                const option = document.createElement("div");
                option.className = "place-select_option";
                option.setAttribute("role", "option");
                option.dataset.id = String(place.id);
                option.textContent = place.displayTitle;
                option.title = place.displayTitle;
                if (String(place.id) === currentValue) {
                    option.classList.add("selected");
                    option.setAttribute("aria-selected", "true");
                }
                if (index === this.highlightIndex) {
                    option.classList.add("highlighted");
                }
                option.addEventListener("mousedown", event => {
                    event.preventDefault();
                    this.setSelected(place);
                });
                option.addEventListener("mouseenter", () => {
                    this.highlightIndex = index;
                    this.updateHighlightedOption();
                });
                fragment.appendChild(option);
            }

            this.optionsContainer.appendChild(fragment);
            this.renderedCount = endIndex;

            if (!append) {
                this.optionsContainer.scrollTop = 0;
            }

            this.updateHighlightedOption();
        }

        updateHighlightedOption() {
            if (!this.optionsContainer) {
                return;
            }
            if (
                this.highlightIndex >= this.renderLimit &&
                this.highlightIndex < this.filteredPlaces.length
            ) {
                this.loadMoreOptions();
                return;
            }
            const options = this.optionsContainer.querySelectorAll(
                ".place-select_option"
            );
            options.forEach((option, index) => {
                option.classList.toggle(
                    "highlighted",
                    index === this.highlightIndex
                );
            });

            if (this.highlightIndex >= 0 && options[this.highlightIndex]) {
                options[this.highlightIndex].scrollIntoView({
                    block: "nearest",
                });
            }
        }

        handleSearchKeydown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                this.closeDropdown();
                if (this.display && typeof this.display.focus === "function") {
                    this.display.focus();
                }
                return;
            }

            if (event.key === "ArrowDown") {
                event.preventDefault();
                if (!this.filteredPlaces.length) {
                    return;
                }
                this.highlightIndex = Math.min(
                    this.filteredPlaces.length - 1,
                    this.highlightIndex + 1
                );
                this.updateHighlightedOption();
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                if (!this.filteredPlaces.length) {
                    return;
                }
                this.highlightIndex = Math.max(0, this.highlightIndex - 1);
                this.updateHighlightedOption();
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                if (this.highlightIndex >= 0) {
                    const place = this.filteredPlaces[this.highlightIndex];
                    if (place) {
                        this.setSelected(place);
                    }
                }
            }
        }

        setSelected(place) {
            if (!this.input) {
                return;
            }
            const previousValue = String(this.input.value || "");
            const nextValue = String(place.id);
            this.input.value = nextValue;
            this.updateDisplay(place);
            if (previousValue !== nextValue) {
                const changeEvent = new Event("change", { bubbles: true });
                this.input.dispatchEvent(changeEvent);
            }
            this.closeDropdown();
        }

        selectById(value) {
            const target = this.places.find(
                place => String(place.id) === String(value)
            );
            if (target) {
                this.setSelected(target);
            } else {
                this.clear();
            }
        }

        clear() {
            if (!this.input) {
                return;
            }
            const hadValue = Boolean(this.input.value);
            this.input.value = "";
            this.updateDisplay();
            if (hadValue) {
                const changeEvent = new Event("change", { bubbles: true });
                this.input.dispatchEvent(changeEvent);
            }
        }

        updateDisplay(providedPlace) {
            if (!this.label) {
                return;
            }

            let targetPlace = providedPlace || null;

            if (!targetPlace) {
                let inputValue = "";
                if (this.input) {
                    inputValue = String(this.input.value || "");
                }
                if (inputValue) {
                    const found = this.places.find(
                        place => String(place.id) === inputValue
                    );
                    targetPlace = found || null;
                }
            }

            if (targetPlace) {
                this.label.textContent = targetPlace.displayTitle;
                this.root.classList.add("has-value");
            } else {
                this.label.textContent = this.placeholder;
                this.root.classList.remove("has-value");
            }
        }

        destroy() {
            this.closeDropdown();
            if (this.display) {
                this.display.removeEventListener(
                    "click",
                    this.handleDisplayClick
                );
                this.display.removeEventListener(
                    "keydown",
                    this.handleDisplayKeydown
                );
            }
            if (this.searchInput) {
                this.searchInput.removeEventListener(
                    "input",
                    this.handleSearchInput
                );
                this.searchInput.removeEventListener(
                    "keydown",
                    this.handleSearchKeydownBound
                );
            }
            if (this.optionsContainer) {
                this.optionsContainer.removeEventListener(
                    "scroll",
                    this.handleOptionsScroll
                );
                this.optionsContainer.innerHTML = "";
            }
            this.root.classList.remove("place-select_open", "has-value");
            delete this.root.dataset.placeSelectReady;
        }
    }

    const findElements = root => {
        if (!root) {
            root = document;
        }

        if (root instanceof Element) {
            const elements = Array.from(
                root.querySelectorAll(".place-select")
            );
            if (root.classList.contains("place-select")) {
                elements.unshift(root);
            }
            return elements;
        }

        if (root instanceof Document || root instanceof DocumentFragment) {
            return Array.from(root.querySelectorAll(".place-select"));
        }

        if (typeof root.length === "number") {
            const results = [];
            Array.from(root).forEach(item => {
                const nested = findElements(item);
                Array.prototype.push.apply(results, nested);
            });
            return results;
        }

        return [];
    };

    const init = async root => {
        const elements = findElements(root).filter(
            element => !elementToInstance.has(element)
        );

        if (!elements.length) {
            return [];
        }

        const staticElements = elements.filter(elementUsesStaticOptions);
        const dynamicElements = elements.filter(
            element => !elementUsesStaticOptions(element)
        );

        const created = [];

        staticElements.forEach(element => {
            try {
                const staticOptions = getStaticOptionsForElement(element);
                const instance = new PlaceSelect(element, staticOptions);
                instance.isStatic = true;
                elementToInstance.set(element, instance);
                instances.add(instance);
                created.push(instance);
            } catch (error) {
                console.error("Statik yer seçici başlatılamadı:", error);
            }
        });

        if (dynamicElements.length) {
            let places = [];
            try {
                places = await loadPlaces();
            } catch (error) {
                console.error("Yerler yüklenirken hata oluştu:", error);
            }

            dynamicElements.forEach(element => {
                try {
                    const instance = new PlaceSelect(element, places);
                    instance.isStatic = false;
                    elementToInstance.set(element, instance);
                    instances.add(instance);
                    created.push(instance);
                } catch (error) {
                    console.error("Yer seçici başlatılamadı:", error);
                }
            });
        }

        return created;
    };

    const destroy = target => {
        let instance = null;
        if (!target) {
            return false;
        }
        if (target instanceof PlaceSelect) {
            instance = target;
        } else if (target instanceof Element) {
            instance = elementToInstance.get(target) || null;
        }

        if (!instance) {
            return false;
        }

        instance.destroy();
        elementToInstance.delete(instance.root);
        instances.delete(instance);
        return true;
    };

    const ready = () => {
        init().catch(error => {
            console.error("Yer seçici başlatılamadı:", error);
        });
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ready);
    } else {
        ready();
    }

    document.addEventListener("click", event => {
        instances.forEach(instance => instance.handleDocumentClick(event));
    });

    global.GTR = global.GTR || {};
    global.GTR.placeSelect = {
        init,
        destroy,
        getInstance: target => {
            if (!target) {
                return null;
            }
            if (target instanceof PlaceSelect) {
                return target;
            }
            if (target instanceof Element) {
                return elementToInstance.get(target) || null;
            }
            return null;
        },
        getInstances: () => Array.from(instances),
        refreshPlaces: async () => {
            cachedPlaces = null;
            const places = await loadPlaces();
            instances.forEach(instance => {
                if (!instance || instance.isStatic) {
                    return;
                }
                instance.setPlaces(places);
            });
            return places;
        },
        loadPlaces: async () => {
            const places = await loadPlaces();
            return places.map(place => Object.assign({}, place));
        },
    };
})(window);
