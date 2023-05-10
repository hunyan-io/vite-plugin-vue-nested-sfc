import fs from "node:fs";
import type { SFCDescriptor } from "vue/compiler-sfc";
import { type ResolvedConfig } from "vite";
import { resolveCompiler } from "./compiler";

export default function createCache(config: ResolvedConfig) {
  const descriptorCache = new Map<string, SFCDescriptor>();
  const nestedComponentNames = new Set<string>();
  const compiler = resolveCompiler(config.root);

  return {
    getDescriptor(filename: string) {
      if (!descriptorCache.has(filename)) {
        const { descriptor, errors } = compiler.parse(
          fs.readFileSync(filename, "utf8").toString(),
          {
            filename,
            sourceMap:
              config.command === "build" ? !!config.build.sourcemap : true,
            sourceRoot: config.root,
          }
        );
        if (errors.length > 0) {
          throw errors[0];
        }
        descriptorCache.set(filename, descriptor);
      }
      return descriptorCache.get(filename)!;
    },
    updateFileCache(filename: string, code: string) {
      const { descriptor, errors } = compiler.parse(code, { filename });
      if (errors.length > 0) {
        throw errors[0];
      }
      descriptorCache.set(filename, descriptor);
    },
    hasFile(filename: string) {
      return descriptorCache.has(filename);
    },
    registerNestedComponent(filename: string, component: string) {
      if (filename.startsWith(config.root)) {
        filename = filename.slice(config.root.length);
      }
      nestedComponentNames.add(`${filename}/${component}.vue`);
    },
    isNestedComponent(filename: string) {
      if (filename.startsWith(config.root)) {
        filename = filename.slice(config.root.length);
      }
      return nestedComponentNames.has(filename);
    },
  };
}
