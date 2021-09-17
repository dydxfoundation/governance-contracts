/**
 * Utilities for parsing environment variables, with types.
 */

import { BigNumber } from 'bignumber.js';
import _ from 'lodash';

import { ConfigError } from '../errors';
import {
  getNetworkName,
} from '../hre';
import {
  BigNumberable,
  NetworkName,
} from '../types';

// A parse function takes the name of an environment variable as an argument, and parses and
// returns that variable from `process.env`.
type ParseFn<T> = (varName: string) => T;

// A schema base maps environment variable names to parse functions that can be
// used to parse those variables.
type SchemaBase = { [varName: string]: ParseFn<unknown> };

interface ParseOptions<T> {
  // If `default` is present, then the environment variable will be optional and will default to
  // the value of `default` when unset. In particular, `default` may be null, in which case the
  // config value will be null when the environment variable is not set.
  default: T;
}

function defaultIsValid(
  options?: ParseOptions<unknown>,
): options is ParseOptions<unknown> {
  if (!options) {
    return false;
  }
  return typeof options.default !== 'undefined';
}

export function parseString(): ParseFn<string>;
export function parseString(options: ParseOptions<string>): ParseFn<string>;
export function parseString(options: ParseOptions<null>): ParseFn<string | null>;
export function parseString(options?: ParseOptions<string | null>): ParseFn<string | null> {
  return (varName: string) => {
    const value = process.env[varName];
    if (!value) {
      if (defaultIsValid(options)) {
        return options.default;
      }
      throw new ConfigError(`Missing required env var '${varName}' (string)`);
    }
    return value;
  };
}

export function parseBoolean(): ParseFn<boolean>;
export function parseBoolean(options: ParseOptions<boolean>): ParseFn<boolean>;
export function parseBoolean(options: ParseOptions<null>): ParseFn<boolean | null>;
export function parseBoolean(options?: ParseOptions<boolean | null>): ParseFn<boolean | null> {
  return (varName: string) => {
    const rawValue = process.env[varName];
    if (!rawValue) {
      if (defaultIsValid(options)) {
        return options.default;
      }
      throw new ConfigError(`Missing required env var '${varName}' (number)`);
    }
    if (rawValue === 'true') {
      return true;
    }
    if (rawValue === 'false') {
      return false;
    }
    throw new ConfigError(`Invalid boolean for env var '${varName}'`);
  };
}

export function parseNumber(): ParseFn<number>;
export function parseNumber(options: ParseOptions<number>): ParseFn<number>;
export function parseNumber(options: ParseOptions<null>): ParseFn<number | null>;
export function parseNumber(options?: ParseOptions<number | null>): ParseFn<number | null> {
  return (varName: string) => {
    const rawValue = process.env[varName];
    if (!rawValue) {
      if (defaultIsValid(options)) {
        return options.default;
      }
      throw new ConfigError(`Missing required env var '${varName}' (number)`);
    }
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      throw new ConfigError(`Invalid number for env var '${varName}'`);
    }
    return value;
  };
}

export function parseInteger(): ParseFn<number>;
export function parseInteger(options: ParseOptions<number>): ParseFn<number>;
export function parseInteger(options: ParseOptions<null>): ParseFn<number | null>;
export function parseInteger(options?: ParseOptions<number | null>): ParseFn<number | null> {
  return (varName: string) => {
    const rawValue = process.env[varName];
    if (!rawValue) {
      if (defaultIsValid(options)) {
        if (options.default !== null && !Number.isInteger(options.default)) {
          throw new ConfigError(`Expected integer default value for env var '${varName}'`);
        }
        return options.default;
      }
      throw new ConfigError(`Missing required env var '${varName}' (integer)`);
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value)) {
      throw new ConfigError(`Invalid integer for env var '${varName}'`);
    }
    return value;
  };
}

export function parseBN(): ParseFn<BigNumber>;
export function parseBN(options: ParseOptions<BigNumberable>): ParseFn<BigNumber>;
export function parseBN(options: ParseOptions<null>): ParseFn<BigNumber | null>;
export function parseBN(options?: ParseOptions<BigNumberable | null>): ParseFn<BigNumber | null> {
  return (varName: string) => {
    const rawValue = process.env[varName];
    if (!rawValue) {
      if (defaultIsValid(options)) {
        return options.default === null ? null : new BigNumber(options.default);
      }
      throw new ConfigError(`Missing required env var '${varName}' (BigNumber)`);
    }
    const value = new BigNumber(rawValue);
    if (value.isNaN()) {
      throw new ConfigError(`Invalid BigNumber for env var '${varName}'`);
    }
    return value;
  };
}

/**
 * Process the schema and parse environment variables.
 *
 * Use type inference to presserve type information including which values may or may not be null.
 */
export function parseSchema<T extends SchemaBase>(
  schema: T,
  { prefix }: { prefix?: string } = {},
): {
  [K in keyof T]: T[K] extends ParseFn<infer U> ? U : never;
} & {
  isMainnet: () => boolean;
  isRopsten: () => boolean;
  isKovan: () => boolean;
  isHardhat: () => boolean;
  isTestnet: () => boolean;
} {
  const config = _.mapValues(schema, (parseFn: ParseFn<T>, varName: string) => {
    const fullVarName = prefix ? `${prefix}_${varName}` : varName;
    return parseFn(fullVarName);
  }) as { [K in keyof T]: T[K] extends ParseFn<infer U> ? U : never };

  // Include helper functions.
  return {
    ...config,
    isMainnet: () => getNetworkName() === NetworkName.mainnet,
    isRopsten: () => getNetworkName() === NetworkName.ropsten,
    isKovan: () => getNetworkName() === NetworkName.kovan,
    isHardhat: () => getNetworkName() === NetworkName.hardhat,
    isTestnet: () => {
      return [NetworkName.ropsten, NetworkName.kovan].includes(getNetworkName());
    },
  };
}
