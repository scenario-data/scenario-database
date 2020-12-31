import { Path, path } from "./tspath";

declare function noop(val: any): void;
declare function is<Expected = never>(actual: Expected): void;

export interface PathTestShape {
    num: number;
    str: string;
    bool: boolean;
    obj: {
        num: number
        str: string;
    };
    arr: { val: number }[];
    dict: {
        [prop: string]: {
            val: number;
        };
    };
    self: PathTestShape;
}


is<Path<PathTestShape, number>>(path<PathTestShape>().num);
is<Path<PathTestShape, number>>(path<PathTestShape>().self.num);
is<Path<PathTestShape, boolean>>(path<PathTestShape>().bool);
is<Path<PathTestShape, string>>(path<PathTestShape>().str);
is<Path<PathTestShape, PathTestShape>>(path<PathTestShape>());
is<Path<PathTestShape, PathTestShape>>(path<PathTestShape>().self.self.self);
is<Path<PathTestShape, number>>(path<PathTestShape>().obj.num);
is<Path<PathTestShape, string>>(path<PathTestShape>().obj.str);
is<Path<PathTestShape, number>>(path<PathTestShape>().dict.whatever!.val);

// @ts-expect-error
noop(path<Shape>().nonexistent);

// @ts-expect-error
noop(path<Shape>().obj.nonexistent);

// @ts-expect-error
noop(path<Shape>().self.self.self.self.obj.nonexistent);
