/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as devNode from "../devNode.js";
import type * as domain_admin from "../domain/admin.js";
import type * as domain_collab from "../domain/collab.js";
import type * as domain_controls from "../domain/controls.js";
import type * as domain_portability from "../domain/portability.js";
import type * as domain_work from "../domain/work.js";
import type * as http from "../http.js";
import type * as lib_core from "../lib/core.js";
import type * as lib_svix from "../lib/svix.js";
import type * as lib_util from "../lib/util.js";
import type * as ops from "../ops.js";
import type * as portabilityNode from "../portabilityNode.js";
import type * as webhooks from "../webhooks.js";
import type * as webhooksNode from "../webhooksNode.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  dev: typeof dev;
  devNode: typeof devNode;
  "domain/admin": typeof domain_admin;
  "domain/collab": typeof domain_collab;
  "domain/controls": typeof domain_controls;
  "domain/portability": typeof domain_portability;
  "domain/work": typeof domain_work;
  http: typeof http;
  "lib/core": typeof lib_core;
  "lib/svix": typeof lib_svix;
  "lib/util": typeof lib_util;
  ops: typeof ops;
  portabilityNode: typeof portabilityNode;
  webhooks: typeof webhooks;
  webhooksNode: typeof webhooksNode;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
