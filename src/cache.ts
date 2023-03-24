import fs from "node:fs";
import type { SFCDescriptor } from "vue/compiler-sfc";
import { type ResolvedConfig } from "vite";
import { CompilerSfc, resolveCompiler } from "./compiler";
import { pascalCase } from "./utils";

export default function createCache(config: ResolvedConfig) {
  const descriptorCache: Map<string, SFCDescriptor> = new Map();
  const compiler: CompilerSfc = resolveCompiler(config.root);

  return {
    getDescriptor(filename: string) {
      if (!descriptorCache.has(filename)) {
        const { descriptor, errors } = compiler.parse(
          fs.readFileSync(filename, "utf8").toString(),
          { filename }
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
    getNestedComponents(filename: string) {
      return this.getDescriptor(filename)
        .customBlocks.filter(
          (block) =>
            block.type === "component" && typeof block.attrs.name === "string"
        )
        .map((block) => pascalCase(block.attrs.name as string));
    },
    hasFile(filename: string) {
      return descriptorCache.has(filename);
    },
  };
}
