import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Signer } from 'ethers';

import { getRole } from '../../src/lib/util';
import { DelegationType, NetworkName, Role } from '../../src/types';
import { DydxToken,
  IStarkPerpetual,
  LiquidityStakingV1,
  MerkleDistributorV1, SafetyModuleV1 } from '../../types';
import { StarkProxyV3__factory } from '../../types/factories/StarkProxyV3__factory';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { StarkProxyV3 } from '../../types/StarkProxyV3';
import {
  TestContext,
  describeContractForNetwork,
  describeContractHardhatRevertBefore,
} from '../helpers/describe-contract';

const DYDX_ADDRESS = '0x92D6C1e31e14520e676a687F0a93788B716BEff5';
const STAKED_DYDX_ADDRESS = '0x65f7BA4Ec257AF7c55fd5854E5f6356bBd0fb8EC';

// Contracts
let dydxToken: DydxToken;
let liquidityStaking: LiquidityStakingV1;
let merkleDistributor: MerkleDistributorV1;
let safetyModule: SafetyModuleV1;
let starkPerpetual: IStarkPerpetual;
let starkProxyV1WithV3Impl: StarkProxyV1;
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
    starkProxyV1WithV3Impl,
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
        const starkProxyV3: StarkProxyV3 = new StarkProxyV3__factory(deployer).attach(starkProxyV1WithV3Impl.address);

        const deployerAddress: string = await deployer.getAddress();
        console.log(`deployer Address: ${deployerAddress}`);

        const ownerRoleHash = getRole(Role.OWNER_ROLE);
        console.log(ownerRoleHash);
        const isOwner: boolean = await starkProxyV3.hasRole(
          ownerRoleHash,
          deployerAddress,
        );
        console.log(isOwner);

        console.log(dydxToken.address);
        console.log(safetyModule.address);

        console.log('delegate dydx');
        await starkProxyV3.delegate(
          DYDX_ADDRESS,
          safetyModule.address,
        );
        console.log('delegate staked dydx');
        await starkProxyV3.delegate(
          STAKED_DYDX_ADDRESS,
          safetyModule.address,
        );
        // console.log('delegateByType');
        // await Promise.all([
        //   starkProxyV3.delegateByType(
        //     DYDX_ADDRESS,
        //     safetyModule.address,
        //     DelegationType.VOTING_POWER,
        //   ),
        //   starkProxyV3.delegateByType(
        //     STAKED_DYDX_ADDRESS,
        //     safetyModule.address,
        //     DelegationType.PROPOSITION_POWER,
        //   ),
        // ]);
      });

      it.skip('OWNER_ROLE can delegateByType for DYDX and staked DYDX token', async () => {
        const starkProxy: StarkProxyV3 = new StarkProxyV3__factory(owner).attach(wintermuteStarkProxy.address);
        const starkProxyBalanceBefore = await starkProxy.getTokenBalance();

        //console.log(starkProxyBalanceBefore);
      });
    });
});
