import {
    DataPrimitive,
    PrimitiveBranch,
    PrimitiveLocalDateTime,
    PrimitiveUser, PrimitiveValue,
    PrimitiveVersion
} from "../../definition/primitives";
import { objectKeys } from "../../misc/typeguards";

export type InternalFKPrimitive = PrimitiveBranch | PrimitiveUser;
export type InternalFKRef<T extends InternalFKPrimitive> = { ref: T };

const _internalFkPrimitiveTypes: { [P in InternalFKPrimitive["primitive_type"]]: null } = {
    branch: null,
    user: null,
};
const internalFkPrimitiveTypes = objectKeys(_internalFkPrimitiveTypes);
export const isInternalFKPrimitive = (primitive: DataPrimitive): primitive is InternalFKPrimitive => internalFkPrimitiveTypes.includes(primitive.primitive_type as any);

export type InternalFKPrimitiveDefinitions = {
    user: {
        primitive: PrimitiveUser;
        shape: {
            id: PrimitiveUser,
            ts: PrimitiveLocalDateTime,
            created_by: InternalFKRef<PrimitiveUser>; // Root user is created by Root to avoid `null` on this field
        }
    },
    branch: {
        primitive: PrimitiveBranch;
        shape: {
            id: PrimitiveBranch,
            ts: PrimitiveLocalDateTime,
            branched_from: InternalFKRef<PrimitiveBranch>; // Root branch is created from master to avoid `null` on this field
            start_version: PrimitiveVersion;
            created_by: InternalFKRef<PrimitiveUser>;
        }
    },
};

export type InternalFKPrimitiveShape<T extends InternalFKPrimitive> = Extract<InternalFKPrimitiveDefinitions[keyof InternalFKPrimitiveDefinitions], { primitive: T }>["shape"];
export type InternalFKPrimitiveResultShape<T extends InternalFKPrimitive> = {
    [P in keyof InternalFKPrimitiveShape<T>]:
          InternalFKPrimitiveShape<T>[P] extends InternalFKRef<infer Target> ? Target
        : InternalFKPrimitiveShape<T>[P] extends DataPrimitive ? PrimitiveValue<InternalFKPrimitiveShape<T>[P]>
        : never
};
