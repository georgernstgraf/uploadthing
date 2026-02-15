/**
 * Toast Notification System
 * JS-powered toast notifications without Bootstrap
 */

const ToastType = {
    SUCCESS: 'success',
    DANGER: 'danger',
    WARNING: 'warning',
    INFO: 'info'
};

const toastContainer = Symbol('toastContainer');

class Toast {
    constructor(message, type = ToastType.INFO, duration = 5000) {
        this.message = message;
        this.type = type;
        this.duration = duration;
        this.element = null;
    }

    createElement() {
        const toast = document.createElement('div');
        toast.className = `toast toast--${this.type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');

        toast.innerHTML = `
            <div class="toast__icon">
                ${this.getIcon()}
            </div>
            <div class="toast__content">
                ${this.message}
            </div>
            <button type="button" class="toast__close" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        const closeBtn = toast.querySelector('.toast__close');
        closeBtn.addEventListener('click', () => this.hide());

        return toast;
    }

    getIcon() {
        const icons = {
            success: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="currentColor"/>
            </svg>`,
            danger: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z" fill="currentColor"/>
            </svg>`,
            warning: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0H20L10 18L0 0ZM10.5 15H9.5V14H10.5V15ZM10.5 12H9.5V8H10.5V12Z" fill="currentColor"/>
            </svg>`,
            info: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z" fill="currentColor"/>
            </svg>`
        };
        return icons[this.type] || icons.info;
    }

    show() {
        this.ensureContainer();
        this.element = this.createElement();
        Toast[toastContainer].appendChild(this.element);

        requestAnimationFrame(() => {
            this.element.classList.add('toast--visible');
        });

        if (this.duration > 0) {
            this.timeout = setTimeout(() => this.hide(), this.duration);
        }

        return this;
    }

    hide() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        if (this.element) {
            this.element.classList.remove('toast--visible');
            this.element.classList.add('toast--hiding');

            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.element = null;
            }, 300);
        }
    }

    static ensureContainer() {
        if (!Toast[toastContainer]) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
            Toast[toastContainer] = container;

            const style = document.createElement('style');
            style.textContent = `
                .toast-container {
                    position: fixed;
                    top: 1rem;
                    right: 1rem;
                    z-index: var(--z-toast, 1080);
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    max-width: 400px;
                }

                .toast {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    padding: 1rem;
                    background: var(--color-white, #fff);
                    border-radius: var(--radius-lg, 0.5rem);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease-in-out;
                }

                .toast--visible {
                    opacity: 1;
                    transform: translateX(0);
                }

                .toast--hiding {
                    opacity: 0;
                    transform: translateX(100%);
                }

                .toast__icon {
                    flex-shrink: 0;
                    width: 20px;
                    height: 20px;
                }

                .toast--success .toast__icon { color: var(--color-success, #198754); }
                .toast--danger .toast__icon { color: var(--color-danger, #dc3545); }
                .toast--warning .toast__icon { color: var(--color-warning, #ffc107); }
                .toast--info .toast__icon { color: var(--color-info, #0dcaf0); }

                .toast__content {
                    flex: 1;
                    font-size: var(--font-size-sm, 0.875rem);
                    line-height: 1.4;
                    color: var(--color-body, #212529);
                }

                .toast__close {
                    flex-shrink: 0;
                    padding: 0;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--color-muted, #6c757d);
                    transition: color 0.15s ease;
                    margin: -0.25rem -0.25rem 0 0;
                }

                .toast__close:hover {
                    color: var(--color-dark, #212529);
                }

                @media (max-width: 480px) {
                    .toast-container {
                        left: 0.5rem;
                        right: 0.5rem;
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} [type='info'] - Type: 'success', 'danger', 'warning', 'info'
 * @param {number} [duration=5000] - Duration in milliseconds (0 to disable auto-hide)
 */
function showToast(message, type = ToastType.INFO, duration = 5000) {
    return new Toast(message, type, duration).show();
}

/**
 * Show a success toast
 */
function showSuccess(message, duration = 5000) {
    return showToast(message, ToastType.SUCCESS, duration);
}

/**
 * Show an error/danger toast
 */
function showError(message, duration = 5000) {
    return showToast(message, ToastType.DANGER, duration);
}

/**
 * Show a warning toast
 */
function showWarning(message, duration = 5000) {
    return showToast(message, ToastType.WARNING, duration);
}

/**
 * Show an info toast
 */
function showInfo(message, duration = 5000) {
    return showToast(message, ToastType.INFO, duration);
}

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.showWarning = showWarning;
    window.showInfo = showInfo;
    window.Toast = Toast;
    window.ToastType = ToastType;

    // Listen for HTMX triggered events
    document.addEventListener('showToast', function(evt) {
        const detail = evt.detail;
        if (detail && detail.message) {
            showToast(detail.message, detail.type || 'info', detail.duration || 5000);
        }
    });
}

export { showToast, showSuccess, showError, showWarning, showInfo, Toast, ToastType };
