import { readResponseBytes, decodeResponseText } from "@bio-mcp/shared/http/response-reader";
import { unichemFetch, unichemPost } from "./http";

export const UNICHEM_BASE = "https://www.ebi.ac.uk/unichem/api/v1";
export const KEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function object(value: unknown, status = 400): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected a JSON object", status);
  // SAFETY: arrays and null have been excluded; JSON objects have string keys.
  return value as Record<string, unknown>;
}

/** One request deadline covers both headers and the complete bounded JSON body. */
export async function readUnichem(response: Response, deadline: number): Promise<{ data: unknown; sha256: string }> {
  let bytes: Uint8Array;
  let text: string;
  try {
    bytes = await readResponseBytes(response, {label:"UniChem",maxBytes:4 * 1024 * 1024,timeoutMs:deadline - Date.now()});
    text = decodeResponseText(bytes,"UniChem");
  } catch (error) {
    if (!response.ok) throw Object.assign(new Error(`UniChem HTTP ${response.status}`), {status:response.status,
      data:{http_status:response.status,body_unavailable:true,body_error:error instanceof Error ? error.message : String(error)}});
    throw error;
  }
  const reject = (message: string, status = 502): never => { throw Object.assign(new Error(message),{status,data:text}); };
  if (!response.ok) reject(`UniChem HTTP ${response.status}`,response.status);
  if (!response.headers.get("content-type")?.includes("json")) reject("Expected UniChem JSON");
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { reject("Invalid UniChem JSON"); }
  if (!data || typeof data !== "object") reject("Invalid UniChem data envelope");
  if (data && typeof data === "object" && !Array.isArray(data) && "response" in data && data.response !== "Success")
    throw Object.assign(new Error("UniChem reported an unsuccessful response"), {status:502,data:{http_status:response.status,response:text}});
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return { data, sha256 };
}

export async function requestUnichem(path: string, body: unknown, params: Record<string, unknown> | undefined, deadline: number): Promise<{ data: unknown; sha256: string }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) fail("UniChem request deadline exceeded", 504);
  const opts = { deadlineMs: remaining, timeout: Math.min(8000, remaining) };
  let response: Response;
  try { response = body === undefined ? await unichemFetch(path, params, opts) : await unichemPost(path, body, opts); }
  catch { fail("UniChem request failed or timed out", 502); }
  return readUnichem(response, deadline);
}
