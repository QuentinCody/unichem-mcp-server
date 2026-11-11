import {afterEach, expect, it, vi} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {registerCodeMode} from "./code-mode";
import {registerGetSchema} from "./get-schema";
import {registerQueryData} from "./query-data";
import {unichemCatalog} from "../spec/catalog";
import {createUnichemApiFetch} from "../lib/api-adapter";

const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"Content-Type": "application/json"}});
afterEach(() => vi.unstubAllGlobals());

it("registers both aliases and returns both fields for discovery and errors", async () => {
  const server = new McpServer({name: "fixture", version: "1"});
  // SAFETY: no isolate runs in this registration test; the loader is only constructed.
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerGetSchema(server, {}); registerQueryData(server, {});
  // SAFETY: SDK private registry is inspected only in tests to exercise the real handlers.
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    expect(tools[`unichem_${suffix}`]).toBeDefined(); expect(tools[`mcp_unichem_${suffix}`]).toBeDefined();
  }
  for (const prefix of ["unichem", "mcp_unichem"]) {
    expect(await tools[`${prefix}_search`].handler({query: "mapping evidence", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
    expect(await tools[`${prefix}_execute`].handler({code: ""}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
    expect(await tools[`${prefix}_query_data`].handler({data_access_id: "fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
  }
  expect(unichemCatalog.endpointCount).toBe(unichemCatalog.endpoints.length);
});

it("stages all mapping assignments and provenance without exceeding transport bounds", async () => {
  const sources = {response: "Success", sources: [{sourceID: 1, name: "chembl", srcLastUpdated: "2026-05-31"}]};
  const native = {response: "Success", compounds: [{id: 25, sources: [{sourceID: 1, compoundId: "CHEMBL25"}, {sourceID: 1, compoundId: "CHEMBL_OTHER"}], evidence: "α".repeat(20000)}]};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(sources)).mockResolvedValueOnce(json(native)));
  const stored: unknown[] = [];
  // SAFETY: this fixture supplies the two DO methods used by the staging helper.
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      const payload = await request.json() as {data: unknown};
      stored.push(payload.data); return json({success: true, tables_created: ["payloads"], total_rows: 1});
    }
    return json({success: true, schema: {tables: {payloads: {columns: [{name: "root_json"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createUnichemApiFetch(), catalog: unichemCatalog, doNamespace: namespace, stagingPrefix: "unichem", maxInlineBytes: 30 * 1024});
  const result = await proxy.handler({method: "POST", path: "/mappings/evidence", body: {mode: "exact", type: "uci", compound: "25"}}, {sql: () => []});
  expect(result).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  // Staging may store a queryable collection as well as the lossless root payload.
  const payloads = stored.map(value => typeof value === "string" ? JSON.parse(value) : value);
  expect(payloads).toEqual(expect.arrayContaining([expect.objectContaining({native, source_catalog: sources, _unichem: expect.objectContaining({mode: "exact", dataset_version: null, identity_independently_verified: false, response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)})})]));
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(100000);
});

it("preserves invalid helper input as an incomplete API failure", async () => {
  const proxy = createApiProxyTool({apiFetch: createUnichemApiFetch(), catalog: unichemCatalog, stagingPrefix: "unichem"});
  expect(await proxy.handler({method: "POST", path: "/mappings/evidence", body: {type: "uci", compound: "25"}}, {sql: () => []})).toMatchObject({__api_error: true, incomplete: true, status: 400});
});
