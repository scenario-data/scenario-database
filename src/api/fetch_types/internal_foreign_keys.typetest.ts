import { InternalFKPrimitive, InternalFKPrimitiveDefinitions, InternalFKRef } from "./internal_foreign_keys";
import { DataPrimitive, PrimitiveLocalDateTime } from "../../definition/primitives";

declare function checkInternalFKPrimitiveDefs(defs: {
    [P in InternalFKPrimitive["primitive_type"]]: {
        primitive: Extract<InternalFKPrimitive, { primitive_type: P }>,
        shape: {
            id: Extract<InternalFKPrimitive, { primitive_type: P }>,
            ts: PrimitiveLocalDateTime,
            [prop: string]: DataPrimitive | InternalFKRef<InternalFKPrimitive>,
        },
    }
}): void;
declare const internalFKPrimitiveDefs: InternalFKPrimitiveDefinitions;
checkInternalFKPrimitiveDefs(internalFKPrimitiveDefs); // Check that definition matches the expected shape
