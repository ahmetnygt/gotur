(function (global) {
    const instances = new Set();
    const elementToInstance = new WeakMap();
    let cachedPlaces = null;
    let placesPromise = null;

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

    const enhancePlaces = rawPlaces => {
        const placeMap = new Map(
            rawPlaces.map(place => [String(place.id), place])
        );

        const enhanced = rawPlaces.map(place => {
            const province =
                place.provinceId && String(place.provinceId) !== String(place.id)
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
                    searchText: toLocaleLower(
                        `${place.title} ${provinceTitle}`.trim()
                    ),
                })
            );
        });

        enhanced.sort((a, b) =>
            a.displayTitle.localeCompare(b.displayTitle, "tr")
        );

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

            const searchPlaceholder = this.root.dataset.searchPlaceholder;
            if (searchPlaceholder && this.searchInput) {
                this.searchInput.placeholder = searchPlaceholder;
            }

            this.bindEvents();
            this.updateDisplay();
            this.filteredPlaces = this.places;
            this.syncHighlightWithValue();
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
                this.filteredPlaces = this.places.filter(place =>
                    place.searchText.includes(normalized)
                );
            }
            this.syncHighlightWithValue();
            this.renderOptions();
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

        renderOptions() {
            if (!this.optionsContainer) {
                return;
            }
            this.optionsContainer.innerHTML = "";
            if (!this.filteredPlaces.length) {
                const empty = document.createElement("div");
                empty.className = "place-select_empty";
                empty.textContent = "Sonuç bulunamadı";
                this.optionsContainer.appendChild(empty);
                return;
            }

            const currentValue = this.input
                ? String(this.input.value || "")
                : "";

            this.filteredPlaces.forEach((place, index) => {
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
                this.optionsContainer.appendChild(option);
            });

            this.updateHighlightedOption();
        }

        updateHighlightedOption() {
            if (!this.optionsContainer) {
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

        let places;
        try {
            places = await loadPlaces();
        } catch (error) {
            return [];
        }

        const created = elements.map(element => {
            const instance = new PlaceSelect(element, places);
            elementToInstance.set(element, instance);
            instances.add(instance);
            return instance;
        });

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
            instances.forEach(instance => instance.setPlaces(places));
            return places;
        },
        loadPlaces: async () => {
            const places = await loadPlaces();
            return places.map(place => Object.assign({}, place));
        },
    };
})(window);
