import {
  parseBoolean,
  parseInteger,
  parseSchema,
  parseString,
} from './config-util';

const configSchema = {
  DEPLOYMENT_LOGS: parseBoolean({ default: null }),
  FORK_MAINNET: parseBoolean({ default: false }),
  FORK_BLOCK_NUMBER: parseInteger({ default: 15983602 }),
  HARDHAT_SIMULATE_AFFECTED_STAKERS: parseInteger({ default: 3 }),
  OVERRIDE_DEPLOYER_ADDRESS: parseString({ default: null }),
  PROMPT_AUTO_YES: parseBoolean({ default: false }),
  SM_FIX_PROPOSAL_ID: parseInteger({ default: null }),
  SM_COMPENSATION_PROPOSAL_ID: parseInteger({ default: null }),
  SP_FIX_PROPOSAL_ID: parseInteger({ default: null }),
  STAKING_TESTS_CHECK_INVARIANTS: parseBoolean({ default: false }),
  STAKING_TESTS_LOG_BALANCE_UPDATES: parseBoolean({ default: false }),
  TEST_SM_RECOVERY_WITH_PROPOSAL: parseBoolean({ default: true }),
  TEST_SP_FIX_WITH_PROPOSAL: parseBoolean({ default: true }),
  FUND_GRANTS_PROGRAM_PROPOSAL_ID: parseInteger({ default: null }),
  TEST_FUND_GRANTS_PROGRAM_WITH_PROPOSAL: parseBoolean({ default: true }),
  FUND_GRANTS_PROGRAM_v1_5_PROPOSAL_ID: parseInteger({ default: null }),
  TEST_FUND_GRANTS_PROGRAM_v1_5_WITH_PROPOSAL: parseBoolean({ default: true }),
  WIND_DOWN_BORROWING_POOL_PROPOSAL_ID: parseInteger({ default: null }),
  WIND_DOWN_BORROWING_POOL_WITH_PROPOSAL: parseBoolean({ default: true }),
  UPDATE_MERKLE_DISTRIBUTOR_REWARDS_PARAMETERS_PROPOSAL_ID: parseInteger({ default: null }),
  TEST_UPDATE_MERKLE_DISTRIBUTOR_REWARDS_PARAMETERS_WITH_PROPOSAL: parseBoolean({ default: true }),
  WIND_DOWN_SAFETY_MODULE_PROPOSAL_ID: parseInteger({ default: null }),
  TEST_WIND_DOWN_SAFETY_MODULE_WITH_PROPOSAL: parseBoolean({ default: true }),
};

const config = parseSchema(configSchema);
export default config;
