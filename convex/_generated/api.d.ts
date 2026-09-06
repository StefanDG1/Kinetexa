/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as ai from "../ai.js";
import type * as aiActions from "../aiActions.js";
import type * as athletes from "../athletes.js";
import type * as billing from "../billing.js";
import type * as billingActions from "../billingActions.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lifecycle from "../lifecycle.js";
import type * as lifecycleActions from "../lifecycleActions.js";
import type * as limits from "../limits.js";
import type * as processing from "../processing.js";
import type * as reprocessing from "../reprocessing.js";
import type * as reprocessingActions from "../reprocessingActions.js";
import type * as sharing from "../sharing.js";
import type * as storage from "../storage.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  ai: typeof ai;
  aiActions: typeof aiActions;
  athletes: typeof athletes;
  billing: typeof billing;
  billingActions: typeof billingActions;
  http: typeof http;
  imports: typeof imports;
  lifecycle: typeof lifecycle;
  lifecycleActions: typeof lifecycleActions;
  limits: typeof limits;
  processing: typeof processing;
  reprocessing: typeof reprocessing;
  reprocessingActions: typeof reprocessingActions;
  sharing: typeof sharing;
  storage: typeof storage;
  workspace: typeof workspace;
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
