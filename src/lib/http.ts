import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const UNICHEM_BASE = "https://www.ebi.ac.uk/unichem/api/v1";

export interface UnichemFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the UniChem REST API (EBI).
 *
 * Note: every UniChem collection path requires a trailing slash
 * (308 redirect otherwise — verified 2026-04-20). Callers should bake
 * the trailing slash into the path.
 */
export async function unichemFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: UnichemFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? UNICHEM_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        // 8s per ATTEMPT, 26s for the whole call. EBI's UniChem front end
        // answers healthy requests in 0.5-1.4s but stalls ~1 request in 3 for
        // 31-34s before returning its HTML 500 page (measured 8/26 fresh POSTs,
        // 2026-08-28) — and the same stall hits /compounds, /connectivity,
        // /sources/ and the legacy /rest/ path, so it is EBI-wide, not an
        // endpoint we can route around. A 30s per-attempt cap let one stall eat
        // the code-mode isolate's entire 30s wall clock, so the probe died with
        // "Execution timed out" after exactly ONE subrequest. 8s is ~6x the
        // slowest healthy response, and 26s leaves the isolate room to return.
        timeout: opts?.timeout ?? 8_000,
        deadlineMs: opts?.deadlineMs ?? 26_000,
        userAgent: "unichem-mcp-server/1.0 (bio-mcp)",
    });
}

/**
 * POST to the UniChem REST API with a JSON body.
 */
export async function unichemPost(
    path: string,
    body: unknown,
    opts?: UnichemFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? UNICHEM_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, undefined, {
        ...opts,
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        // 8s per ATTEMPT, 26s for the whole call. EBI's UniChem front end
        // answers healthy requests in 0.5-1.4s but stalls ~1 request in 3 for
        // 31-34s before returning its HTML 500 page (measured 8/26 fresh POSTs,
        // 2026-08-28) — and the same stall hits /compounds, /connectivity,
        // /sources/ and the legacy /rest/ path, so it is EBI-wide, not an
        // endpoint we can route around. A 30s per-attempt cap let one stall eat
        // the code-mode isolate's entire 30s wall clock, so the probe died with
        // "Execution timed out" after exactly ONE subrequest. 8s is ~6x the
        // slowest healthy response, and 26s leaves the isolate room to return.
        timeout: opts?.timeout ?? 8_000,
        deadlineMs: opts?.deadlineMs ?? 26_000,
        userAgent: "unichem-mcp-server/1.0 (bio-mcp)",
    });
}
