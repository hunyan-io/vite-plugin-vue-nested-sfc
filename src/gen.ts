export function genComponentBlockCode(
  virtualFilename: string,
  component: string
) {
  return (
    `import ${component} from '${virtualFilename}/${component}.vue';\n` +
    "export default function(Comp) {\n" +
    "  if (!Comp.components) {\n" +
    "    Comp.components = {};\n" +
    "  }\n" +
    `  Comp.components[${JSON.stringify(component)}] = ${component};\n` +
    "}"
  );
}
