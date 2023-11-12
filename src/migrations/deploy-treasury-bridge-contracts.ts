import {
    TreasuryBridge__factory,
    TreasuryBridge,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { COMMUNITY_TREASURY_VESTER_BURN_ADDRESS, REWARDS_TREASURY_VESTER_BURN_ADDRESS } from '../lib/constants';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';

export async function deployTreasuryBridgeContracts({
  startStep = 0,
  wrappedDydxTokenAddress,
  rewardsTreasuryVesterAddress,
  communityTreasuryVesterAddress,
  rewardsTreasuryBridgeAddress,
  communityTreasuryBridgeAddress,
}: {
  startStep?: number,
  wrappedDydxTokenAddress: string,
  rewardsTreasuryVesterAddress: string,
  communityTreasuryVesterAddress: string,

  rewardsTreasuryBridgeAddress?: string,
  communityTreasuryBridgeAddress?: string,
}) {
  log('Beginning treasury bridge contracts deployment\n');
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let rewardsTreasuryBridge: TreasuryBridge;
  if (startStep <= 1) {
    log('Step 1. Deploy rewards treasury bridge contract.');
    rewardsTreasuryBridge = await new TreasuryBridge__factory(deployer).deploy(
      rewardsTreasuryVesterAddress,
      wrappedDydxTokenAddress,
      REWARDS_TREASURY_VESTER_BURN_ADDRESS,
    );
    await waitForTx(rewardsTreasuryBridge.deployTransaction);
    log('\n=== NEW REWARDS TREASURY BRIDGE DEPLOYMENT COMPLETE ===\n');
  } else if (!rewardsTreasuryBridgeAddress) {
    throw new Error('Expected parameter rewardsTreasuryBridgeAddress to be specified.');
  } else {
    rewardsTreasuryBridge = new TreasuryBridge__factory(deployer).attach(rewardsTreasuryBridgeAddress);
  }

  let communityTreasuryBridge: TreasuryBridge;
  if (startStep <= 2) {
    log('Step 2. Deploy community treasury bridge contract.');
    communityTreasuryBridge = await new TreasuryBridge__factory(deployer).deploy(
      communityTreasuryVesterAddress,
      wrappedDydxTokenAddress,
      COMMUNITY_TREASURY_VESTER_BURN_ADDRESS,
    );
    await waitForTx(communityTreasuryBridge.deployTransaction);
    log('\n=== NEW COMMUNITY TREASURY BRIDGE DEPLOYMENT COMPLETE ===\n');
  } else if (!communityTreasuryBridgeAddress) {
    throw new Error('Expected parameter communityTreasuryBridgeAddress to be specified.');
  } else {
    communityTreasuryBridge = new TreasuryBridge__factory(deployer).attach(communityTreasuryBridgeAddress);
  }

  return {
    rewardsTreasuryBridge,
    communityTreasuryBridge,
  };
}
