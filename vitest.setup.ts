import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * RTL's auto-cleanup relies on detecting a global `afterEach` (Jest-style globals);
 * this project doesn't enable Vitest's `test.globals`, so multi-test files that call
 * `render()` more than once need this explicit unmount between tests, or later tests
 * see leftover DOM from earlier ones in the same file.
 */
afterEach(cleanup);
