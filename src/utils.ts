import {
  parseVueRequest as _parseVueRequest,
  VueQuery,
} from "@vitejs/plugin-vue";

export function pascalCase(str: string) {
  return str
    .replace(/(?:\b|_)[a-z]/g, (c) => c.toUpperCase())
    .replace(/[\W_]+/g, "");
}

export function parseVueRequest(id: string) {
  return _parseVueRequest(id) as {
    filename: string;
    query: Omit<VueQuery, "type"> & {
      name?: string;
      type: VueQuery["type"] | "component";
    };
  };
}
