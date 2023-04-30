import {
  VueLanguagePlugin,
  VueFile,
  getDefaultVueLanguagePlugins,
  replace,
} from "@volar/vue-language-core";

function pascalCase(str: string) {
  return str
    .replace(/(?:\b|_)[a-z]/g, (c) => c.toUpperCase())
    .replace(/[\W_]+/g, "");
}

const plugin: VueLanguagePlugin = (ctx) => {
  const ts = ctx.modules.typescript;
  const plugins = getDefaultVueLanguagePlugins(ts, ctx.compilerOptions, {
    ...ctx.vueCompilerOptions,
    plugins: [],
  });
  const componentBlockFiles = new Map<string, VueFile>();

  return {
    name: "vite-plugin-vue-nested-sfc",

    version: 1,

    getEmbeddedFileNames(fileName, sfc) {
      const componentBlocks = sfc.customBlocks.filter(
        (b) => b.type === "component"
      );

      const files = [];
      for (const block of componentBlocks) {
        const snapshot = ts.ScriptSnapshot.fromString(block.content);
        const blockIndex = Number(block.name.slice("customBlock_".length));
        const id = `${fileName}__VLS_NSFC_${blockIndex}.vue`;
        let vueFile = componentBlockFiles.get(id);
        if (!vueFile) {
          vueFile = new VueFile(id, snapshot, ts, plugins);
          componentBlockFiles.set(id, vueFile);
        } else {
          vueFile.update(snapshot);
        }
        files.push(...vueFile.embeddedFiles.map((file) => file.fileName));
      }
      return files;
    },

    resolveEmbeddedFile(fileName, sfc, embeddedFile) {
      const match = embeddedFile.fileName.match(/__VLS_NSFC_(\d+)\.vue/);

      if (match) {
        const blockIndex = Number(match[1]);
        const vueFile = componentBlockFiles.get(
          `${fileName}__VLS_NSFC_${blockIndex}.vue`
        );
        if (!vueFile) {
          return;
        }

        const targetFile = vueFile._allEmbeddedFiles.value.find(
          (file) => file.file.fileName === embeddedFile.fileName
        );
        const componentBlock = sfc.customBlocks.find(
          (b) =>
            b.type === "component" && b.name === `customBlock_${blockIndex}`
        );

        if (!targetFile || !componentBlock) {
          return;
        }

        // trigger getter
        // eslint-disable-next-line no-unused-expressions
        componentBlock.content;

        Object.assign(embeddedFile, targetFile.file);
        const newContent: typeof embeddedFile.content = [];
        for (const segment of targetFile.file.content) {
          if (typeof segment === "string") {
            newContent.push(segment);
          } else {
            let base = 0;
            // eslint-disable-next-line unicorn/prefer-switch
            if (segment[1] === "template") {
              base = vueFile.sfc.template!.startTagEnd;
            } else if (segment[1] === "script") {
              base = vueFile.sfc.script!.startTagEnd;
            } else if (segment[1] === "scriptSetup") {
              base = vueFile.sfc.scriptSetup!.startTagEnd;
            } else if (segment[1]?.startsWith("style_")) {
              const index = Number(segment[1].slice("style_".length));
              base = vueFile.sfc.styles[index]!.startTagEnd;
            } else if (segment[1]?.startsWith("customBlock_")) {
              const index = Number(segment[1].slice("customBlock_".length));
              base = vueFile.sfc.customBlocks[index]!.startTagEnd;
            }
            newContent.push([
              segment[0],
              componentBlock.name,
              typeof segment[2] === "number"
                ? segment[2] + base
                : [segment[2][0] + base, segment[2][1] + base],
              segment[3],
            ]);
          }
        }
        embeddedFile.content = newContent;
        embeddedFile.parentFileName = `${fileName}.customBlock_component_${blockIndex}.${componentBlock.lang}`;
      } else if (
        /^\.(js|ts|jsx|tsx)$/.test(embeddedFile.fileName.replace(fileName, ""))
      ) {
        const componentBlocks = sfc.customBlocks.filter(
          (b) =>
            b.type === "component" && typeof (b as any).attrs.name === "string"
        );
        if (componentBlocks.length === 0) {
          return;
        }

        // import components
        embeddedFile.content.push(
          ...componentBlocks.map(
            (b) =>
              `\nimport ${pascalCase(
                (b as any).attrs.name
              )} from ${JSON.stringify(
                `${fileName}__VLS_NSFC_${b.name.slice(
                  "customBlock_".length
                )}.vue`
              )};\n`
          )
        );

        // register components
        if (sfc.scriptSetup) {
          replace(
            embeddedFile.content,
            /setup\(\) {\nreturn {\n/,
            "setup() {",
            "return {",
            ...componentBlocks.map(
              (b) => `${pascalCase((b as any).attrs.name)},\n`
            )
          );
        } else {
          replace(
            embeddedFile.content,
            /const __VLS_componentsOption = {/,
            "const __VLS_componentsOption = {\n",
            ...componentBlocks.map(
              (b) => `${pascalCase((b as any).attrs.name)},\n`
            )
          );
        }
      }
    },
  };
};

export = plugin;
