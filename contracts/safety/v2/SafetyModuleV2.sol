// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeERC20 } from '../../dependencies/open-zeppelin/SafeERC20.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { SM1Admin } from '../v1_1/impl/SM1Admin.sol';
import { SM1Getters } from '../v1_1/impl/SM1Getters.sol';
import { SM1Operators } from '../v1_1/impl/SM1Operators.sol';
import { SM1Slashing } from '../v1_1/impl/SM1Slashing.sol';
import { SM1Staking } from '../v1_1/impl/SM1Staking.sol';

/**
 * @title SafetyModuleV2
 * @author dYdX
 *
 * @notice Contract for staking tokens, which may be slashed by the permissioned slasher.
 *
 *  NOTE: Most functions will revert if epoch zero has not started.
 */
contract SafetyModuleV2 is
  SM1Slashing,
  SM1Operators,
  SM1Admin,
  SM1Getters
{
  using SafeERC20 for IERC20;

  // ============ Constants ============

  string public constant EIP712_DOMAIN_NAME = 'dYdX Safety Module';

  string public constant EIP712_DOMAIN_VERSION = '1';

  bytes32 public constant EIP712_DOMAIN_SCHEMA_HASH = keccak256(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  );

  // ============ Constructor ============

  constructor(
    IERC20 stakedToken,
    IERC20 rewardsToken,
    address rewardsTreasury,
    uint256 distributionStart,
    uint256 distributionEnd
  )
    SM1Staking(stakedToken, rewardsToken, rewardsTreasury, distributionStart, distributionEnd)
  {}

  // ============ External Functions ============

  /**
   * @notice Initializer for v2, intended to fix the deployment bug that affected v1.
   *
   *  Responsible for the following:
   *
   *    1. Funds recovery and staker compensation:
   *        - Transfer all Safety Module DYDX to the recovery contract.
   *        - Transfer compensation amount from the rewards treasury to the recovery contract.
   *
   *    2. Storage recovery and cleanup:
   *        - Set the _EXCHANGE_RATE_ to EXCHANGE_RATE_BASE.
   *        - Clean up invalid storage values at slots 115 and 125.
   *
   * @param  recoveryContract            The address of the contract which will distribute
   *                                     recovered funds to stakers.
   * @param  recoveryCompensationAmount  Amount to transfer out of the rewards treasury, for staker
   *                                     compensation, on top of the return of staked funds.
   */
  function initialize(
    address recoveryContract,
    uint256 recoveryCompensationAmount
  )
    external
    initializer
  {
    // Funds recovery and staker compensation.
    uint256 balance = STAKED_TOKEN.balanceOf(address(this));
    STAKED_TOKEN.safeTransfer(recoveryContract, balance);
    REWARDS_TOKEN.safeTransferFrom(REWARDS_TREASURY, recoveryContract, recoveryCompensationAmount);

    // Storage recovery and cleanup.
    __SM1ExchangeRate_init();
    // solhint-disable-next-line no-inline-assembly
    assembly {
      sstore(115, 0)
      sstore(125, 0)
    }
  }

  // ============ Internal Functions ============

  /**
   * @dev Returns the revision of the implementation contract.
   *
   * @return The revision number.
   */
  function getRevision()
    internal
    pure
    override
    returns (uint256)
  {
    return 2;
  }
}
