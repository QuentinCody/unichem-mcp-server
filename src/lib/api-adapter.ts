import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { unichemFetch, unichemPost } from "./http";

/**
 * Create the UniChem ApiFetchFn that routes isolate api.get/api.post calls
 * through the server's HTTP layer.
 *
 * Quirk: every collection path must end in `/` (UniChem returns 308 otherwise).
 * This adapter normalizes any caller-supplied path that targets a known
 * collection/resource endpoint to include the trailing slash.
 */
export function createUnichemApiFetch(): ApiFetchFn {
    return async (request) => {
        let path = request.path;

        // Preserve explicit query strings the caller may have appended.
        const qIdx = path.indexOf("?");
        const qs = qIdx >= 0 ? path.slice(qIdx) : "";
        const rawPath = qIdx >= 0 ? path.slice(0, qIdx) : path;

        // Normalize trailing slash on resource/collection paths — avoids 308 redirects.
        // POST endpoints in UniChem do NOT use trailing slashes (/compounds, /connectivity),
        // so we only normalize for GET.
        let normalized = rawPath;
        if (request.method === "GET" && !normalized.endsWith("/")) {
            normalized = `${normalized}/`;
        }
        path = `${normalized}${qs}`;

        let response: Response;
        if (request.method === "POST") {
            response = await unichemPost(path, request.body);
        } else {
            response = await unichemFetch(path, request.params);
        }

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
