import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { unichemCatalog } from "../spec/catalog";
import { createUnichemApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    UNICHEM_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createUnichemApiFetch();

    const searchTool = createSearchTool({
        prefix: "unichem",
        catalog: unichemCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "unichem",
        // Verifiable provenance: unichem_execute results carry a _meta.citation.
        source: { id: "unichem", name: "UniChem", url: "https://www.ebi.ac.uk/unichem", license: "CC0 1.0" },
        catalog: unichemCatalog,
        apiFetch,
        doNamespace: env.UNICHEM_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
