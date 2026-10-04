declare module 'nanomatch' {
  /** Returns the items of `list` that match any of `patterns`. */
  function nanomatch(list: ReadonlyArray<string>, patterns: string | ReadonlyArray<string>): Array<string>;
  export default nanomatch;
}
