import { api } from "./api";
export function fetchCurrentSession() {
    return api("/sessions/current");
}
export function fetchMySessions() {
    return api("/sessions/mine");
}
export function fetchSessionQuality() {
    return api("/sessions/quality");
}
