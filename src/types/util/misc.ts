export type Ctor<T> = new (...args: any[]) => T;
export type Defined<T> = T extends undefined ? never : (T extends null ? never : T);
export type Notional<T, Notion extends string> = T & { $$type: Notion };
export type KeysHaving<Check, Obj> = { [P in keyof Obj]: Obj[P] extends Check ? P : never }[keyof Obj];

