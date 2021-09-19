import {
  parseBoolean,
  parseInteger,
  parseSchema,
} from './config-util';

const configSchema = {
  FORK_MAINNET: parseBoolean({ default: false }),
  HARDHAT_SIMULATE_AFFECTED_STAKERS: parseInteger({ default: 3 }),
  HARDHAT_VERBOSE_LOGGING: parseBoolean({ default: false }),
  PROMPT_AUTO_YES: parseBoolean({ default: false }),
  STAKING_TESTS_CHECK_INVARIANTS: parseBoolean({ default: false }),
  STAKING_TESTS_LOG_BALANCE_UPDATES: parseBoolean({ default: false }),
};

const config = parseSchema(configSchema);
export default config;
