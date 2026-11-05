/* Shared popup feedback: one message at a time, without moving page content. */
(() => {
    let element, timer, animation;
    function clear() {
        clearTimeout(timer);
        animation?.cancel();
        if (element) {
            element.hidden = true;
            element.textContent = "";
        }
    }
    function show(message, { error = false, duration = 2500 } = {}) {
        clear();
        if (!message) return;
        if (!element) {
            element = document.createElement("div");
            element.className = "popup-toast";
            element.setAttribute("role", "status");
            element.setAttribute("aria-live", "polite");
            element.setAttribute("aria-atomic", "true");
            (document.querySelector(".app-shell") || document.body).append(element);
        }
        element.classList.toggle("is-error", error);
        element.textContent = message;
        element.hidden = false;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: reduced ? 0 : 140,
        });
        timer = setTimeout(() => {
            animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: reduced ? 0 : 160, fill: "forwards",
            });
            animation.onfinish = clear;
        }, duration);
    }
    window.PopupToast = { show, clear };
})();
