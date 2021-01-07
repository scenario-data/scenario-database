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

// tslint:disable-next-line:no-unnecessary-callback-wrapper — preserve types
export const serializeId = (id: Id<any>): number => Number(id);

// tslint:disable-next-line:no-unnecessary-callback-wrapper — preserve types
export const serializeVersionId = (version: VersionId): number => Number(version);

export const serializeUserId = (userId: UserId): number => isNamedUserId(userId) ? namedUserId(userId) : Number(userId);
export const serializeBranchId = (branchId: BranchId): number => isNamedBranchId(branchId) ? namedBranchId(branchId) : Number(branchId);


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
