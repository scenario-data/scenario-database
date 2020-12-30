import { Any } from "ts-toolbelt";

import { NoExtraProperties } from "./no_extra_properties";
import { Notional } from "./misc";

type ExampleNotionalType = Notional<string, "marker">;
const asExampleNotional = (val: string): ExampleNotionalType => val as any;

type Shape = {
    prop: number;
    notional?: ExampleNotionalType;
    ref?: Shape;
};
declare function test<T extends Shape>(x: Any.Cast<T, NoExtraProperties<Shape, T>>): void;

// @ts-expect-error — Required properties not present
test({});

test({ prop: 1 }); // Required property present
test({ prop: 1, ref: { prop: 2 }}); // Required properties present

test({ prop: 1, notional: asExampleNotional("blah") }); // Notional property is allowed

test({
    prop: 1,

    // @ts-expect-error — Unnecessary property
    unnecessary: 2,
});

test({
    prop: 1,
    ref: {
        prop: 2,
        ref: {
            prop: 3,
            ref: {
                prop: 4,

                // @ts-expect-error — Nested unnecessary property
                unnecessary: 5,
            },
        },
    },
});
