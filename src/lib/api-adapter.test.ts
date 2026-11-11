import {afterEach, expect, it, vi} from "vitest";
import {createUnichemApiFetch} from "./api-adapter";

const json = (value: unknown) => new Response(JSON.stringify(value), {headers: {"Content-Type": "application/json"}});
const api = createUnichemApiFetch();
const key = "BSYNRYMUTXBXSQ-UHFFFAOYSA-N";
afterEach(() => vi.unstubAllGlobals());

it("routes evidence through the source catalog and native compound POST", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({sources: [{sourceID: 1}]})).mockResolvedValueOnce(json({compounds: [{id: 25, sources: []}]}));
  vi.stubGlobal("fetch", fetcher);
  expect(await api({method: "POST", path: "/mappings/evidence", body: {mode: "exact", type: "inchikey", compound: key}})).toMatchObject({status: 200, data: {native: {compounds: [{id: 25}]}, _unichem: {mode: "exact", identity_independently_verified: false}}});
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://www.ebi.ac.uk/unichem/api/v1/sources/", "https://www.ebi.ac.uk/unichem/api/v1/compounds"]);
});
it.each([
  {method: "GET", path: "/mappings/evidence"},
  {method: "POST", path: "/mappings/evidence", params: {mode: "exact"}},
] satisfies Parameters<typeof api>[0][])("rejects invalid local helper invocation %#", async request => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api(request)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  {path: `/inchi-key/${key}/`, body: {type: "inchikey", compound: key}},
  {path: "/inchi/InChI%3D1S%2FCH4%2Fh1H4/", body: {type: "inchi", compound: "InChI=1S/CH4/h1H4"}},
])("keeps legacy GET lookup compatible via modern POST: $path", async ({path, body}) => {
  const native = {response: "Success", compounds: [{id: 25}]};
  const fetcher = vi.fn().mockResolvedValue(json(native)); vi.stubGlobal("fetch", fetcher);
  expect(await api({method: "GET", path})).toMatchObject({status: 200, data: native, completeness:{complete:false,returned:1}});
  expect(fetcher).toHaveBeenCalledWith("https://www.ebi.ac.uk/unichem/api/v1/compounds", expect.objectContaining({method: "POST", body: JSON.stringify(body)}));
});
it.each(["/inchi-key/truncated/", "/inchi/%ZZ/", `/inchi-key/${key}/?source=22`])("rejects ambiguous legacy lookup %s", async path => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api({method: "GET", path})).rejects.toMatchObject({status: 400}); expect(fetcher).not.toHaveBeenCalled();
});
it("preserves native connectivity POST and source GET behavior", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({response: "Success"})));
  vi.stubGlobal("fetch", fetcher);
  await api({method: "POST", path: "/connectivity", body: {type: "uci", compound: "25", searchComponents: true}});
  await api({method: "GET", path: "/sources"});
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://www.ebi.ac.uk/unichem/api/v1/connectivity", "https://www.ebi.ac.uk/unichem/api/v1/sources/"]);
});

it.each(["/sources/7", "/sources/7/"])("normalizes individual source %s without a trailing-slash 404", async path => {
  const native = {response:"Success",sources:[{sourceID:7,name:"chebi"}]};
  const fetcher = vi.fn().mockResolvedValue(json(native)); vi.stubGlobal("fetch",fetcher);
  expect((await api({method:"GET",path})).data).toEqual(native);
  expect(fetcher).toHaveBeenCalledWith("https://www.ebi.ac.uk/unichem/api/v1/sources/7",expect.anything());
});
