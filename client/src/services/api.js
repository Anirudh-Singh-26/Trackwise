/** Centralized API client. Keep credentials enabled because Trackwise auth uses HttpOnly cookies. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1")
    .replace(/\\n/g, "")
    .trim()
    .replace(/\/$/, "");
export async function api(path, options = {}) {
    const method = options.method || "GET";
    const startedAt = Date.now();
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });
    }
    catch (cause) {
        const reason = cause instanceof Error ? cause.message : "Network request failed";
        const error = new Error(`Cannot reach the Trackwise API at ${API_BASE_URL}. Confirm the backend is running and client/.env contains the correct VITE_API_BASE_URL. (${reason})`);
        console.error("[Trackwise API] network failure", {
            method,
            path,
            baseUrl: API_BASE_URL,
            durationMs: Date.now() - startedAt,
        });
        throw error;
    }
    const data = (await response.json().catch(() => ({
        message: "The server returned a non-JSON response. Check that VITE_API_BASE_URL points to the API, not the frontend URL.",
    })));
    const requestId = response.headers.get("X-Request-Id") || data.requestId || "not-provided";
    console.info("[Trackwise API]", {
        method,
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        requestId,
    });
    if (!response.ok) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.status = response.status;
        error.requestId = String(requestId);
        throw error;
    }
    return data;
}
