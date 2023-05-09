import {
  parseVueRequest as _parseVueRequest,
  VueQuery,
} from "@vitejs/plugin-vue";
import { capitalize, camelize } from "@vue/shared";

export function pascalCase(str: string) {
  return capitalize(camelize(str));
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
