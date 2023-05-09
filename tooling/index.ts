import {
  VueLanguagePlugin,
  VueFile,
  getDefaultVueLanguagePlugins,
  replace,
  getLength,
} from "@volar/vue-language-core";
import { capitalize, camelize } from "@vue/shared";

function pascalCase(str: string) {
  return capitalize(camelize(str));
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
        // add .nsfc to prevent other plugins from resolving these files
        files.push(
          ...vueFile.embeddedFiles.map((file) => `${file.fileName}.nsfc`)
        );
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

        const embeddedFileOriginalName = embeddedFile.fileName.replace(
          /\.nsfc$/,
          ""
        );

        const targetFile = vueFile._allEmbeddedFiles.value.find(
          (file) => file.file.fileName === embeddedFileOriginalName
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
            let base: number | undefined = 0;
            // eslint-disable-next-line unicorn/prefer-switch
            if (segment[1] === "template") {
              base = vueFile.sfc.template?.startTagEnd;
            } else if (segment[1] === "script") {
              base = vueFile.sfc.script?.startTagEnd;
            } else if (segment[1] === "scriptSetup") {
              base = vueFile.sfc.scriptSetup?.startTagEnd;
            } else if (segment[1]?.startsWith("style_")) {
              const index = Number(segment[1].slice("style_".length));
              base = vueFile.sfc.styles[index]?.startTagEnd;
            } else if (segment[1]?.startsWith("customBlock_")) {
              const index = Number(segment[1].slice("customBlock_".length));
              base = vueFile.sfc.customBlocks[index]?.startTagEnd;
            }
            if (base !== undefined) {
              newContent.push([
                segment[0],
                componentBlock.name,
                typeof segment[2] === "number"
                  ? segment[2] + base
                  : [segment[2][0] + base, segment[2][1] + base],
                segment[3],
              ]);
            } else {
              newContent.push(segment[0]);
            }
          }
        }
        embeddedFile.content = newContent;
        embeddedFile.parentFileName = `${fileName}.customBlock_component_${blockIndex}.${componentBlock.lang}`;
      } else if (
        /^\.(js|ts|jsx|tsx)$/.test(embeddedFile.fileName.replace(fileName, ""))
      ) {
        const componentBlocks = sfc.customBlocks.filter(
          (b) => b.type === "component" && typeof b.attrs.name === "string"
        );
        if (componentBlocks.length === 0) {
          return;
        }

        // import components
        embeddedFile.content.push(
          ...componentBlocks.map(
            (b) =>
              `\nimport ${pascalCase(
                b.attrs.name as string
              )} from ${JSON.stringify(
                `${fileName}__VLS_NSFC_${b.name.slice(
                  "customBlock_".length
                )}.vue`
              )};`
          )
        );

        // export components
        embeddedFile.content.push(
          `\nexport { ${componentBlocks
            .map((b) => pascalCase(b.attrs.name as string))
            .join(", ")} };\n`
        );

        const codeLength = getLength(embeddedFile.content);

        // register components
        if (sfc.scriptSetup) {
          replace(
            embeddedFile.content,
            new RegExp(
              `const __VLS_internalComponent = \\(await import\\('${ctx.vueCompilerOptions.lib}'\\)\\)\\.defineComponent\\({\nsetup\\(\\) {\nreturn {\n`
            ),
            `const __VLS_internalComponent = (await import('${ctx.vueCompilerOptions.lib}')).defineComponent({\nsetup() {\nreturn {\n`,
            ...componentBlocks.map(
              (b) => `${pascalCase(b.attrs.name as string)},\n`
            )
          );
        } else {
          replace(
            embeddedFile.content,
            "const __VLS_componentsOption = {",
            "const __VLS_componentsOption = {\n",
            ...componentBlocks.map(
              (b) => `${pascalCase(b.attrs.name as string)},\n`
            )
          );
        }

        // mappings have to be shifted because of the added code when replacing
        const lengthShift = getLength(embeddedFile.content) - codeLength;
        embeddedFile.mirrorBehaviorMappings =
          embeddedFile.mirrorBehaviorMappings.map((mapping) => ({
            ...mapping,
            sourceRange: [
              mapping.sourceRange[0] + lengthShift,
              mapping.sourceRange[1] + lengthShift,
            ],
            generatedRange: [
              mapping.generatedRange[0] + lengthShift,
              mapping.generatedRange[1] + lengthShift,
            ],
          }));
      }
    },
  };
};

export = plugin;
