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
        dialog.className = `toast-dialog toast-dialog--${this.type}`;
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-live", "assertive");

        dialog.innerHTML = `
            <div class="toast-dialog__content">
                <div class="toast-dialog__icon">
                    ${this.getIcon()}
                </div>
                <div class="toast-dialog__message">
                    ${this.message}
                </div>
                <button type="button" class="toast-dialog__close btn btn--${this.type}">
                    OK
                </button>
            </div>
        `;

        const closeBtn = dialog.querySelector(".toast-dialog__close");
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

    getIcon() {
        const icons = {
            success: `<svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="currentColor"/>
            </svg>`,
            danger: `<svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z" fill="currentColor"/>
            </svg>`,
            warning: `<svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0H20L10 18L0 0ZM10.5 15H9.5V14H10.5V15ZM10.5 12H9.5V8H10.5V12Z" fill="currentColor"/>
            </svg>`,
            info: `<svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z" fill="currentColor"/>
            </svg>`,
        };
        return icons[this.type] || icons.info;
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

if (typeof window !== "undefined") {
    window.showToast = showToast;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.showWarning = showWarning;
    window.showInfo = showInfo;
    window.Toast = Toast;
    window.ToastType = ToastType;

    // Listen for HTMX triggered events
    document.addEventListener("showToast", function (evt) {
        const detail = evt.detail;
        if (detail && detail.message) {
            showToast(
                detail.message,
                detail.type || "info",
                0, // Always require click to dismiss
            );
        }
    });
}

export { showError, showInfo, showSuccess, showToast, showWarning, Toast, ToastType };
