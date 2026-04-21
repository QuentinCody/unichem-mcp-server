import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class UnichemDataDO extends RestStagingDO {
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
