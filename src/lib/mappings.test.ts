import { afterEach, expect, it, vi } from "vitest";
import { mappingEvidence, mappingInput } from "./mappings";

const key = "BSYNRYMUTXBXSQ-UHFFFAOYSA-N";
// Source metadata fields follow the public /sources/ response observed 2026-09-28.
const sources = { response: "Success", sources: [{ sourceID: 1, name: "chembl", srcLastUpdated: "2026-05-31 10:35:23" }, { sourceID: 22, name: "pubchem", srcLastUpdated: "2026-09-07 10:56:06" }, { sourceID: 31, name: "bindingdb", srcLastUpdated: "2026-02-23 10:51:58", lastChecked: "2026-09-20" }], totalSources: "3" };
// Synthetic native records test lossless transport, not an independently validated live schema.
const native = { response: "Success", compounds: [{ id: "fixture1", inchi: "InChI=1S/fixture", inchiKey: key, sources: [{ id: 31, compoundId: "0012" }, { id: 31, compoundId: "0013" }] }, { id: "fixture2", inchiKey: "BSYNRYMUTXBXSQ-AAAAAAAAAA-N", sources: [{ id: 22, compoundId: "999" }] }], totalCompounds: 2 };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
function mock(data: unknown = native, catalog: unknown = sources) {
  const fetcher = vi.fn().mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(json(data));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  { mode: "exact", path: "/compounds", basis: "upstream_standard_inchi_compound_lookup", extra: {} },
  { mode: "connectivity", path: "/connectivity", basis: "upstream_whole_structure_connectivity_search", extra: {} },
  { mode: "connectivity", path: "/connectivity", basis: "upstream_component_connectivity_search", extra: { searchComponents: true } },
])("keeps $basis distinct with complete source and structure evidence", async ({ mode, path, basis, extra }) => {
  const fetcher = mock();
  const result = await mappingEvidence({ mode, type: "inchikey", compound: key, ...extra });
  expect(result).toMatchObject({ native, source_catalog: sources, _unichem: { mode, match_basis: basis, result_count: 2, identity_independently_verified: false, dataset_version: null, absence_established: false, snapshot_is_atomic: false } });
  const expectedBody = mode === "exact" ? { type: "inchikey", compound: key } : { type: "inchikey", compound: key, searchComponents: false, ...extra };
  expect(fetcher.mock.calls[1]).toEqual([`https://www.ebi.ac.uk/unichem/api/v1${path}`, expect.objectContaining({ method: "POST", body: JSON.stringify(expectedBody) })]);
});
it("retains case-sensitive source identifiers and leading zeros", async () => {
  const fetcher = mock();
  await mappingEvidence({ mode: "exact", type: "sourceID", sourceID: 31, compound: "00012a" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ type: "sourceID", sourceID: 31, compound: "00012a" });
});
it("rejects an unavailable input source before lookup", async () => {
  const fetcher = mock();
  await expect(mappingEvidence({ mode: "exact", type: "sourceID", sourceID: 6, compound: "C00001" })).rejects.toMatchObject({ status: 422 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not turn an empty mapping into an absence claim", async () => {
  mock({ compounds: [] });
  expect(await mappingEvidence({ mode: "exact", type: "uci", compound: "123" })).toMatchObject({ native: { compounds: [] }, _unichem: { result_count: 0, absence_established: false, completeness: "not_independently_verified" } });
});
it.each([
  { mode: "wrong" }, { mode: "exact", type: "smiles" }, { compound: 123 }, { compound: "" },
  { compound: "A".repeat(10001) }, { compound: "BSYNRYMUTXBXSQ" },
  { type: "inchi", compound: "InChI=1/C" }, { type: "uci", compound: "1.5" },
  { type: "sourceID", sourceID: 0 }, { type: "sourceID", sourceID: "31" },
  { sourceID: 31 }, { searchComponents: true }, { mode: "connectivity", searchComponents: "false" },
  { targetSourceIDs: [1, 22, 31] },
])("rejects ambiguous mapping input %#", async extra => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(mappingEvidence({ mode: "exact", type: "inchikey", compound: key, ...extra })).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([null, [], "{}"])("rejects non-object input %#", value => {
  expect(() => mappingInput(value)).toThrow("Expected a JSON object");
});
it.each([
  { response: "Success", compounds: null }, { response: "Success" }, { compounds: [null] },
])("rejects malformed compound evidence %#", async data => {
  mock(data);
  await expect(mappingEvidence({ mode: "exact", type: "inchikey", compound: key })).rejects.toMatchObject({ status: 502, message: "Invalid UniChem compounds envelope" });
});
it.each([
  { catalog: [], data: native },
  { catalog: { sources: [null] }, data: native },
  { catalog: sources, data: [] },
])("reports malformed upstream objects as provider errors, not caller errors %#", async ({ catalog, data }) => {
  mock(data, catalog);
  await expect(mappingEvidence({ mode: "exact", type: "inchikey", compound: key })).rejects.toMatchObject({ status: 502, message: "Expected a JSON object" });
});
it.each([
  { sources: null }, { sources: [{ sourceID: "31" }] }, { sources: [{ sourceID: 1 }, { sourceID: 1 }] },
])("rejects malformed or ambiguous source metadata %#", async catalog => {
  const fetcher = mock(native, catalog);
  await expect(mappingEvidence({ mode: "exact", type: "inchikey", compound: key })).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retains the observed connectivity assignment shape without inventing candidate structures", async () => {
  const data = {response:"Success",searchedCompound:{uci:161671,standardInchiKey:key,inchi:"InChI=1S/C9H8O4"},
    sources:[{id:31,compoundId:"0012",typeOfSearch:"match",comparison:{connectivity:true,protonation:false}},
      {id:31,compoundId:"0013",typeOfSearch:"match",comparison:{connectivity:true,isotope:false}}],totalCompounds:15,totalSources:2};
  mock(data);
  const result = await mappingEvidence({mode:"connectivity",type:"inchikey",compound:key,searchComponents:true});
  expect(result).toMatchObject({native:data,_unichem:{result_count:2,result_unit:"source_assignment",response_shape:"connectivity_source_assignments",reported_total_compounds:15,reported_total_sources:2,identity_independently_verified:false}});
  expect(result.native).not.toHaveProperty("compounds");
});
