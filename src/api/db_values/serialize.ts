import { Id } from "../../definition/entity";
import { BranchId, VersionId } from "../../temporal";
import { UserId } from "../../user";
import {
    isNamedBranchId,
    isNamedUserId,
    namedBranchId,
    namedUserId
} from "../named_constants";
import {
    DataPrimitive,
    DataPrimitiveType,
    getPrimitiveGuard,
    PrimitiveTypeValue,
    PrimitiveValue
} from "../../definition/primitives";
import { DateTimeFormatter } from "js-joda";
import { identity } from "../../misc/typeguards";

const serializeIdOfType = (id: string, type: string) => {
    const utf8 = Buffer.from(id, "hex").toString("utf8");
    const [actualType, serializedId] = utf8.split(":");
    if (!actualType || actualType !== type) { throw new Error(`Id type mismatch, expected '${ type }', got '${ actualType }' in id '${ utf8 }'`); }
    if (!serializedId) { throw new Error(`No serialized id in '${ utf8 }'`); }
    return Number(serializedId);
};

export const serializeId = (id: Id<any>): number => serializeIdOfType(id, "id");
export const serializeVersionId = (version: VersionId): number => serializeIdOfType(version, "v");

export const serializeUserId = (userId: UserId): number => isNamedUserId(userId) ? namedUserId(userId) : serializeIdOfType(userId, "u");
export const serializeBranchId = (branchId: BranchId): number => isNamedBranchId(branchId) ? namedBranchId(branchId) : serializeIdOfType(branchId, "b");


export const pgLocalDateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
export const pgLocalDateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd H:m:s");

type SerializedValue = string | number | boolean | Buffer;
const _primitiveSerializers: { [P in DataPrimitiveType]: (val: PrimitiveTypeValue<P>) => SerializedValue } = {
    user: serializeUserId,
    branch: serializeBranchId,
    version: serializeVersionId,

    local_date_time: val => val.format(pgLocalDateTimeFormatter),
    local_date: val => val.format(pgLocalDateFormatter),

    money: identity,
    buffer: identity,
    string: identity,
    float: identity,
    enum: identity,
    bool: identity,
    int: identity,
};
const getSerializer = <T extends DataPrimitive>(p: T): (val: PrimitiveValue<T>) => SerializedValue => _primitiveSerializers[p.primitive_type] as any;
export const serializePrimitive = <T extends DataPrimitive>(primitive: T, val: PrimitiveValue<T> | null): SerializedValue | null => {
    if (val === null) { return null; }

    const guard = getPrimitiveGuard(primitive);
    if (!guard(val)) { throw new Error(`Value doesn't match expected type for primitive ${ JSON.stringify(primitive) }: ${ JSON.stringify(val) }`); }

    return getSerializer(primitive)(val);
};
