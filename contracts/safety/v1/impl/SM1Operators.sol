pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {SM1Staking} from './SM1Staking.sol';

/**
 * @title SM1Operators
 * @author dYdX
 *
 * @notice Actions which may be called by authorized operators, nominated by the contract owner.
 *
 *  There are three types of operators. These should be smart contracts, which can be used to
 *  provide additional functionality to users:
 *
 *  STAKE_OPERATOR_ROLE:
 *
 *    This operator is allowed to request withdrawals and withdraw funds on behalf of stakers. This
 *    role could be used by a smart contract to provide a staking interface with additional
 *    features, for example, optional lock-up periods that pay out additional rewards (from a
 *    separate rewards pool).
 *
 *  CLAIM_OPERATOR_ROLE:
 *
 *    This operator is allowed to claim rewards on behalf of stakers. This role could be used by a
 *    smart contract to provide an interface for claiming rewards from multiple incentive programs
 *    at once.
 */
abstract contract SM1Operators is SM1Staking {
  using SafeMath for uint256;

  // ============ Events ============

  event OperatorStakedFor(address indexed staker, uint256 amount, address operator);

  event OperatorWithdrawalRequestedFor(address indexed staker, uint256 amount, address operator);

  event OperatorWithdrewStakeFor(
    address indexed staker,
    address recipient,
    uint256 amount,
    address operator
  );

  event OperatorClaimedRewardsFor(
    address indexed staker,
    address recipient,
    uint256 claimedRewards,
    address operator
  );

  // ============ External Functions ============

  /**
   * @notice Request a withdrawal on behalf of a staker.
   *
   *  Reverts if we are currently in the blackout window.
   *
   * @param  staker  The staker whose stake to request a withdrawal for.
   * @param  amount  The amount to move from the active to the inactive balance.
   */
  function requestWithdrawalFor(address staker, uint256 amount)
    external
    onlyRole(STAKE_OPERATOR_ROLE)
    nonReentrant
  {
    _requestWithdrawal(staker, amount);
    emit OperatorWithdrawalRequestedFor(staker, amount, msg.sender);
  }

  /**
   * @notice Withdraw a staker's stake, and send to the specified recipient.
   *
   * @param  staker     The staker whose stake to withdraw.
   * @param  recipient  The address that should receive the funds.
   * @param  amount     The amount to withdraw from the staker's inactive balance.
   */
  function withdrawStakeFor(
    address staker,
    address recipient,
    uint256 amount
  ) external onlyRole(STAKE_OPERATOR_ROLE) nonReentrant {
    _withdrawStake(staker, recipient, amount);
    emit OperatorWithdrewStakeFor(staker, recipient, amount, msg.sender);
  }

  /**
   * @notice Claim rewards on behalf of a staker, and send them to the specified recipient.
   *
   * @param  staker     The staker whose rewards to claim.
   * @param  recipient  The address that should receive the funds.
   *
   * @return The number of rewards tokens claimed.
   */
  function claimRewardsFor(address staker, address recipient)
    external
    onlyRole(CLAIM_OPERATOR_ROLE)
    nonReentrant
    returns (uint256)
  {
    uint256 rewards = _settleAndClaimRewards(staker, recipient); // Emits an event internally.
    emit OperatorClaimedRewardsFor(staker, recipient, rewards, msg.sender);
    return rewards;
  }
}
