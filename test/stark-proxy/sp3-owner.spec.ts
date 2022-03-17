import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Signer } from 'ethers';
import { getRole } from '../../src/lib/util';

import { NetworkName, Role } from '../../src/types';
import { DydxToken, IStarkPerpetual, LiquidityStakingV1, MerkleDistributorV1, SafetyModuleV1, StarkProxyV2, StarkProxyV2__factory } from '../../types';
import { StarkProxyV3__factory } from '../../types/factories/StarkProxyV3__factory';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { StarkProxyV3 } from '../../types/StarkProxyV3';
import { TestContext, describeContractForNetwork, describeContract, describeContractHardhatRevertBefore } from '../helpers/describe-contract';

// Contracts
let dydxToken: DydxToken;
let liquidityStaking: LiquidityStakingV1;
let merkleDistributor: MerkleDistributorV1;
let safetyModule: SafetyModuleV1;
let starkPerpetual: IStarkPerpetual;
let starkProxyV3Impl: StarkProxyV3;
let wintermuteStarkProxy: StarkProxyV1;

let deployer: SignerWithAddress;
let owner: Signer;

function init(ctx: TestContext): void {
  ({
    dydxToken,
    liquidityStaking,
    merkleDistributor,
    safetyModule,
    starkPerpetual,
    starkProxyV3Impl,
    deployer,
  } = ctx);
}

describeContractHardhatRevertBefore('SP3Owner', init, (ctx: TestContext) => {
  describeContractForNetwork(
    'SP3Owner Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    false,
    () => {
      it('OWNER_ROLE can delegate DYDX and staked DYDX token', async () => {
        console.log(starkProxyV3Impl.address);
        //const attachedProxyV3: StarkProxyV3 = new StarkProxyV3__factory(deployer).attach(starkProxyV3Impl.address);

        const deployerAddress: string = await deployer.getAddress();
        console.log(`deployer Address: ${deployerAddress}`);

        const ownerRoleHash = getRole(Role.OWNER_ROLE);
        console.log(ownerRoleHash);
        const isOwner: boolean = await starkProxyV3Impl.hasRole(
          ownerRoleHash,
          deployerAddress,
        );
        console.log(isOwner);

        await starkProxyV3Impl.delegate(
          dydxToken.address,
          safetyModule.address,
        );
      });

      it.skip('OWNER_ROLE can delegateByType for DYDX and staked DYDX token', async () => {
        const starkProxy: StarkProxyV3 = new StarkProxyV3__factory(owner).attach(wintermuteStarkProxy.address);
        const starkProxyBalanceBefore = await starkProxy.getTokenBalance();

        //console.log(starkProxyBalanceBefore);
      });
    });
});
