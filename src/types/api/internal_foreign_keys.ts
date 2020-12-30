import { PrimitiveBranch, PrimitiveUser, PrimitiveValue } from "../definition/primitives";
import { UserId } from "../user";
import { LocalDateTime } from "js-joda";
import { BranchId, VersionId } from "../temporal";

export type InternalFKPrimitive = PrimitiveBranch | PrimitiveUser;

// Shape should contain properties of the table,
// Use InternalFKPrimitives to denote properties that can be requested further,
// use regular values to denote normal response type
export type InternalFKPrimitiveDefinitions = {
    user: {
        primitive: PrimitiveUser;
        shape: {
            id: UserId,
            ts: LocalDateTime,
            createdBy: PrimitiveUser; // Root user is created by Root to avoid `null` on this field
        }
    },
    branch: {
        primitive: PrimitiveBranch;
        shape: {
            id: BranchId,
            ts: LocalDateTime,
            branchedFrom: PrimitiveBranch; // Root branch is created from master to avoid `null` on this field
            startVersion: VersionId;
            createdBy: PrimitiveUser;
        }
    },
};

declare function checkInternalFKPrimitiveDefs(defs: {
    [P in InternalFKPrimitive["primitive_type"]]: {
        primitive: Extract<InternalFKPrimitive, { primitive_type: P }>,
        shape: {
            id: PrimitiveValue<Extract<InternalFKPrimitive, { primitive_type: P }>>,
            ts: LocalDateTime,
        },
    }
}): void;
declare const internalFKPrimitiveDefs: InternalFKPrimitiveDefinitions;
checkInternalFKPrimitiveDefs(internalFKPrimitiveDefs);

export type InternalFKPrimitiveShape<T extends InternalFKPrimitive> = Extract<InternalFKPrimitiveDefinitions[keyof InternalFKPrimitiveDefinitions], { primitive: T }>["shape"];
