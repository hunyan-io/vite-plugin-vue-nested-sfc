import type { PluginOption, ResolvedConfig } from "vite";
import createCache from "./cache";
import { genComponentBlockCode, genExportsCode } from "./gen";
import { parseVueRequest, pascalCase } from "./utils";

export default function vueNestedSFC(): PluginOption {
  const prefix = "virtual:vue-nested-sfc";

  let config: ResolvedConfig;
  let cache: ReturnType<typeof createCache>;

  return {
    name: "vue-nested-sfc",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    buildStart() {
      cache = createCache(config);
    },

    resolveId(id) {
      if (id.startsWith(prefix)) {
        return id;
      }
    },

    load(id) {
      if (!id.startsWith(prefix)) {
        return;
      }

      const [, filename, component] =
        id.slice(prefix.length).match(/^(.*)\/([^/]+)\.vue$/) || [];

      const descriptor = cache.getDescriptor(filename);

      const componentBlock = descriptor.customBlocks.find(
        (block) =>
          block.type === "component" &&
          typeof block.attrs.name === "string" &&
          pascalCase(block.attrs.name) === component
      );

      if (!componentBlock) {
        return "";
      }

      return { code: componentBlock.content, map: componentBlock.map as any };
    },

    transform(code, id) {
      const request = parseVueRequest(id);

      if (request.filename.startsWith(prefix)) {
        return;
      }

      if (!request.query.vue && request.filename.endsWith(".vue")) {
        return genExportsCode(
          prefix + request.filename,
          cache.getNestedComponents(id),
          code
        );
      } else if (request.query.type === "component" && request.query.name) {
        return genComponentBlockCode(
          prefix + request.filename,
          pascalCase(request.query.name)
        );
      }
    },

    async handleHotUpdate({ modules, read, file, server }) {
      if (!cache.hasFile(file)) {
        return modules;
      }

      const affectedModules = new Set(
        modules.filter((m) => !/type=component/.test(m.url))
      );

      const prevDescriptor = cache.getDescriptor(file);
      cache.updateFileCache(file, await read());
      const nextDescriptor = cache.getDescriptor(file);

      if (
        prevDescriptor.customBlocks.length !==
        nextDescriptor.customBlocks.length
      ) {
        const mainModule = server.moduleGraph.getModuleById(file);
        if (mainModule) {
          affectedModules.add(mainModule);
        }
      }

      for (const block of prevDescriptor.customBlocks) {
        if (block.type !== "component") {
          continue;
        }
        if (typeof block.attrs.name !== "string") {
          continue;
        }
        const name = pascalCase(block.attrs.name);
        const nextBlock = nextDescriptor.customBlocks.find(
          (nextBlock) =>
            nextBlock.type === "component" &&
            typeof nextBlock.attrs.name === "string" &&
            pascalCase(nextBlock.attrs.name) === name
        );
        if (!nextBlock || nextBlock.attrs.name !== block.attrs.name) {
          const mainModule = server.moduleGraph.getModuleById(file);
          if (mainModule) {
            affectedModules.add(mainModule);
          }
        }
        if (!nextBlock || block.content === nextBlock.content) {
          continue;
        }
        const componentModule = server.moduleGraph.getModuleById(
          `${prefix}${file}/${name}.vue`
        );
        if (!componentModule) {
          continue;
        }
        affectedModules.add(componentModule);
        const blockModule = [...componentModule.importers].find(
          (m) =>
            m.url.includes("type=component") &&
            m.url.includes(`name=${nextBlock.attrs.name}`)
        );
        if (!blockModule) {
          continue;
        }
        affectedModules.add(blockModule);
      }

      return [...affectedModules];
    },
  };
}
