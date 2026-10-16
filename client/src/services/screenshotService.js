import { api } from "./api";
export function fetchScreenshotPolicy() {
    return api("/screenshots/policy");
}
export function updateScreenshotPolicy(policy) {
    return api("/screenshots/policy", { method: "PUT", body: JSON.stringify(policy) });
}
export function fetchScreenshots(employeeId, page, limit = 30) {
    return api(`/screenshots?employeeId=${encodeURIComponent(employeeId)}&page=${page}&limit=${limit}`);
}
export function fetchScreenshotAccess(screenshotId) {
    return api(`/screenshots/${encodeURIComponent(screenshotId)}/access`);
}
export function deleteScreenshotRequest(screenshotId) {
    return api(`/screenshots/${encodeURIComponent(screenshotId)}`, { method: "DELETE" });
}
