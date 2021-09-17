import {
  DydxGovernor,
  DydxGovernor__factory,
  DydxToken,
  DydxToken__factory,
  Executor,
  Executor__factory,
} from '../../types';
import { ZERO_ADDRESS } from '../constants';
import { getDeployConfig } from '../deploy-config';
import { getHre } from '../hre';
import { log } from '../logging';
import { waitForTx } from '../util';
import { deployExecutor } from './deploy-executor';

export async function deployPhase1({
  startStep = 0,
  dydxTokenAddress,
  governorAddress,
  longTimelockAddress,
  shortTimelockAddress,
  merklePauserTimelockAddress,
}: {
  startStep?: number,
  dydxTokenAddress?: string,
  governorAddress?: string,
  longTimelockAddress?: string,
  shortTimelockAddress?: string,
  merklePauserTimelockAddress?: string,
} = {}) {
  log('Beginning phase 1 deployment\n');
  const deployConfig = getDeployConfig();

  const [deployer] = await getHre().ethers.getSigners();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  // Phase 1 deployed contracts.
  let dydxToken: DydxToken;
  let governor: DydxGovernor;
  let longTimelock: Executor;
  let shortTimelock: Executor;
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
    log('Step 5. Deploy merkle timelock');
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

  if (startStep <= 6) {
    log('Step 6. Authorize timelocks on governance contract');
    await waitForTx(
      await governor.authorizeExecutors(
        [longTimelockAddress, shortTimelockAddress, merklePauserTimelockAddress],
      ),
    );
  }

  if (startStep <= 7) {
    log('Step 7. Add deployer to token transfer allowlist');
    await waitForTx(
      await dydxToken.addToTokenTransferAllowlist(
        [deployerAddress],
      ),
    );
  }

  log('=== PHASE 1 DEPLOYMENT COMPLETE ===\n');
  const contracts = [
    ['DydxToken', dydxTokenAddress],
    ['Governor', governorAddress],
    ['ShortTimelock', shortTimelockAddress],
    ['LongTimelock', longTimelockAddress],
    ['MerkleTimelock', merklePauserTimelockAddress],
    ['Distributor EOA', deployerAddress],
  ];
  contracts.forEach(data => log(`${data[0]} at ${data[1]}`));

  return {
    dydxToken,
    governor,
    shortTimelock,
    longTimelock,
    merklePauserTimelock,
  };
}
