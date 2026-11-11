import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class UnichemDataDO extends RestStagingDO {
    protected getTabularData(value: unknown): unknown {
        const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
            ? value.structuredContent.data : value;
        // Preserve selected SQL _rowid values beneath a distinct column prefix.
        if (record(data) && typeof data.sql === "string" && Array.isArray(data.rows)) return {query_rows:data.rows.map(native => ({native}))};
        if (record(data) && record(data._unichem) && record(data.native)) {
            const native = data.native;
            const catalog = record(data.source_catalog) ? data.source_catalog.sources : undefined;
            return {
                ...(Array.isArray(native.compounds) ? {compounds:native.compounds} : {}),
                ...(Array.isArray(native.sources) ? {connectivity_assignments:native.sources} : {}),
                ...(Array.isArray(native.inchis) ? {connectivity_inchis:native.inchis} : {}),
                ...(record(native.searchedCompound) ? {searched_compound:[native.searchedCompound]} : {}),
                ...(Array.isArray(catalog) ? {source_catalog:catalog} : {}),
            };
        }
        return data;
    }

    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        // Root source-list or connectivity/compounds response — usually wraps under
        // `sources`, `compounds`, or similar. We inspect the first array we find.
        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object") {
                const row = sample as Record<string, unknown>;
                // Source catalog rows: sourceID, nameShort, nameLong, baseIdUrl
                if ("sourceID" in row || "nameShort" in row || "name_long" in row) {
                    return {
                        tableName: "sources",
                        indexes: ["sourceID", "nameShort", "nameLong"],
                    };
                }
                // Compound cross-reference rows: sourceID + compoundId
                if (("compoundId" in row || "compound_id" in row) && ("sourceID" in row || "src_id" in row)) {
                    return {
                        tableName: "compound_xrefs",
                        indexes: ["sourceID", "compoundId"],
                    };
                }
            }
        }

        return undefined;
    }
}
