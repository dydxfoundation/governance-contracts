import {
  DydxGovernor,
  DydxGovernor__factory,
  DydxToken,
  DydxToken__factory,
  Executor,
  Executor__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { ZERO_ADDRESS } from '../lib/constants';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { deployExecutor } from './helpers/deploy-executor';
import { transferWithPrompt } from './helpers/transfer-tokens';

export async function deployPhase1({
  startStep = 0,
  dydxTokenAddress,
  governorAddress,
  longTimelockAddress,
  shortTimelockAddress,
  starkwarePriorityAddress,
  merklePauserTimelockAddress,
}: {
  startStep?: number,
  dydxTokenAddress?: string,
  governorAddress?: string,
  longTimelockAddress?: string,
  shortTimelockAddress?: string,
  starkwarePriorityAddress?: string,
  merklePauserTimelockAddress?: string,
} = {}) {
  log('Beginning phase 1 deployment\n');
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  // Phase 1 deployed contracts.
  let dydxToken: DydxToken;
  let governor: DydxGovernor;
  let longTimelock: Executor;
  let shortTimelock: Executor;
  let starkwarePriorityTimelock: Executor;
  let merklePauserTimelock: Executor;

  if (startStep <= 1) {
    log('Step 1. Deploy DYDX token');
    dydxToken = await new DydxToken__factory(deployer).deploy(
      deployerAddress,
      deployConfig.TRANSFERS_RESTRICTED_BEFORE,
      deployConfig.TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN,
      deployConfig.MINTING_RESTRICTED_BEFORE,
      deployConfig.MINT_MAX_PERCENT,
    );
    await waitForTx(dydxToken.deployTransaction);
    dydxTokenAddress = dydxToken.address;
  } else {
    if (!dydxTokenAddress) {
      throw new Error('Expected parameter dydxTokenAddress to be specified.');
    }
    dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  }

  if (startStep <= 2) {
    log('Step 2. Deploy governor');
    governor = await new DydxGovernor__factory(deployer).deploy(
      // Phase 1 does not include the incentives contracts, including the safety module, so we
      // can't deploy the governance strategy yet.
      ZERO_ADDRESS,
      deployConfig.VOTING_DELAY_BLOCKS,
      deployerAddress,
    );
    await waitForTx(governor.deployTransaction);
    governorAddress = governor.address;
  } else {
    if (!governorAddress) {
      throw new Error('Expected parameter governorAddress to be specified.');
    }
    governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  }

  if (startStep <= 3) {
    log('Step 3. Deploy long timelock');
    longTimelock = await deployExecutor(
      deployer,
      governorAddress,
      deployConfig.LONG_TIMELOCK_CONFIG,
    );
    longTimelockAddress = longTimelock.address;
  } else {
    if (!longTimelockAddress) {
      throw new Error('Expected parameter longTimelockAddress to be specified.');
    }
    longTimelock = new Executor__factory(deployer).attach(longTimelockAddress);
  }

  if (startStep <= 4) {
    log('Step 4. Deploy short timelock');
    shortTimelock = await deployExecutor(
      deployer,
      governorAddress,
      deployConfig.SHORT_TIMELOCK_CONFIG,
    );
    shortTimelockAddress = shortTimelock.address;
  } else {
    if (!shortTimelockAddress) {
      throw new Error('Expected parameter shortTimelockAddress to be specified.');
    }
    shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);
  }

  if (startStep <= 5) {
    log('Step 5. Deploy starkware priority timelock');
    starkwarePriorityTimelock = await deployExecutor(
      deployer,
      governorAddress,
      deployConfig.STARKWARE_TIMELOCK_CONFIG,
    );
    starkwarePriorityAddress = starkwarePriorityTimelock.address;
  } else {
    if (!starkwarePriorityAddress) {
      throw new Error('Expected parameter starkwarePriorityAddress to be specified.');
    }
    starkwarePriorityTimelock = new Executor__factory(deployer).attach(starkwarePriorityAddress);
  }

  if (startStep <= 6) {
    log('Step 6. Deploy merkle timelock');
    merklePauserTimelock = await deployExecutor(
      deployer,
      governorAddress,
      deployConfig.MERKLE_PAUSER_TIMELOCK_CONFIG,
    );
    merklePauserTimelockAddress = merklePauserTimelock.address;
  } else {
    if (!merklePauserTimelockAddress) {
      throw new Error('Expected parameter merklePauserTimelockAddress to be specified.');
    }
    merklePauserTimelock = new Executor__factory(deployer).attach(merklePauserTimelockAddress);
  }

  if (startStep <= 7) {
    log('Step 7. Authorize timelocks on governance contract');
    await waitForTx(
      await governor.authorizeExecutors(
        [longTimelockAddress, shortTimelockAddress, starkwarePriorityAddress, merklePauserTimelockAddress],
      ),
    );
  }

  if (startStep <= 8) {
    log('Step 8. Add deployer to token transfer allowlist');
    await waitForTx(
      await dydxToken.addToTokenTransferAllowlist(
        [deployerAddress],
      ),
    );
  }

  if (startStep <= 9) {
    log('Step 9. Add test addresses to token transfer allowlist');
    await waitForTx(
      await dydxToken.addToTokenTransferAllowlist(
        deployConfig.TOKEN_TEST_ADDRESSES,
      ),
    );
  }

  if (startStep <= 10) {
    log('Step 10. Send test tokens.');

    const testAllocations = [
      deployConfig.TOKEN_ALLOCATIONS.TEST_TOKENS_1,
      deployConfig.TOKEN_ALLOCATIONS.TEST_TOKENS_2,
      deployConfig.TOKEN_ALLOCATIONS.TEST_TOKENS_3,
      deployConfig.TOKEN_ALLOCATIONS.TEST_TOKENS_4,
    ];
    for (const allocation of testAllocations) {
      await transferWithPrompt(
        dydxToken,
        allocation.ADDRESS,
        allocation.AMOUNT,
      );
    }
  }

  log('\n=== PHASE 1 DEPLOYMENT COMPLETE ===\n');
  const contracts = [
    ['DydxToken', dydxTokenAddress],
    ['Governor', governorAddress],
    ['ShortTimelock', shortTimelockAddress],
    ['LongTimelock', longTimelockAddress],
    ['starkwarePriorityTimelock', starkwarePriorityAddress],
    ['MerkleTimelock', merklePauserTimelockAddress],
    ['Distributor EOA', deployerAddress],
  ];
  contracts.forEach(data => log(`${data[0]} at ${data[1]}`));

  return {
    dydxToken,
    governor,
    shortTimelock,
    longTimelock,
    starkwarePriorityTimelock,
    merklePauserTimelock,
  };
}
