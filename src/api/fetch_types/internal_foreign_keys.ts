import {
    DataPrimitive,
    PrimitiveBranch,
    PrimitiveLocalDateTime,
    PrimitiveUser, PrimitiveValue,
    PrimitiveVersion
} from "../../definition/primitives";

export type InternalFKPrimitive = PrimitiveBranch | PrimitiveUser;
export type InternalFKRef<T extends InternalFKPrimitive> = { ref: T };

export type InternalFKPrimitiveDefinitions = {
    user: {
        primitive: PrimitiveUser;
        shape: {
            id: PrimitiveUser,
            ts: PrimitiveLocalDateTime,
            createdBy: InternalFKRef<PrimitiveUser>; // Root user is created by Root to avoid `null` on this field
        }
    },
    branch: {
        primitive: PrimitiveBranch;
        shape: {
            id: PrimitiveBranch,
            ts: PrimitiveLocalDateTime,
            branchedFrom: InternalFKRef<PrimitiveBranch>; // Root branch is created from master to avoid `null` on this field
            startVersion: PrimitiveVersion;
            createdBy: InternalFKRef<PrimitiveUser>;
        }
    },
};

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
checkInternalFKPrimitiveDefs(internalFKPrimitiveDefs);

export type InternalFKPrimitiveShape<T extends InternalFKPrimitive> = Extract<InternalFKPrimitiveDefinitions[keyof InternalFKPrimitiveDefinitions], { primitive: T }>["shape"];
export type InternalFKPrimitiveResultShape<T extends InternalFKPrimitive> = {
    [P in keyof InternalFKPrimitiveShape<T>]:
          InternalFKPrimitiveShape<T>[P] extends InternalFKRef<infer Target> ? Target
        : InternalFKPrimitiveShape<T>[P] extends DataPrimitive ? PrimitiveValue<InternalFKPrimitiveShape<T>[P]>
        : never
};
