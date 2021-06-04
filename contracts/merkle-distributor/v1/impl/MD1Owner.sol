pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import {MD1EpochSchedule} from './MD1EpochSchedule.sol';
import {MD1Roles} from './MD1Roles.sol';
import {MD1Types} from '../lib/MD1Types.sol';

/**
 * @title MD1Owner
 * @author dYdX
 *
 * @notice Owner-only functions.
 */
abstract contract MD1Owner is MD1EpochSchedule, MD1Roles {

  // ============ Event ============

  event RewardsOracleChanged(address rewardsOracle);

  // ============ External Functions ============

  /**
   * @notice Set the parameters defining the function from timestamp to epoch number.
   *  Note that the epoch number is made available externally but is not used internally.
   *
   * @param  interval  The length of an epoch, in seconds.
   * @param  offset    The start of epoch zero, in seconds.
   */
  function setEpochParameters(uint256 interval, uint256 offset)
    external
    onlyRole(OWNER_ROLE)
    nonReentrant
  {
    _setEpochParameters(interval, offset);
  }

  /**
   * @notice Set the address of the oracle which provides Merkle root updates.
   *
   * @param  rewardsOracle  The new oracle address.
   */
  function setRewardsOracle(address rewardsOracle)
    external
    onlyRole(OWNER_ROLE)
    nonReentrant
  {
    _setRewardsOracle(rewardsOracle);
  }

  // ============ Internal Functions ============

  function _setRewardsOracle(address rewardsOracle)
    internal
  {
    _REWARDS_ORACLE_ = IRewardsOracle(rewardsOracle);
    emit RewardsOracleChanged(rewardsOracle);
  }
}
