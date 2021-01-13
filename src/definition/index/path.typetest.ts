import { IndexPath, indexPath, IndexPathTarget } from "./path";
import { TestTarget } from "../../api/_test_universe";
import { PrimitiveBool, PrimitiveBranch, PrimitiveInt, PrimitiveLocalDateTime, PrimitiveUser } from "../primitives";
import { IndexTarget } from "./target";


declare function noop(val: any): void;
declare function is<Expected = never>(actual: Expected): void;

is<IndexPath<TestTarget, "id">>(indexPath<TestTarget>().id);
is<IndexPath<TestTarget, PrimitiveInt>>(indexPath<TestTarget>().tgtProp);
is<IndexPath<TestTarget, PrimitiveInt>>(indexPath<TestTarget>().one.refProp);
is<IndexPath<TestTarget, PrimitiveInt>>(indexPath<TestTarget>().one.inverse.tgtProp);

is<IndexPath<TestTarget, PrimitiveBranch>>(indexPath<TestTarget>().one.internalFK);
is<IndexPath<TestTarget, PrimitiveLocalDateTime>>(indexPath<TestTarget>().one.internalFK.ts);
is<IndexPath<TestTarget, PrimitiveUser>>(indexPath<TestTarget>().one.internalFK.branched_from.created_by.created_by);
is<IndexPath<TestTarget, PrimitiveLocalDateTime>>(indexPath<TestTarget>().one.internalFK.branched_from.created_by.created_by.ts);


// @ts-expect-error — don't reference internal id, same can be achieved by making 1 less hop.
noop(indexPath<TestTarget>().one.internalFK.id);

// @ts-expect-error — nonexistent property
noop(indexPath<TestTarget>().asdfdsafsdf);

// @ts-expect-error — nonexistent property
noop(indexPath<TestTarget>().one.asdfdsafsdf);

// @ts-expect-error — to-many traversal not allowed
noop(indexPath<TestTarget>().many.refProp);

declare function target<P extends IndexPath<any, IndexTarget>>(p: P): IndexPathTarget<P>;
is<PrimitiveLocalDateTime>(target(indexPath<TestTarget>().one.internalFK.branched_from.created_by.created_by.ts));
is<"id">(target(indexPath<TestTarget>().one.target.id));

// @ts-expect-error — Expected type mismatch
is<PrimitiveBool>(target(indexPath<TestTarget>().one.refProp));
is<PrimitiveInt>(target(indexPath<TestTarget>().one.refProp));

