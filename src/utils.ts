export function pascalCase(str: string) {
  return str
    .replace(/(?:\b|_)[a-z]/g, (c) => c.toUpperCase())
    .replace(/[\W_]+/g, "");
}
