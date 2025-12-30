export function sleep(s: number) {
    return new Promise((resolve) => setTimeout(resolve, s * 1000));
}
export function localTimeString(date?: Date): string {
    const mydate = date ? date : new Date();
    return mydate.toLocaleTimeString("de-AT", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // Use 24-hour format
    });
}
const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function localDateTimeString(date: Date): string {
    return dateTimeFormatter.format(date).replace(",", "");
}
export function localDateString(date: Date): string {
    return dateFormatter.format(date);
}
