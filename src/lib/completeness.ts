import type { Completeness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function directCompleteness(data: unknown): Completeness | undefined {
  if (!record(data) || data.__staged === true) return undefined;
  const evidence = record(data._unichem) ? data._unichem : undefined;
  const native = evidence && record(data.native) ? data.native : data;
  const rows = Array.isArray(native.compounds) ? native.compounds : record(native.searchedCompound) && Array.isArray(native.sources) ? native.sources : undefined;
  if (!evidence && !rows) return undefined;
  return {complete:false,...(rows ? {returned:rows.length} : {}),
    truncation:{reason:"unknown",detail:"UniChem lookup results and source catalog dates do not independently establish complete mapping coverage or an atomic snapshot.",remedy:"Retain native structure records or connectivity assignments with their comparison flags. Report compound and assignment counts separately; independently compare full structure identifiers before merging evidence."}};
}

/** Preserve native coverage limits when a program returns composed evidence. */
export function unichemCompleteness(data: unknown): Completeness | undefined {
  const observations: Completeness[] = [];
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    const direct = directCompleteness(value);
    if (direct) { observations.push(direct); continue; }
    if (record(value) && value.__staged === true) {
      const staging = value._staging;
      if (record(staging) && record(staging.completeness) && staging.completeness.complete === false)
        observations.push({ ...staging.completeness, complete: false });
      continue;
    }
    for (const child of Object.values(value)) pending.push(child);
  }
  if (observations.length === 0) return undefined;
  if (observations.length === 1) return observations[0];
  return { complete: false, truncation: { reason: "unknown",
    detail: "Composed UniChem evidence includes multiple native observations with unverified coverage.",
    remedy: "Retain the native identifiers, counts, page bounds and source metadata of each native response separately." } };
}
