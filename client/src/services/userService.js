import { api } from "./api";
/** User directory retrieval; mutations remain routed through the shared action workflow. */
export function fetchUsers() {
    return api("/users");
}
