import { MigrationsApi } from "./migrations_builder_api";
import { primitiveInt, primitiveString } from "../../definition/primitives";
import { AddTypeMigration, RemoveFieldMigration } from "../../definition/migrations";


declare function noop(val: any): void;
declare function is<Expected = never>(actual: Expected): void;
declare const builder: MigrationsApi<{}, []>;

const migrations = builder
    .addType("t0")
    .addPrimitives("t0", { str: primitiveString(), int: primitiveInt() })

    .addType("t1")
    .addPrimitives("t1", { str: primitiveString(), int: primitiveInt() })
    .addPrimitives("t1", { removeme: primitiveString(), anotherStr: primitiveString() })

    .addType("t2")
    .addPrimitives("t2", { prap: primitiveString() })
    .renameField("t2", "prap", "prop")

    .addReference("t2", "one", "t1")
    .addReference("t2", "many", "t1")

    .removeField("t1", "removeme")
    .removeType("t0")

    .done();

// @ts-expect-error — migrations should be a tuple with concrete length
noop(migrations.length === -1);

// @ts-expect-error — incorrect migration type
is<AddTypeMigration<"t1">>(migrations[0]);
is<AddTypeMigration<"t0">>(migrations[0]);

builder.addType(
    // @ts-expect-error — overrides internal type
    "branch"
);

builder.removeType(
    // @ts-expect-error — can't remove unknown type
    "t0"
);


builder.addType("one").removeType(
    // @ts-expect-error — can't remove unknown type
    "another"
);

builder.addType("t1").addType("t2").addReference("t1", "ref", "t2").removeType(
    // @ts-expect-error — can't remove a type targeted by existing references
    "t2"
);


builder.addPrimitives(
    // @ts-expect-error — unknown type
    "t0",
    {}
);

builder.addType("t")
    .addPrimitives("t", { f: primitiveString() })

    .addPrimitives("t", {
        // @ts-expect-error — property already exists
        f: primitiveString(),
    });


builder.addType("t").addPrimitives("t", {
    // @ts-expect-error — internal property
    id: primitiveString(),
});
builder.addType("t").addPrimitives("t", {
    // @ts-expect-error — internal property
    at: primitiveString(),
});
builder.addType("t").addPrimitives("t", {
    // @ts-expect-error — internal property
    branch: primitiveString(),
});
builder.addType("t").addPrimitives("t", {
    // @ts-expect-error — internal property
    by: primitiveString(),
});
builder.addType("t").addPrimitives("t", {
    // @ts-expect-error — internal property
    ts: primitiveString(),
});


builder.addReference(
    // @ts-expect-error — unknown type
    "t",
    "ref", "t"
);

builder.addType("t1").addType("t2").addReference(
    "t1",
    // @ts-expect-error — overwrites internal property
    "id",
    "t2"
);
builder.addType("t1").addType("t2").addReference(
    "t1",
    // @ts-expect-error — overwrites internal property
    "at",
    "t2"
);
builder.addType("t1").addType("t2").addReference(
    "t1",
    // @ts-expect-error — overwrites internal property
    "branch",
    "t2"
);
builder.addType("t1").addType("t2").addReference(
    "t1",
    // @ts-expect-error — overwrites internal property
    "by",
    "t2"
);
builder.addType("t1").addType("t2").addReference(
    "t1",
    // @ts-expect-error — overwrites internal property
    "ts",
    "t2"
);

builder.addType("t1").addReference("t1", "ref",
    // @ts-expect-error — unknown type
    "unknown"
);

builder.addType("t").addPrimitives("t", { f: primitiveString() })
    .addReference(
        "t",
        // @ts-expect-error — property already exists
        "f",
        "t"
    );

builder.renameField(
    // @ts-expect-error — unknown type
    "t",
    "from", "to"
);

builder.addType("t").renameField("t",
    // @ts-expect-error — property doesn't exists on `t`
    "blah",
    "whop"
);

builder.addType("t").addPrimitives("t", { a: primitiveString(), b: primitiveString() })
    .renameField(
        "t", "a",

        // @ts-expect-error — property `b` already exists
        "b"
    );

builder.removeField(
    // @ts-expect-error — unknown type
    "t",
    "from"
);

builder.addType("t").removeField(
    "t",
    // @ts-expect-error — property doesn't exists on `t`
    "blah"
);



// Test types compute over a number of migrations
const lotsaMigrations = builder
    .addType("t0")
    .addPrimitives("t0", { str: primitiveString(), int: primitiveInt() })
    .renameField("t0", "str", "prop")
    .removeField("t0", "int")

    .addType("t1")
    .addPrimitives("t1", { str: primitiveString(), int: primitiveInt() })
    .renameField("t1", "str", "prop")
    .removeField("t1", "int")

    .addType("t2")
    .addPrimitives("t2", { str: primitiveString(), int: primitiveInt() })
    .renameField("t2", "str", "prop")
    .removeField("t2", "int")

    .addType("t3")
    .addPrimitives("t3", { str: primitiveString(), int: primitiveInt() })
    .renameField("t3", "str", "prop")
    .removeField("t3", "int")

    .addType("t4")
    .addPrimitives("t4", { str: primitiveString(), int: primitiveInt() })
    .renameField("t4", "str", "prop")
    .removeField("t4", "int")

    .addType("t5")
    .addPrimitives("t5", { str: primitiveString(), int: primitiveInt() })
    .renameField("t5", "str", "prop")
    .removeField("t5", "int")

    .addType("t6")
    .addPrimitives("t6", { str: primitiveString(), int: primitiveInt() })
    .renameField("t6", "str", "prop")
    .removeField("t6", "int")

    .addType("t7")
    .addPrimitives("t7", { str: primitiveString(), int: primitiveInt() })
    .renameField("t7", "str", "prop")
    .removeField("t7", "int")

    .addType("t8")
    .addPrimitives("t8", { str: primitiveString(), int: primitiveInt() })
    .renameField("t8", "str", "prop")
    .removeField("t8", "int")

    .addType("t9")
    .addPrimitives("t9", { str: primitiveString(), int: primitiveInt() })
    .renameField("t9", "str", "prop")
    .removeField("t9", "int")

    .addType("t10")
    .addPrimitives("t10", { str: primitiveString(), int: primitiveInt() })
    .renameField("t10", "str", "prop")
    .removeField("t10", "int")

    // TODO: ideally, this should fail typecheck, but handling this used to cause `Type instantiation is excessively deep and possibly infinite`
    //       see limit in `ApplySafe` in `migrations_builder_api.ts`
    .removeType("nonexistent")

    .done();

// @ts-expect-error — checking that unsafe builder still tracks applied migrations
is<RemoveFieldMigration<"t10", "int">>(lotsaMigrations[42]);
is<RemoveFieldMigration<"t10", "int">>(lotsaMigrations[43]);
