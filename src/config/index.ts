import {
  parseBoolean,
  parseInteger,
  parseSchema,
} from './config-util';

const configSchema = {
  DEPLOYMENT_LOGS: parseBoolean({ default: null }),
  FORK_MAINNET: parseBoolean({ default: false }),
  FORK_BLOCK_NUMBER: parseInteger({ default: 13256000 }),
  HARDHAT_SIMULATE_AFFECTED_STAKERS: parseInteger({ default: 3 }),
  PROMPT_AUTO_YES: parseBoolean({ default: false }),
  STAKING_TESTS_CHECK_INVARIANTS: parseBoolean({ default: false }),
  STAKING_TESTS_LOG_BALANCE_UPDATES: parseBoolean({ default: false }),
  TEST_SM_RECOVERY_WITH_PROPOSAL: parseBoolean({ default: true }),
};

const config = parseSchema(configSchema);
export default config;
