pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import {MD1Types} from '../lib/MD1Types.sol';
import {MD1Storage} from './MD1Storage.sol';

/**
 * @title MD1Getters
 * @author dYdX
 *
 * @notice Simple getter functions.
 */
abstract contract MD1Getters is MD1Storage {

  /**
   * @notice The parameters specifying the function from timestamp to epoch number.
   *
   * @return The parameters struct with `interval` and `offset` fields.
   */
  function getEpochParameters() external view returns (MD1Types.EpochParameters memory) {
    return _EPOCH_PARAMETERS_;
  }

  /**
   * @notice Get the address of the oracle which provides Merkle root updates.
   *
   * @return The address of the oracle.
   */
  function getRewardsOracle()
    external
    returns (IRewardsOracle)
  {
    return _REWARDS_ORACLE_;
  }

  /**
   * @notice Get the active Merkle root and related parameters.
   *
   * @return The active Merkle root, IPFS CID, and epoch.
   */
  function getActiveRoot()
    external
    returns (MD1Types.MerkleRoot memory)
  {
    return _ACTIVE_ROOT_;
  }

  /**
   * @notice Get the proposed Merkle root and related parameters.
   *
   * @return The proposed Merkle root, IPFS CID, and epoch.
   */
  function getProposedRoot()
    external
    returns (MD1Types.MerkleRoot memory)
  {
    return _PROPOSED_ROOT_;
  }

  /**
   * @notice Get the time at which the proposed root may become active.
   *
   * @return The time at which the proposed root may become active, in epoch seconds.
   */
  function getWaitingPeriodEnd()
    external
    returns (uint256)
  {
    return _WAITING_PERIOD_END_;
  }

  /**
   * @notice Get the tokens claimed so far by a given user.
   *
   * @param  user  The address of the user.
   *
   * @return The tokens claimed so far by that user.
   */
  function getClaimed(address user)
    external
    returns (uint256)
  {
    return _CLAIMED_[user];
  }

  /**
   * @notice Get whether root updates are currently paused.
   *
   * @return Boolean `true` if root updates are currently paused, otherwise, `false`.
   */
  function getAreRootUpdatesPaused()
    external
    returns (bool)
  {
    return _ARE_ROOT_UPDATES_PAUSED_;
  }
}
