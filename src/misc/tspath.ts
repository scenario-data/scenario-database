import { memoize } from "lodash";
import { KeyShape } from "./shape";
import { objectKeys } from "./typeguards";
import { KeysHaving } from "./misc";


interface PathAPI {
    toString(): string;
    getChunks(): ReadonlyArray<string>;
}

interface PathContents<From, To> {
    __$$from: From;
    __$$to: To;
}

type Accessor<F, T> = { [P in keyof T]: Path<F, T[P]> };
export type Path<From, To> = Accessor<From, To> & PathAPI & PathContents<From, To>;


class PathApiImpl implements PathAPI {
    constructor(private readonly chunks: ReadonlyArray<string>) { }

    public toString() {
        if (this.chunks.length === 0) { return "self"; }
        return `["${ this.chunks.join(`"]["`) }"]`;
    }

    public getChunks() { return this.chunks; }
}

const apiShape: KeyShape<PathAPI> = {
    getChunks: null,
    toString: null,
};
const apiMethods: ReadonlyArray<string> = objectKeys(apiShape).filter(k => typeof PathApiImpl.prototype[k] === "function");
const isApiMethod = (name: string): name is KeysHaving<Function, PathApiImpl> => apiMethods.indexOf(name) !== -1;

const apiInstance = new PathApiImpl([]);
const nonenumerableConfig = objectKeys(apiInstance)
    .filter(k => Object.propertyIsEnumerable.call(apiInstance, k))
    .reduce((_config, key) => {
        _config[key] = { enumerable: false };
        return _config;
    }, {} as { -readonly [P in keyof PathApiImpl]: { enumerable: false } });


const cache: {[path: string]: Path<any, any>} = {};
function _path<F, T>(basePath: string[]): Path<F, T> {
    const cacheKey = basePath.join("::");
    const cached = cache[cacheKey];

    /* istanbul ignore if *//* not relevant for coverage */
    if (cached) { return cached as any; }

    const instance = new PathApiImpl(basePath);
    const handleCall = memoize((name: string | symbol | number) => {
        if (typeof name === "symbol") { throw new Error("Symbol traversal not supported"); }

        if (typeof name === "string" && isApiMethod(name)) {
            return () => (instance[name] as any).apply(instance, arguments);
        }

        return _path(basePath.concat(name.toString()));
    });

    const p = new Proxy(instance, {
        get(_target: any, name: string | symbol | number) {
            return handleCall(name);
        },
    }) as unknown as Path<F, T>;

    // Paths must not have any enumerable properties,
    // otherwise tools like `Object.keys` might try accessing a key which is always there due to nature of path
    Object.defineProperties(p, nonenumerableConfig);

    return p;
}


const self = _path([]);
export function path<T = never>(): Path<T, T> { return self as any; }
export const isPath = (x: any): x is Path<any, any> => x && typeof x === "object" && x instanceof PathApiImpl;

export const pathsEqual = <F, T>(p1: Path<F, T>, p2: Path<F, T>): boolean => p1.toString() === p2.toString();
