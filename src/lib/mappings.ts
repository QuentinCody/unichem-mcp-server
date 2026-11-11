import { fail, KEY, object, requestUnichem, UNICHEM_BASE } from "./evidence";

export function mappingInput(value: unknown): { mode: "exact" | "connectivity"; query: Record<string, unknown> } {
  const body = object(value);
  for (const key of Object.keys(body)) if (!["mode", "type", "compound", "sourceID", "searchComponents"].includes(key)) fail(`Unsupported mapping option: ${key}`);
  if (body.mode !== "exact" && body.mode !== "connectivity") fail("Choose explicit mode: exact or connectivity");
  if (!["inchikey", "inchi", "sourceID", "uci"].includes(String(body.type))) fail("Unsupported compound type");
  validateIdentifier(body);
  if (body.searchComponents !== undefined && typeof body.searchComponents !== "boolean") fail("searchComponents must be boolean");
  if (body.mode === "exact" && body.searchComponents !== undefined) fail("searchComponents is only valid for connectivity mode");
  const { mode, ...query } = body;
  if (mode === "connectivity") query.searchComponents = body.searchComponents ?? false;
  return { mode, query };
}

function validateIdentifier(body: Record<string, unknown>): void {
  if (typeof body.compound !== "string" || !body.compound || body.compound.length > 10000 || Array.from(body.compound).some(char => char.charCodeAt(0) < 32)) fail("compound must be a nonempty string up to 10000 characters");
  if (body.type === "inchikey" && !KEY.test(body.compound)) fail("Use a full InChIKey; truncated connectivity blocks are not accepted");
  if (body.type === "inchi" && !body.compound.startsWith("InChI=1S/")) fail("Use a Standard InChI string");
  if (body.type === "uci" && !/^[1-9][0-9]*$/.test(body.compound)) fail("UCI must be a positive integer string");
  if (body.type === "sourceID") {
    if (!Number.isSafeInteger(body.sourceID) || Number(body.sourceID) <= 0) fail("sourceID requires a positive source database ID");
  } else if (body.sourceID !== undefined) fail("sourceID is only valid for sourceID queries");
}

function sourceIds(data: unknown): number[] {
  const metadata = object(data, 502);
  if (!Array.isArray(metadata.sources)) fail("Invalid UniChem source catalog", 502);
  const ids = metadata.sources.map(value => {
    const source = object(value, 502);
    if (typeof source.sourceID !== "number" || !Number.isSafeInteger(source.sourceID) || source.sourceID <= 0) fail("Invalid UniChem source catalog", 502);
    return source.sourceID;
  });
  if (new Set(ids).size !== ids.length) fail("Ambiguous UniChem source catalog", 502);
  return ids;
}

const JOIN_POLICY = "Retain each returned UCI, full InChI/InChIKey and every source assignment. Connectivity responses may expose only the searched structure plus source assignments/comparison flags, without individual candidate structures; never invent candidate UCIs or full structures from those flags. Connectivity/component hits are candidates, not exact identity. Compare full structure identifiers before merging; retain multiple structures and multiple IDs per source. Source update dates are observations, not target dataset releases or proof of current assignments. Do not transfer assay potency, stereochemistry or clinical properties solely through this mapping.";

/** Native records remain intact: never flatten to one identifier per source. */
export async function mappingEvidence(value: unknown): Promise<Record<string, unknown>> {
  const { mode, query } = mappingInput(value);
  const deadline = Date.now() + 26000;
  const catalog = await requestUnichem("/sources/", undefined, undefined, deadline);
  const ids = sourceIds(catalog.data);
  if (query.type === "sourceID" && !ids.includes(Number(query.sourceID))) fail("Requested source database is absent from the observed catalog", 422);
  const path = mode === "exact" ? "/compounds" : "/connectivity";
  const result = await requestUnichem(path, query, undefined, deadline);
  const native = object(result.data, 502);
  const connectivity = mode === "connectivity" && Array.isArray(native.sources) && native.searchedCompound && typeof native.searchedCompound === "object";
  const rows = connectivity ? native.sources : native.compounds;
  if (!Array.isArray(rows) || rows.some(value => !value || typeof value !== "object" || Array.isArray(value)))
    throw Object.assign(new Error("Invalid UniChem compounds envelope"), {status:502,data:result.data});
  return {
    native, source_catalog: catalog.data,
    _unichem: {
      mode, query, endpoint: UNICHEM_BASE + path, observed_at: new Date().toISOString(),
      response_sha256: result.sha256, source_catalog_sha256: catalog.sha256,
      source_catalog_url: UNICHEM_BASE + "/sources/", dataset_version: null,
      match_basis: mode === "exact" ? "upstream_standard_inchi_compound_lookup" : query.searchComponents ? "upstream_component_connectivity_search" : "upstream_whole_structure_connectivity_search",
      identity_independently_verified: false, absence_established: false,
      result_count: rows.length,
      result_unit: connectivity ? "source_assignment" : "compound",
      response_shape: connectivity ? "connectivity_source_assignments" : "compound_records",
      ...(native.totalCompounds !== undefined ? {reported_total_compounds:native.totalCompounds} : {}),
      ...(native.totalSources !== undefined ? {reported_total_sources:native.totalSources} : {}),
      completeness: "not_independently_verified", snapshot_is_atomic: false,
      join_policy: JOIN_POLICY,
    },
  };
}
