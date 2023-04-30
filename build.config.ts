import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["./src/index", { input: "./tooling/index", name: "tooling" }],
  externals: [
    "vite",
    "vue/compiler-sfc",
    "@vue/compiler-sfc",
    "@volar/vue-language-core",
  ],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
});
