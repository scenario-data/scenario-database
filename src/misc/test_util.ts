export function expectToFail<T>(
    fn: () => Promise<any>,
    onFailure: (err: any) => T | Promise<T>
): Promise<T> {
    return fn().then(
        // istanbul ignore next
        () => Promise.reject(new Error("Expected to fail")),
        onFailure
    );
}
