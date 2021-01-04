import { MigrationsApi } from "./migrations_builder_api";
import { PrimitiveString, primitiveString } from "../../definition/primitives";
import { EntityDefInstanceFromMeta } from "./metadata";
import { ApplyMigrations } from "./apply_migrations_api";
import { HasOne } from "../../definition/references";


declare function is<Expected = never>(actual: Expected): void;
declare const builder: MigrationsApi<{}, []>;

const migrations = builder
    .addType("target")
    .addType("reference")

    .addPrimitives("target", { tgtProp: primitiveString() })
    .addReference("target", "ref", "reference")

    .done();

declare const Target: EntityDefInstanceFromMeta<ApplyMigrations<{}, typeof migrations>, "target">;
is<{ tgtProp: PrimitiveString, ref: HasOne<{}> }>(Target);
