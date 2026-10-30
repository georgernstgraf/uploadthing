/**
 * Toast Notification System - Modal Dialog Version
 * JS-powered toast notifications using <dialog> element
 */

const ToastType = {
    SUCCESS: "success",
    DANGER: "danger",
    WARNING: "warning",
    INFO: "info",
};

const toastContainer = Symbol("toastContainer");

class Toast {
    constructor(message, type = ToastType.INFO, duration = 0) {
        this.message = message;
        this.type = type;
        this.duration = duration;
        this.element = null;
    }

    createDialog() {
        const dialog = document.createElement("dialog");
        dialog.id = "toast-dialog";
        dialog.dataset.toastType = this.type;
        dialog.className = `toast-dialog toast-dialog--${this.type}`;
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-live", "assertive");

        // Aufbau ausschließlich über DOM-APIs (#152): die Meldung kommt
        // vom Server und enthält schülerkontrollierte Dateinamen — sie
        // darf nie als HTML interpretiert werden.
        const content = document.createElement("div");
        content.className = "toast-dialog__content";

        const icon = document.createElement("div");
        icon.className = "toast-dialog__icon";
        icon.appendChild(this.getIcon());

        const message = document.createElement("div");
        message.className = "toast-dialog__message";
        message.id = "toast-dialog-message";
        message.textContent = this.message;

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = `toast-dialog__close btn btn--${this.type}`;
        closeBtn.id = "toast-dialog-close";
        closeBtn.textContent = "OK";

        content.append(icon, message, closeBtn);
        dialog.appendChild(content);

        closeBtn.addEventListener("click", () => this.hide());

        // Close on backdrop click
        dialog.addEventListener("click", (e) => {
            const rect = dialog.getBoundingClientRect();
            const isInDialog =
                rect.top <= e.clientY &&
                e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX &&
                e.clientX <= rect.left + rect.width;
            if (!isInDialog) {
                this.hide();
            }
        });

        // Close on Escape key
        dialog.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.hide();
            }
        });

        return dialog;
    }

    /** Icon als SVG-Element — nie als HTML-String. */
    getIcon() {
        const paths = {
            success:
                "M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z",
            danger:
                "M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z",
            warning:
                "M0 0H20L10 18L0 0ZM10.5 15H9.5V14H10.5V15ZM10.5 12H9.5V8H10.5V12Z",
            info:
                "M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z",
        };
        const d = paths[this.type] || paths.info;

        const svgNs = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNs, "svg");
        svg.setAttribute("width", "32");
        svg.setAttribute("height", "32");
        svg.setAttribute("viewBox", "0 0 20 20");
        svg.setAttribute("fill", "none");

        const path = document.createElementNS(svgNs, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "currentColor");
        svg.appendChild(path);

        return svg;
    }

    show() {
        Toast.ensureStyles();
        this.element = this.createDialog();
        document.body.appendChild(this.element);
        this.element.showModal();

        // Auto-dismiss only if duration > 0 (but this dialog requires click)
        // Duration parameter is kept for API compatibility but ignored

        return this;
    }

    hide() {
        if (this.element) {
            this.element.close();
            this.element.remove();
            this.element = null;
        }
    }

    static ensureStyles() {
        if (document.getElementById("toast-dialog-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "toast-dialog-styles";
        style.textContent = `
            .toast-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                margin: 0;
                padding: 0;
                border: none;
                border-radius: var(--radius-xl, 1rem);
                background: transparent;
                box-shadow: none;
            }

            .toast-dialog::backdrop {
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
            }

            .toast-dialog__content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1.5rem;
                padding: 2rem;
                background: var(--color-bg-body, #fff);
                border-radius: var(--radius-xl, 1rem);
                box-shadow: var(--shadow-lg, 0 1rem 3rem rgba(0, 0, 0, 0.175));
                min-width: 300px;
                max-width: 90vw;
                text-align: center;
            }

            .toast-dialog__icon {
                flex-shrink: 0;
                width: 32px;
                height: 32px;
            }

            .toast-dialog--success .toast-dialog__icon { color: var(--color-success, #198754); }
            .toast-dialog--danger .toast-dialog__icon { color: var(--color-danger, #dc3545); }
            .toast-dialog--warning .toast-dialog__icon { color: var(--color-warning, #ffc107); }
            .toast-dialog--info .toast-dialog__icon { color: var(--color-info, #0dcaf0); }

            .toast-dialog__message {
                font-size: var(--font-size-lg, 1.125rem);
                line-height: 1.5;
                color: var(--color-body, #212529);
                font-weight: 500;
            }

            .toast-dialog__close {
                min-width: 100px;
                padding: 0.75rem 1.5rem;
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Show a toast notification as a modal dialog
 * @param {string} message - The message to display
 * @param {string} [type='info'] - Type: 'success', 'danger', 'warning', 'info'
 * @param {number} [duration=0] - Duration parameter kept for API compatibility (always requires click to dismiss)
 */
function showToast(message, type = ToastType.INFO, duration = 0) {
    return new Toast(message, type, duration).show();
}

/**
 * Show a success toast
 */
function showSuccess(message, duration = 0) {
    return showToast(message, ToastType.SUCCESS, duration);
}

/**
 * Show an error/danger toast
 */
function showError(message, duration = 0) {
    return showToast(message, ToastType.DANGER, duration);
}

/**
 * Show a warning toast
 */
function showWarning(message, duration = 0) {
    return showToast(message, ToastType.WARNING, duration);
}

/**
 * Show an info toast
 */
function showInfo(message, duration = 0) {
    return showToast(message, ToastType.INFO, duration);
}

// Make functions globally available
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;
window.Toast = Toast;
window.ToastType = ToastType;
