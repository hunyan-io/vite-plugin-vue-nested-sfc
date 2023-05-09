export function genComponentBlockCode(filename: string, component: string) {
  return (
    `import ${component} from '${filename}/${component}.vue';\n` +
    "export default function(Comp) {\n" +
    "  if (!Comp.components) {\n" +
    "    Comp.components = {};\n" +
    "  }\n" +
    `  Comp.components[${JSON.stringify(component)}] = ${component};\n` +
    "}"
  );
}

export function genExportsCode(
  filename: string,
  components: string[],
  mainCode: string
) {
  const codes = [mainCode, "\n"];
  for (const component of components) {
    codes.push(
      "export { default as ",
      component,
      " } from '",
      filename,
      "/",
      component,
      ".vue';\n"
    );
  }
  return codes.join("");
}
