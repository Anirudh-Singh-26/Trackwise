export const dateLabel = (value) => value ? new Date(value).toLocaleString() : "—";
export const duration = (ms = 0) => {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours)
        return `${hours}h ${String(mins).padStart(2, "0")}m`;
    if (mins)
        return `${mins}m ${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
};
// Date inputs and reporting filters use the employee's local calendar date, not UTC.
export const dateInputValue = (value = new Date()) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
export const today = () => dateInputValue();
