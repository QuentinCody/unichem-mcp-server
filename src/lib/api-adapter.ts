import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { unichemFetch, unichemPost } from "./http";
import { unichemCompleteness } from "./completeness";
import { readUnichem, fail } from "./evidence";
import { mappingEvidence, mappingInput } from "./mappings";

type ApiRequest = Parameters<ApiFetchFn>[0];

function legacyLookup(path: string): Record<string, unknown> | undefined {
  const match = /^\/(inchi-key|inchi)\/(.+?)\/?$/.exec(path);
  if (!match) return undefined;
  let compound: string;
  try { compound = decodeURIComponent(match[2]); }
  catch { fail("Invalid encoded compound identifier"); }
  return mappingInput({mode: "exact", type: match[1] === "inchi-key" ? "inchikey" : "inchi", compound}).query;
}

async function nativeRequest(request: ApiRequest, deadline: number): Promise<Response> {
  const remaining = Math.max(1, deadline - Date.now());
  const options = {timeout:Math.min(8000,remaining),deadlineMs:remaining};
  const qIdx = request.path.indexOf("?");
  const qs = qIdx >= 0 ? request.path.slice(qIdx) : "";
  const rawPath = qIdx >= 0 ? request.path.slice(0, qIdx) : request.path;
  const legacy = request.method === "GET" ? legacyLookup(rawPath) : undefined;
  if (legacy) {
    if (qs || Object.keys(request.params ?? {}).length) fail("Legacy compound aliases do not accept query parameters");
    return unichemPost("/compounds", legacy, options);
  }
  // The source collection needs a slash; individual source records must omit it.
  if (request.method === "POST") return unichemPost(request.path, request.body, options);
  const normalized = /^\/sources\/[0-9]+\/?$/.test(rawPath) ? rawPath.replace(/\/$/, "") : rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
  return unichemFetch(normalized + qs, request.params, options);
}

/** Preserve native responses; local evidence additionally retains source metadata. */
export function createUnichemApiFetch(): ApiFetchFn {
  return async request => {
    if (!["GET","POST"].includes(request.method) || request.method === "GET" && request.body !== undefined) fail("UniChem supports GET and POST reads only",405);
    if (request.path === "/mappings/evidence" || request.path === "/mappings/evidence/") {
      if (request.method !== "POST") fail("Mapping evidence requires POST", 405);
      if (Object.keys(request.params ?? {}).length) fail("Mapping options belong in the JSON body");
      const data = await mappingEvidence(request.body);
      return {status:200,data,completeness:unichemCompleteness(data)};
    }
    const deadline = Date.now() + 26000;
    const response = await nativeRequest(request,deadline);
    const {data} = await readUnichem(response,deadline);
    const completeness = unichemCompleteness(data);
    return {status:response.status,data,...(completeness ? {completeness} : {})};
  };
}
