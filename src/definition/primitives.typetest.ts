import { Boolean, Test } from "ts-toolbelt";
import { DataPrimitive, PrimitiveTypeValue, PrimitiveValue } from "./primitives";

type CheckEveryPrimitiveTypeValue<P extends DataPrimitive> = P extends P ? [PrimitiveTypeValue<P["primitive_type"]>] extends [never] ? Boolean.False : Boolean.True : never;
declare const everyPrimitiveHasTypeValue: CheckEveryPrimitiveTypeValue<DataPrimitive>;
Test.checks([everyPrimitiveHasTypeValue]);

type CheckEveryPrimitiveValue<P extends DataPrimitive> = P extends P ? [PrimitiveValue<P>] extends [never] ? Boolean.False : Boolean.True : never;
declare const everyPrimitiveHasValue: CheckEveryPrimitiveValue<DataPrimitive>;
Test.checks([everyPrimitiveHasValue]);
