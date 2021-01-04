import { LocalDate, LocalDateTime } from "js-joda";
import { BranchId, VersionId } from "../temporal";
import { UserId } from "../user";


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
export type DataPrimitiveOfType<T extends DataPrimitiveType> = Extract<DataPrimitive, { primitive_type: T }>;

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
      T extends PrimitiveEnum<any> ? keyof T["values"]
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
export const primitiveEnum = <T extends string[]>(name: string, values: T): PrimitiveEnum<T> => ({ primitive_type: "enum", values, name });
