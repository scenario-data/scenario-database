import { asId, Id } from "../../definition/entity";
import { asBranchId, asVersionId, BranchId, VersionId } from "../../temporal";
import { asUserId, UserId } from "../../user";
import { isNamedBranchSerializedId, isNamedUserSerializedId, namedBranchById, namedUserById } from "../named_constants";
import { DataPrimitive, getPrimitiveGuard, PrimitiveValue } from "../../definition/primitives";
import { LocalDate, LocalDateTime } from "js-joda";
import { nevah } from "../../misc/typeguards";

export const hydrateId = (id: number): Id<any> => asId(String(id));
export const hydrateVersionId = (version: number): VersionId => asVersionId(String(version));
export const hydrateUserId = (userId: number): UserId => isNamedUserSerializedId(userId) ? namedUserById(userId) : asUserId(String(userId));
export const hydrateBranchId = (branchId: number): BranchId => isNamedBranchSerializedId(branchId) ? namedBranchById(branchId) : asBranchId(String(branchId));

const psqlByteaPrefixRe = /^\\x/;
const _hydratePrimitive = (primitive: DataPrimitive, val: any) => {
    switch (primitive.primitive_type) {
        case "user": return hydrateUserId(val);
        case "branch": return hydrateBranchId(val);
        case "version": return hydrateVersionId(val);

        case "local_date_time": return LocalDateTime.parse(val);
        case "local_date": return LocalDate.parse(val);
        case "money": return parseFloat(val); // TODO: ouch, this feels weird to parse money string into a number

        case "buffer": return Buffer.from(val.replace(psqlByteaPrefixRe, ""), "hex");

        case "string": return val;
        case "float": return val;
        case "enum": return val;
        case "bool": return val;
        case "int": return parseInt(val, 10);

         // istanbul ignore next
        default:
            nevah(primitive);
            throw new Error("Unhandled primitive type");
    }
};

export const hydratePrimitive = <T extends DataPrimitive>(primitive: T, val: any): PrimitiveValue<T> | null => {
    if (val === null) { return null; }

    const transformed = _hydratePrimitive(primitive, val);

    const guard = getPrimitiveGuard(primitive);
    if (!guard(transformed)) { throw new Error(`Value doesn't match expected type for primitive ${ JSON.stringify(primitive) }: ${ JSON.stringify(val) }`); }

    return transformed;
};
