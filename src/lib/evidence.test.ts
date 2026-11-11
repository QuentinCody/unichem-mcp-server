/// <reference types="node" />
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { readUnichem, requestUnichem } from "./evidence";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

it("retains source update metadata and hashes the exact UTF-8 bytes", async () => {
  const raw = '{ "response":"Success", "sources":[{"sourceID":31,"name":"bindingdb","srcLastUpdated":"2026-02-23 10:51:58","description":"α"}], "totalSources":"1" }';
  const result = await readUnichem(new Response(raw, { headers: { "content-type": "application/json" } }), Date.now() + 1000);
  expect(result.data).toEqual(JSON.parse(raw));
  expect(result.sha256).toBe(createHash("sha256").update(raw).digest("hex"));
});
it.each([400, 404, 429, 500])("preserves HTTP %s and full native diagnostics", async status => {
  await expect(readUnichem(new Response("private diagnostic", { status }), Date.now() + 1000)).rejects.toMatchObject({ message: `UniChem HTTP ${status}`, status, data:"private diagnostic" });
});
it.each([
  { response: new Response("<html>error</html>"), message: "Expected UniChem JSON" },
  { response: new Response("{", { headers: { "content-type": "application/json" } }), message: "Invalid UniChem JSON" },
  { response: json(null), message: "Invalid UniChem data envelope" },
  { response: json({ response: "Error", message: "private diagnostic" }), message: "UniChem reported an unsuccessful response" },
])("rejects invalid success responses: $message", async ({ response, message }) => {
  await expect(readUnichem(response, Date.now() + 1000)).rejects.toMatchObject({ message, status: 502 });
});
it("rejects oversized bytes and cancels the body", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("α".repeat(3 * 1024 * 1024))); }, cancel });
  await expect(readUnichem(new Response(body, { headers: { "content-type": "application/json" } }), Date.now() + 1000)).rejects.toMatchObject({status:413});
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("ends a stalled body at the deadline and cancels its stream", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const result = readUnichem(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }), Date.now() + 25);
  const assertion = expect(result).rejects.toMatchObject({ status: 504, message: "UniChem response read timed out" });
  await vi.advanceTimersByTimeAsync(25);
  await assertion;
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("does not wait forever for cancellation after a body deadline", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const result = readUnichem(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }), Date.now() + 25);
  const assertion = expect(result).rejects.toMatchObject({ status: 504, message: "UniChem response read timed out" });
  await vi.advanceTimersByTimeAsync(25);
  await assertion;
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("does not let a stalled cancellation obscure the upstream HTTP error", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const response = new Response(new ReadableStream({ cancel }), { status: 404 });
  vi.useFakeTimers();
  const result = expect(readUnichem(response, Date.now() + 1000)).rejects.toMatchObject({ status: 404, message: "UniChem HTTP 404", data:{http_status:404,body_unavailable:true} });
  await vi.advanceTimersByTimeAsync(1000); await result;
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("rejects an expired request before networking", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(requestUnichem("/sources/", undefined, undefined, Date.now() - 1)).rejects.toMatchObject({ status: 504 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("preserves read-only POST payload and the source endpoint", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ compounds: [] })); vi.stubGlobal("fetch", fetcher);
  const body = { type: "sourceID", compound: "000012", sourceID: 31 };
  await requestUnichem("/compounds", body, undefined, Date.now() + 26000);
  expect(fetcher).toHaveBeenCalledWith("https://www.ebi.ac.uk/unichem/api/v1/compounds", expect.objectContaining({ method: "POST", body: JSON.stringify(body), signal: expect.any(AbortSignal) }));
});
it("retains retries for a transient EBI HTTP failure", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("temporary", { status: 503 })).mockResolvedValueOnce(json({ sources: [] }));
  vi.stubGlobal("fetch", fetcher);
  const result = requestUnichem("/sources/", undefined, undefined, Date.now() + 26000);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await result).data).toEqual({ sources: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("retains HTTP 200 Not found as semantic failure with full native context", async () => {
  const raw = '{"response":"Not found","sources":[]}';
  await expect(readUnichem(new Response(raw,{headers:{"content-type":"application/json"}}),Date.now()+1000))
    .rejects.toMatchObject({status:502,data:{http_status:200,response:raw}});
});
