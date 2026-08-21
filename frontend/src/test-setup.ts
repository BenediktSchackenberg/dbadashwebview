// Shared vitest setup for component tests.
//
// React only treats `act(...)` as supported when this flag is set, otherwise
// every component test logs "The current testing environment is not configured
// to support act(...)" and state updates are not flushed deterministically.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
