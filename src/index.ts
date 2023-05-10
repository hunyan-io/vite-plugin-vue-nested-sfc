import path from "node:path";
import type { PluginOption, ResolvedConfig } from "vite";
import createCache from "./cache";
import { genComponentBlockCode, genExportsCode } from "./gen";
import { parseVueRequest, pascalCase } from "./utils";

export default function vueNestedSFC(): PluginOption {
  let config: ResolvedConfig;
  let cache: ReturnType<typeof createCache>;

  return {
    name: "vite:vue-nested-sfc",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    buildStart() {
      cache = createCache(config);
    },

    resolveId(id, importerFile) {
      if (cache.isNestedComponent(id)) {
        return id;
      }
      if (importerFile && cache.isNestedComponent(importerFile)) {
        let [, importerDir] = importerFile.match(/^(.*)(?:\/[^/]+){2}\.vue$/)!;
        if (!importerDir.startsWith(config.root)) {
          importerDir = config.root + importerDir;
        }
        return path.resolve(importerDir, id);
      }
    },

    load(id) {
      if (!cache.isNestedComponent(id)) {
        return;
      }

      const match = id.match(/^(.*)\/([^/]+)\.vue$/);
      if (!match) {
        return;
      }
      let filename = match[1];
      const component = match[2];

      if (!filename.startsWith(config.root)) {
        filename = config.root + filename;
      }

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

      if (cache.isNestedComponent(id)) {
        return;
      }

      if (!request.query.vue && request.filename.endsWith(".vue")) {
        const exportedComponents = cache
          .getDescriptor(request.filename)
          .customBlocks.filter(
            (block) =>
              block.type === "component" &&
              typeof block.attrs.name === "string" &&
              !!block.attrs.export
          )
          .map((block) => pascalCase(block.attrs.name as string));
        if (exportedComponents.length === 0) {
          return;
        }
        for (const componentName of exportedComponents) {
          cache.registerNestedComponent(request.filename, componentName);
        }
        return {
          code: genExportsCode(request.filename, exportedComponents, code),
          map: null,
        };
      } else if (request.query.type === "component") {
        if (typeof request.query.name !== "string") {
          throw new TypeError("Component blocks require a name attribute.");
        }
        const componentName = pascalCase(request.query.name);
        cache.registerNestedComponent(request.filename, componentName);
        return {
          code: genComponentBlockCode(request.filename, componentName),
          map: { mappings: "" },
        };
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

      const mainModule = server.moduleGraph.getModuleById(file);

      if (
        prevDescriptor.customBlocks.length !==
        nextDescriptor.customBlocks.length
      ) {
        if (mainModule) {
          affectedModules.add(mainModule);
        }
      }

      for (const block of prevDescriptor.customBlocks) {
        if (block.type !== "component") {
          continue;
        }
        if (typeof block.attrs.name !== "string") {
          if (mainModule) {
            affectedModules.add(mainModule);
          }
          continue;
        }
        const name = pascalCase(block.attrs.name);
        const nextBlock = nextDescriptor.customBlocks.find(
          (nextBlock) =>
            nextBlock.type === "component" &&
            typeof nextBlock.attrs.name === "string" &&
            pascalCase(nextBlock.attrs.name) === name
        );
        if (
          !nextBlock ||
          nextBlock.attrs.name !== block.attrs.name ||
          nextBlock.attrs.export !== block.attrs.export
        ) {
          if (mainModule) {
            affectedModules.add(mainModule);
          }
        }
        if (!nextBlock || block.content === nextBlock.content) {
          continue;
        }
        const componentModule =
          server.moduleGraph.getModuleById(`${file}/${name}.vue`) ||
          server.moduleGraph.getModuleById(
            `${file.replace(config.root, "")}/${name}.vue`
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
        if (blockModule) {
          affectedModules.add(blockModule);
        }
        const subModules = [...componentModule.importedModules].filter((m) =>
          m.url.startsWith(componentModule.url)
        );
        for (const subModule of subModules) {
          affectedModules.add(subModule);
        }
      }

      return [...affectedModules];
    },
  };
}
