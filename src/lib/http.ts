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
        timeout: opts?.timeout ?? 30_000,
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
        timeout: opts?.timeout ?? 30_000,
        userAgent: "unichem-mcp-server/1.0 (bio-mcp)",
    });
}
