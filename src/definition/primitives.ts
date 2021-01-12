import { LocalDate, LocalDateTime } from "js-joda";
import { BranchId, isBranchId, isVersionId, VersionId } from "../temporal";
import { isUserId, UserId } from "../user";
import { isBoolean, isBuffer, isInteger, isLocalDate, isLocalDateTime, isNumber, isString } from "../misc/typeguards";
import { Comparator, compareByReference, toPositionalComparison } from "../misc/comparisons";
import { serializeBranchId, serializeUserId, serializeVersionId } from "../api/db_values/serialize";


// TODO: support default values — this should also mean non-nullable types in all queries
export type DataPrimitive =
      PrimitiveVersion
    | PrimitiveBranch
    | PrimitiveUser
    | PrimitiveBuffer
    | PrimitiveFloat
    | PrimitiveMoney
    | PrimitiveInt
    | PrimitiveString
    | PrimitiveBool
    | PrimitiveLocalDate
    | PrimitiveLocalDateTime
    | PrimitiveEnum<string[]>;

export type DataPrimitiveType = DataPrimitive["primitive_type"];
export type DataPrimitiveOfType<T extends DataPrimitiveType> = Extract<DataPrimitive, DataPrimitiveLike<T>>;
export type DataPrimitiveLike<T extends DataPrimitiveType> = { primitive_type: T };

export type PrimitiveTypeValue<T extends DataPrimitiveType> =
      T extends PrimitiveVersion["primitive_type"] ? VersionId
    : T extends PrimitiveBranch["primitive_type"] ? BranchId
    : T extends PrimitiveUser["primitive_type"] ? UserId
    : T extends PrimitiveBuffer["primitive_type"] ? Buffer
    : T extends PrimitiveFloat["primitive_type"] ? number
    : T extends PrimitiveMoney["primitive_type"] ? number
    : T extends PrimitiveInt["primitive_type"] ? number
    : T extends PrimitiveString["primitive_type"] ? string
    : T extends PrimitiveBool["primitive_type"] ? boolean
    : T extends PrimitiveLocalDate["primitive_type"] ? LocalDate
    : T extends PrimitiveLocalDateTime["primitive_type"] ? LocalDateTime
    : T extends PrimitiveEnum<any>["primitive_type"] ? string
    : never;

export type PrimitiveValue<T extends DataPrimitive> =
      T extends PrimitiveEnum<any> ? T["values"][number]
    : PrimitiveTypeValue<T["primitive_type"]>;

const primitiveTypeKey: keyof DataPrimitive = "primitive_type";
export const isDataPrimitive = (val: unknown): val is DataPrimitive => Boolean(val) && typeof val === "object" && primitiveTypeKey in (val as any) && typeof (val as any)[primitiveTypeKey] === "string";

export interface PrimitiveVersion { primitive_type: "version"; }
export const primitiveVersion = (): PrimitiveVersion => ({ primitive_type: "version" });

export interface PrimitiveBranch { primitive_type: "branch"; }
export const primitiveBranch = (): PrimitiveBranch => ({ primitive_type: "branch" });

export interface PrimitiveUser { primitive_type: "user"; }
export const primitiveUser = (): PrimitiveUser => ({ primitive_type: "user" });

export interface PrimitiveBuffer { primitive_type: "buffer"; }
export const primitiveBuffer = (): PrimitiveBuffer => ({ primitive_type: "buffer" });

export interface PrimitiveFloat { primitive_type: "float"; }
export const primitiveFloat = (): PrimitiveFloat => ({ primitive_type: "float" });

export interface PrimitiveMoney { primitive_type: "money"; }
export const primitiveMoney = (): PrimitiveMoney => ({ primitive_type: "money" });

export interface PrimitiveInt { primitive_type: "int"; }
export const primitiveInt = (): PrimitiveInt => ({ primitive_type: "int" });

export interface PrimitiveString { primitive_type: "string"; }
export const primitiveString = (): PrimitiveString => ({ primitive_type: "string" });

export interface PrimitiveBool { primitive_type: "bool"; }
export const primitiveBool = (): PrimitiveBool => ({ primitive_type: "bool" });

export interface PrimitiveLocalDate { primitive_type: "local_date"; }
export const primitiveLocalDate = (): PrimitiveLocalDate => ({ primitive_type: "local_date" });

export interface PrimitiveLocalDateTime { primitive_type: "local_date_time"; }
export const primitiveLocalDateTime = (): PrimitiveLocalDateTime => ({ primitive_type: "local_date_time" });

export interface PrimitiveEnum<T extends string[]> { primitive_type: "enum"; values: T; name: string; }
export const primitiveEnum = <T extends [] | [string, ...string[]]>(name: string, values: T): PrimitiveEnum<T> => ({ primitive_type: "enum", values, name });


const guards: { [P in DataPrimitiveType]: (val: unknown) => val is PrimitiveTypeValue<P> } = {
    bool: isBoolean,
    branch: isBranchId,
    version: isVersionId,
    user: isUserId,
    buffer: isBuffer,
    enum: isString,
    float: isNumber,
    int: isInteger,
    local_date: isLocalDate,
    local_date_time: isLocalDateTime,
    money: isNumber,
    string: isString,
};

const isEnum = (val: DataPrimitive): val is PrimitiveEnum<string[]> => val.primitive_type === "enum";
export const getPrimitiveGuard = <T extends DataPrimitive>(type: T): ((val: unknown) => val is PrimitiveValue<T>) => {
    const guard = guards[type.primitive_type];
    if (!guard) { throw new Error(`No guard found for primitive type '${ type }'`); }

    if (isEnum(type)) {
        return ((val: unknown) => {
            if (!guard(val) || !isString(val) /* For type narrowing */) { return false; }
            return type.values.indexOf(val) !== -1;
        }) as any;
    }

    return guard as any;
};


const comparators: { [P in DataPrimitiveType]: Comparator<PrimitiveTypeValue<P>> } = {
    bool: compareByReference,
    version: (v1, v2) => compareByReference(serializeVersionId(v1), serializeVersionId(v2)),
    branch: (b1, b2) => compareByReference(serializeBranchId(b1), serializeBranchId(b2)),
    user: (u1, u2) => compareByReference(serializeUserId(u1), serializeUserId(u2)),
    buffer: (b1, b2) => toPositionalComparison(b1.compare(b2)),
    enum: compareByReference,
    float: compareByReference,
    int: compareByReference,
    local_date: (d1, d2) => toPositionalComparison(d1.compareTo(d2)),
    local_date_time: (d1, d2) => toPositionalComparison(d1.compareTo(d2)),
    money: compareByReference,
    string: compareByReference,
};

export const getPrimitiveComparator = <T extends DataPrimitiveType>(type: T): Comparator<PrimitiveTypeValue<T>> => {
    const comparator = comparators[type];
    if (!comparator) { throw new Error(`No comparator found for primitive type '${ type }'`); }
    return comparator as any;
};
