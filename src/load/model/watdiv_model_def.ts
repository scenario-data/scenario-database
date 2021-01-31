import { isWatdivNamespace, parseWatdivModel } from "../parser/watdiv_parser";
import { readFileSync } from "fs";
import { join } from "path";

export const watdivModel = parseWatdivModel(readFileSync(join(__dirname, "watdiv_model"), "utf8"));

const builtinNamespaceAlias = "ck";
const _builtinNamespace = watdivModel.filter(isWatdivNamespace).find(ns => ns.name === builtinNamespaceAlias);
if (!_builtinNamespace) { throw new Error(`Built-in namespace not found. Searching for alias: '${ builtinNamespaceAlias }'`); }
export const builtinNamespace = _builtinNamespace;
