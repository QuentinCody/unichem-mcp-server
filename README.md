# unichem-mcp-server

MCP server wrapping the UniChem REST API (EBI) — structure-based cross-references for small molecules. Discover current source availability through `/sources/`; the public catalog observed on October 3, 2026 listed 25 sources, including ChEMBL, PubChem and BindingDB. Historical source lists are not current availability guarantees.

- **Upstream docs:** https://www.ebi.ac.uk/unichem/api/docs
- **Base URL:** `https://www.ebi.ac.uk/unichem/api/v1`
- **Paths:** the catalog uses `/sources/`; an individual source uses `/sources/{srcid}` without a trailing slash. Both individual-source spellings remain available through Code Mode and normalize to the native no-slash route.

Complements BioThings MyChem. Source metadata is returned under `sources`, with `sourceID`, `name`, `nameLong`, `baseIdUrl`, `srcLastUpdated` and `lastChecked`. Preserve this metadata when mapping identifiers; the update dates are not equivalent to the current releases of the target databases.

## Tools (Code Mode only)

- `unichem_search` — browse the endpoint catalog.
- `unichem_execute` — run JavaScript in a V8 isolate with `api.get()` / `api.post()` routed to UniChem.
- `unichem_query_data` — SQL over staged datasets.
- `unichem_get_schema` — inspect staged schemas / list session-scoped datasets.

## Example

```js
// In unichem_execute:
const result = await api.post('/compounds', {
  type: 'inchikey',
  compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', // aspirin
});
return result;
```

## Exact and connectivity evidence

`/compounds` performs a Standard InChI-based compound lookup. `/connectivity`
broadens matching to connectivity layers; `searchComponents: true` also searches
mixture components. Connectivity is not merely a target-source filter and does
not establish full chemical identity. Exact results contain `compounds` with
structures and nested source assignments. Native connectivity results instead
contain `searchedCompound` and a flat `sources` assignment array with comparison
flags. Individual candidate UCIs/full structures may be absent; do not infer them
from the searched compound. Retain all returned identifiers, structures and source
assignments. One source can assign several identifiers; compound and assignment
counts have different units. Do not select only the first hit or transfer potency
or clinical properties solely through a mapping.

The following recipe uses the existing native endpoints. It returns original
payloads or their staging handles together with the selected search mode. It does
not require the local evidence helper.

```js
const mode = 'exact'; // Or 'connectivity'; select deliberately.
const input = {
  type: 'inchikey',
  compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
};
const endpoint = mode === 'exact' ? '/compounds' : '/connectivity';
const query = mode === 'exact' ? input : { ...input, searchComponents: false };
const [sourceCatalog, lookup] = await Promise.all([
  api.get('/sources/'),
  api.post(endpoint, query),
]);
if (!sourceCatalog || !lookup || sourceCatalog.__api_error || lookup.__api_error) {
  throw new Error('UniChem discovery or lookup failed; no mapping conclusion');
}
return {
  mode,
  query,
  source_catalog: sourceCatalog,
  lookup,
  identity_independently_verified: false,
  dataset_version: null,
};
```

If either payload carries `__staged`, preserve its `data_access_id` and inspect
it with `unichem_get_schema`/`unichem_query_data`. Avoid assuming a table name or
dereferencing replaced arrays. For a source identifier lookup, use both the
case-sensitive identifier and its numeric source database ID. ChEMBL, PubChem
and BindingDB were source IDs 1, 22 and 31 in the observed catalog; discover them
at runtime and retain each target dataset's own version and assay provenance.

For large identifier sets, the provider recommends whole-source mapping downloads;
the modern API does not support batch lookups. Discover current source coverage
at runtime rather than assuming a fixed source count.

The local `POST /mappings/evidence` helper adds bounded reads, source/response byte
hashes and explicit query provenance. It is exposed through Code Mode:

```js
return await api.post('/mappings/evidence', {
  mode: 'exact',
  type: 'inchikey',
  compound: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
});
```

Use `mode: 'connectivity'` and an explicit `searchComponents` boolean for broader
candidate matching. The helper retains native records under `native`, the source
catalog under `source_catalog`, and provenance under `_unichem`. The latter
distinguishes `result_unit`, `result_count`, `response_shape` and the unchanged
native reported totals. It does not infer independent identity, completeness or
a dataset release. Direct native reads and helper reads have a 4 MiB body cap;
the helper's 26-second request budget covers body reads and retries. Native HTTP
errors retain the response body; HTTP 200 semantic failures preserve the original
status/body as explicit failed evidence.

Large results stage at 30 KiB; retain the returned handle and inspect its schema.
Helper SQL tables separate `compounds`, `connectivity_assignments`,
`connectivity_inchis`, `searched_compound` and `source_catalog` when present.
Native `searchedInchiPos` can join an assignment to `connectivity_inchis.id`;
an absent position stays absent. Original native payloads remain in
`payloads.root_json`, with long strings in `content_chunks`. Small SQL/schema
results carry verifiable citations; large SQL results can themselves stage.
Conservative completeness metadata survives composed Code Mode results.
Both bare and `mcp_` tool aliases are registered. Legacy InChI/InChIKey GET paths
are compatibility aliases for native POST `/compounds`.

October 3 native/local acceptance verifies all four exact input types, legacy
GET aliases, source metadata and both helper modes through both tool aliases.
Aspirin UCI `161671` has 1,017 native assignments, including ChEBI `CHEBI:15365`;
its full InChI/InChIKey match the observed ChEBI default structure. Connectivity
reports 15 compounds and returns 1,044 assignments. Complete native payloads,
assignment SQL and source dates recover without changing their values.

For the provider's documented two-component mixture, `searchComponents: false`
returned 1 reported compound / 8 assignments; `true` returned 20 / 51 with
`searchedComponent` flags. Repeating the latter request changed 20 complete
assignment records, not just their order. A transparent local HTTPS recording
bridge verified each MCP result and hash against the exact live response supplied
to that Worker invocation, including component SQL joins. These observations do
not prove a stable or complete candidate set. The local tests retain default TLS
verification; no production deployment occurred. See the
[acceptance tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md)
for test counts and qualification limits.

Sources: [compound search](https://chembl.gitbook.io/unichem/api/compound-search),
[connectivity search](https://chembl.gitbook.io/unichem/api/connectivity-search),
[source catalog](https://www.ebi.ac.uk/unichem/api/v1/sources/),
[batch guidance](https://chembl.gitbook.io/unichem/api).

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from UniChem and stays under the terms of that source: CC0.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
