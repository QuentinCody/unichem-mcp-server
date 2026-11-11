/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { hashCanonicalJson, verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { UnichemDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new UnichemDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { UNICHEM_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}unichem_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}


it.each(["exact","connectivity"])("recovers %s mapping evidence and every assignment through SQL with both aliases", async mode => {
  const f = fixture();
  const sources = {response:"Success",sources:[{sourceID:31,name:"bindingdb",srcLastUpdated:"2026-02-23 10:51:58"}]};
  const assignments = Array.from({length:150},(_,i)=>({id:31,compoundId:String(i).padStart(8,"0"),typeOfSearch:"match",...(mode === "connectivity" ? {searchedInchiPos:i%2} : {}),comparison:{connectivity:true,stereoSp3:false},note:"α🧬".repeat(70)}));
  const native = mode === "exact" ? {response:"Success",compounds:[{uci:161671,standardInchiKey:"BSYNRYMUTXBXSQ-UHFFFAOYSA-N",sources:assignments}],totalCompounds:"1"}
    : {response:"Success",searchedCompound:{uci:161671,standardInchiKey:"BSYNRYMUTXBXSQ-UHFFFAOYSA-N"},sources:assignments,inchis:[{id:0,inchi:"InChI=1S/fixture-A"},{id:1,inchi:"InChI=1S/fixture-B"}],totalCompounds:15,totalSources:150};
  vi.stubGlobal("fetch",vi.fn(async (url:string)=>Response.json(url.endsWith('/sources/')?sources:native)));
  try {
    for (const prefix of ["","mcp_"]) {
      const args = {code:`return await api.post('/mappings/evidence',{mode:'${mode}',type:'uci',compound:'161671'});`};
      const output = await f.tools[`${prefix}unichem_execute`].handler(args,{});
      expect(output.isError,JSON.stringify(output)).not.toBe(true);
      expect(output.structuredContent._meta.completeness.complete).toBe(false);
      const id = output.structuredContent.data.data_access_id;
      const recovered = await recover(f,id,prefix);
      expect(recovered).toMatchObject({native,source_catalog:sources,_unichem:{identity_independently_verified:false,result_count:mode === "exact" ? 1 : 150,result_unit:mode === "exact" ? "compound" : "source_assignment"}});
      const verified = await verifyCitationEnvelope({citation:output.structuredContent._meta.citation,structuredContent:output.structuredContent,toolArguments:args,materialized:{value:recovered}});
      expect(verified.verification).toMatchObject({query:"verified",result:"verified"});
      const sql = mode === "exact" ? "SELECT p.uci, s.compoundId FROM compounds p JOIN compounds_sources s ON s.parent_id=p._rowid ORDER BY s._rowid" : "SELECT compoundId, comparison_stereoSp3 FROM connectivity_assignments ORDER BY _rowid";
      const queryArgs = {data_access_id:id,sql,limit:200};
      const rows = await f.tools[`${prefix}unichem_query_data`].handler(queryArgs,{});
      expect(rows.isError,JSON.stringify(rows)).not.toBe(true);
      expect(rows.structuredContent.data.rows.map((row:any)=>row.compoundId)).toEqual(assignments.map(row=>row.compoundId));
      expect(rows.structuredContent.data.rows).toHaveLength(150);
      if (mode === "connectivity") {
        const joined = await f.tools[`${prefix}unichem_query_data`].handler({data_access_id:id,sql:"SELECT a.compoundId,i.inchi FROM connectivity_assignments a JOIN connectivity_inchis i ON i.id=a.searchedInchiPos ORDER BY a._rowid LIMIT 2"},{});
        expect(joined.structuredContent.data.rows).toEqual([{compoundId:"00000000",inchi:"InChI=1S/fixture-A"},{compoundId:"00000001",inchi:"InChI=1S/fixture-B"}]);
      }
      for (const [name,input] of [["query_data",{data_access_id:id,sql:"SELECT sourceID, srcLastUpdated FROM source_catalog"}],["get_schema",{data_access_id:id}]] as const) {
        const result = await f.tools[`${prefix}unichem_${name}`].handler(input,{});
        const checked = await verifyCitationEnvelope({citation:result.structuredContent._meta.citation,structuredContent:result.structuredContent,toolArguments:input});
        expect(checked.verification).toMatchObject({query:"verified",result:"verified"});
      }
      const large = await f.tools[`${prefix}unichem_query_data`].handler({data_access_id:id,sql:`SELECT * FROM ${mode === "exact" ? "compounds_sources" : "connectivity_assignments"}`,limit:200},{});
      expect(large.isError,JSON.stringify(large)).not.toBe(true);
      const complete = await recover(f,large.structuredContent.data_access_id,prefix);
      expect(complete.structuredContent.data.rows.map((row:any)=>row.compoundId)).toEqual(assignments.map(row=>row.compoundId));
    }
  } finally { f.close(); }
});

it("preserves native HTTP errors and oversized Unicode programs in both aliases", async () => {
  const f = fixture();
  const body = JSON.stringify({error:"native α🧬".repeat(15000)});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(body,{status:400,headers:{"content-type":"application/json"}})));
  try {
    for (const prefix of ["","mcp_"]) {
      const args = {code:"return await api.post('/compounds',{type:'inchikey',compound:'invalid'});"};
      const failed = await f.tools[`${prefix}unichem_execute`].handler(args,{});
      expect(failed).toMatchObject({isError:true,content:expect.any(Array),structuredContent:{success:false,data:{status:400}}});
      expect(await recover(f,failed.structuredContent.data.data.data_access_id,prefix)).toBe(body);
      const big = await f.tools[`${prefix}unichem_execute`].handler({code:"return {text:'α🧬'.repeat(15000)};"},{});
      expect(new TextEncoder().encode(JSON.stringify(big)).length).toBeLessThan(30720);
      expect((await recover(f,big.structuredContent.data_access_id,prefix)).structuredContent.data.text).toBe("α🧬".repeat(15000));
    }
  } finally { f.close(); }
});

it("keeps both individual-source path spellings working through the real API proxy", async () => {
  const f = fixture();
  const native = {response:"Success",sources:[{sourceID:7,name:"chebi"}]};
  const fetcher = vi.fn(async(_url:string)=>Response.json(native));vi.stubGlobal("fetch",fetcher);
  try {
    for (const prefix of ["","mcp_"]) for (const path of ["/sources/7","/sources/7/"]) {
      const result = await f.tools[`${prefix}unichem_execute`].handler({code:`return await api.get('${path}');`},{});
      expect(result.isError,JSON.stringify(result)).not.toBe(true);
      expect(result.structuredContent.data).toEqual(native);
    }
    expect(fetcher.mock.calls).toHaveLength(4);
    for (const call of fetcher.mock.calls) expect(call[0]).toBe("https://www.ebi.ac.uk/unichem/api/v1/sources/7");
  } finally { f.close(); }
});
