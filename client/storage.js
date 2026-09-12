(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelStorage = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createJsonStorage(storage) {
        return {
            read(key, fallback) {
                try {
                    const raw = storage.getItem(key);
                    return raw === null ? fallback : JSON.parse(raw);
                } catch {
                    return fallback;
                }
            },
            write(key, value) {
                storage.setItem(key, JSON.stringify(value));
            }
        };
    }

    return { createJsonStorage };
});