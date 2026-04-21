import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const unichemCatalog: ApiCatalog = {
    name: "UniChem",
    baseUrl: "https://www.ebi.ac.uk/unichem/api/v1",
    version: "v1",
    auth: "none",
    endpointCount: 6,
    notes:
        "Complements BioThings MyChem — MyChem covers 5 sources (ChEMBL, DrugBank, PubChem, UNII, ChEBI). " +
        "Use UniChem when you need cross-refs to KEGG Compound, HMDB, ZINC, GtoPdb ligands, BindingDB, SureChEMBL, or DrugCentral.\n" +
        "- UniChem is EBI's cross-reference service for small molecules, spanning 40+ source databases.\n" +
        "- IMPORTANT quirk: every collection GET path REQUIRES a trailing slash (308 redirect otherwise, verified 2026-04-20). The api-adapter normalizes this automatically, but preserve trailing slashes in any explicit path you pass.\n" +
        "- POST endpoints (/compounds, /connectivity) do NOT use trailing slashes.\n" +
        "- /compounds (POST) returns cross-refs for a compound across ALL source DBs. Body: { type: 'inchikey'|'inchi'|'sourceID', compound: '<identifier>', sourceID?: <int> }.\n" +
        "- /connectivity (POST) is targeted: supply `targetSourceIDs: [<int>, ...]` in the body to get cross-refs for only specific source DBs.\n" +
        "- Look up source IDs via GET /sources/ (tiny, cacheable) — each source has { sourceID, nameShort, nameLong, baseIdUrl }.\n" +
        "- InChIKey lookups: supply the full standard InChIKey (27-char with two dashes, e.g. BSYNRYMUTXBXSQ-UHFFFAOYSA-N for aspirin).",
    endpoints: [
        {
            method: "GET",
            path: "/sources/",
            summary:
                "List every UniChem source database (40+): sourceID, nameShort (e.g. 'chembl', 'pubchem', 'kegg_ligand', 'hmdb', 'zinc', 'gtopdb', 'bindingdb', 'surechembl', 'drugcentral', 'drugbank', 'chebi', 'unii'), nameLong, baseIdUrl. Tiny response, cache-worthy.",
            category: "sources",
            coveredByTool: "unichem_search",
        },
        {
            method: "GET",
            path: "/sources/{src_id}/",
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
                "Targeted cross-reference lookup: return cross-refs for a compound only in the specified target source DBs. Body: { compound: '<identifier>', type: 'inchikey'|'inchi'|'sourceID', sourceID?: <int>, targetSourceIDs: [<int>, ...] }.",
            category: "connectivity",
            body: {
                contentType: "application/json",
                description:
                    "JSON body with targetSourceIDs. Example: { \"compound\": \"BSYNRYMUTXBXSQ-UHFFFAOYSA-N\", \"type\": \"inchikey\", \"targetSourceIDs\": [1, 22, 6] } — returns cross-refs only in ChEMBL, PubChem, and KEGG.",
            },
            example:
                "await api.post('/connectivity', { compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', type: 'inchikey', targetSourceIDs: [1, 22, 6] })",
            coveredByTool: "unichem_execute",
        },
        {
            method: "GET",
            path: "/inchi-key/{inchi_key}/",
            summary: "Look up a compound by its full standard InChIKey. Returns cross-references across UniChem sources.",
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
            summary: "Look up a compound by its standard InChI string. Returns cross-references across UniChem sources.",
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
    ],
};
