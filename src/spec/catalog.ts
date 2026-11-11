import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const unichemCatalog: ApiCatalog = {
    name: "UniChem",
    baseUrl: "https://www.ebi.ac.uk/unichem/api/v1",
    version: "v1",
    auth: "none",
    endpointCount: 8,
    notes:
        "Complements BioThings MyChem — MyChem covers 5 sources (ChEMBL, DrugBank, PubChem, UNII, ChEBI). " +
        "Use UniChem when you need cross-refs to KEGG Compound, HMDB, ZINC, GtoPdb ligands, BindingDB, SureChEMBL, or DrugCentral.\n" +
        "- UniChem is EBI's cross-reference service for small molecules. Discover current source coverage using /sources/.\n" +
        "- GET /sources/ uses a trailing slash, while GET /sources/{src_id} must omit it (a trailing slash returns 404). The adapter normalizes both supported spellings.\n" +
        "- POST endpoints (/compounds, /connectivity) do NOT use trailing slashes.\n" +
        "- /compounds (POST) returns cross-refs for a compound across ALL source DBs. Body: { type: 'inchikey'|'inchi'|'sourceID', compound: '<identifier>', sourceID?: <int> }.\n" +
        "- Current /connectivity responses contain searchedCompound plus sources[] assignment/comparison records; totalCompounds counts candidate structures while totalSources counts assignments. Individual candidate UCIs/full structures may be absent. Preserve this native shape; never equate it with /compounds[].\n" +
        "- /connectivity (POST) broadens structure matching by connectivity; searchComponents selects component matching. Hits are candidates, not proof of exact identity.\n" +
        "- Look up source IDs via GET /sources/: fields include sourceID, name, nameLong, baseIdUrl, srcLastUpdated and lastChecked. Source dates do not pin target dataset releases.\n" +
        "- POST /mappings/evidence is a local helper: explicit mode, full native records, observed source catalog and response hashes; no inferred identity or completeness. Preserve multiple assignments.\n" +
        "- Legacy InChI/InChIKey GET paths are local aliases for POST /compounds. Batch lookups are not a documented native API; use provider mapping downloads for bulk work.\n" +
        "- InChIKey lookups: supply the full standard InChIKey (27-char with two dashes, e.g. BSYNRYMUTXBXSQ-UHFFFAOYSA-N for aspirin).",
    endpoints: [
        {
            method: "GET",
            path: "/sources/",
            summary:
                "Discover the current source catalog: sourceID, name, nameLong, baseIdUrl and native update/check dates. Preserve retrieval time; availability changes independently per source.",
            category: "sources",
            coveredByTool: "unichem_search",
        },
        {
            method: "GET",
            path: "/sources/{src_id}",
            summary: "Metadata for one source database, keyed by integer sourceID (see GET /sources/).",
            category: "sources",
            pathParams: [
                {
                    name: "src_id",
                    type: "number",
                    required: true,
                    description: "Integer UniChem source ID (e.g. 1 for ChEMBL, 22 for PubChem, 6 for KEGG Compound, 2 for DrugBank).",
                },
            ],
            coveredByTool: "unichem_search",
        },
        {
            method: "GET", path: "/sources/{src_id}/", category: "sources",
            summary: "Local compatibility alias for source metadata; routes upstream to /sources/{src_id} without the slash.",
            pathParams: [{name:"src_id",type:"number",required:true,description:"Numeric source database ID from /sources/"}],
        },
        {
            method: "POST",
            path: "/compounds",
            summary:
                "Return cross-references for a compound across every UniChem source DB. Body: { type: 'inchikey'|'inchi'|'sourceID', compound: '<identifier>', sourceID?: <int> }. Use sourceID when type='sourceID' to disambiguate the input.",
            category: "compounds",
            body: {
                contentType: "application/json",
                description:
                    "JSON body. Example for an InChIKey lookup: { \"type\": \"inchikey\", \"compound\": \"BSYNRYMUTXBXSQ-UHFFFAOYSA-N\" }. Example for a source-ID lookup: { \"type\": \"sourceID\", \"compound\": \"CHEMBL25\", \"sourceID\": 1 }.",
            },
            example:
                "await api.post('/compounds', { type: 'inchikey', compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' })",
            coveredByTool: "unichem_execute",
        },
        {
            method: "POST",
            path: "/connectivity",
            summary:
                "Connectivity-based compound candidates. Body: { compound: '<identifier>', type: 'inchikey'|'inchi'|'sourceID'|'uci', sourceID?: <int>, searchComponents?: <boolean> }. Retain full structures before considering identity joins.",
            category: "connectivity",
            body: {
                contentType: "application/json",
                description:
                    "JSON body. searchComponents=false searches whole-structure connectivity; true also permits component matching. This changes match semantics, not merely output-source filtering.",
            },
            example:
                "await api.post('/connectivity', { compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', type: 'inchikey', searchComponents: false })",
            coveredByTool: "unichem_execute",
        },
        {
            method: "GET",
            path: "/inchi-key/{inchi_key}/",
            summary: "Local compatibility alias: look up a full InChIKey through native POST /compounds. Returns the native cross-reference response.",
            category: "inchi",
            pathParams: [
                {
                    name: "inchi_key",
                    type: "string",
                    required: true,
                    description: "Full 27-character standard InChIKey with two dashes (e.g. 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' for aspirin).",
                },
            ],
            example: "await api.get('/inchi-key/BSYNRYMUTXBXSQ-UHFFFAOYSA-N/')",
            coveredByTool: "unichem_search",
        },
        {
            method: "GET",
            path: "/inchi/{standard_inchi}/",
            summary: "Local compatibility alias: look up a Standard InChI through native POST /compounds. URL-encode the identifier.",
            category: "inchi",
            pathParams: [
                {
                    name: "standard_inchi",
                    type: "string",
                    required: true,
                    description:
                        "Standard InChI string (e.g. 'InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)'). URL-encode before embedding.",
                },
            ],
            example:
                "await api.get('/inchi/' + encodeURIComponent('InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)') + '/')",
            coveredByTool: "unichem_search",
        },
        {
            method: "POST",
            path: "/mappings/evidence",
            summary: "Local provenance-preserving compound mapping: explicit exact or connectivity mode, complete native assignments, source catalog, observation time and response SHA-256 hashes. Independent identity and completeness remain unverified.",
            category: "evidence",
            body: {
                contentType: "application/json",
                description: "Required mode: exact|connectivity, type: inchikey|inchi|sourceID|uci, compound: string. sourceID is required only for sourceID input. Boolean searchComponents is allowed only for connectivity (default false).",
            },
            example: "await api.post('/mappings/evidence', {mode: 'exact', type: 'inchikey', compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N'})",
            coveredByTool: "unichem_execute",
        },
    ],
};
