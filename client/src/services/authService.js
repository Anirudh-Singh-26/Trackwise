import { api } from "./api";
export function fetchCurrentUser() {
    return api("/auth/me");
}
export function loginRequest(email, password) {
    return api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
    });
}
export function logoutRequest() {
    return api("/auth/logout", { method: "POST" });
}
