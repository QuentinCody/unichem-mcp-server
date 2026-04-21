# unichem-mcp-server

MCP server wrapping the UniChem REST API (EBI) — cross-references for small molecules across 40+ source databases (ChEMBL, PubChem, KEGG Compound, HMDB, ZINC, GtoPdb, BindingDB, SureChEMBL, DrugCentral, DrugBank, ChEBI, UNII, and more).

- **Upstream docs:** https://www.ebi.ac.uk/unichem/api/docs
- **Base URL:** `https://www.ebi.ac.uk/unichem/api/v1`
- **Quirk:** every GET collection path requires a trailing slash (308 otherwise). The api-adapter normalizes this automatically.

Complements BioThings MyChem (ChEMBL, DrugBank, PubChem, UNII, ChEBI). Use UniChem when you need cross-refs to KEGG Compound, HMDB, ZINC, GtoPdb ligands, BindingDB, SureChEMBL, or DrugCentral.

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
