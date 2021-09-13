// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import { MD1Types } from '../lib/MD1Types.sol';
import { MD1Storage } from './MD1Storage.sol';

/**
 * @title MD1Getters
 * @author dYdX
 *
 * @notice Simple getter functions.
 */
abstract contract MD1Getters is
  MD1Storage
{
  /**
   * @notice Get the address of the oracle which provides Merkle root updates.
   *
   * @return The address of the oracle.
   */
  function getRewardsOracle()
    external
    view
    returns (IRewardsOracle)
  {
    return _REWARDS_ORACLE_;
  }

  /**
   * @notice Get the IPNS name to which trader and market maker exchange statistics are published.
   *
   * @return The IPNS name.
   */
  function getIpnsName()
    external
    view
    returns (string memory)
  {
    return _IPNS_NAME_;
  }

  /**
   * @notice Get the period of time after the epoch end after which the new epoch exchange
   *  statistics should be available on IPFS via the IPNS name.
   *
   * @return The IPFS update period, in seconds.
   */
  function getIpfsUpdatePeriod()
    external
    view
    returns (uint256)
  {
    return _IPFS_UPDATE_PERIOD_;
  }

  /**
   * @notice Get the rewards formula parameters.
   *
   * @return Max rewards distributed per epoch as market maker incentives.
   * @return Max rewards distributed per epoch as trader incentives.
   * @return The alpha parameter between 0 and 1, in units out of 10^18.
   */
  function getRewardsParameters()
    external
    view
    returns (uint256, uint256, uint256)
  {
    return (
      _MARKET_MAKER_REWARDS_AMOUNT_,
      _TRADER_REWARDS_AMOUNT_,
      _TRADER_SCORE_ALPHA_
    );
  }

  /**
   * @notice Get the parameters specifying the function from timestamp to epoch number.
   *
   * @return The parameters struct with `interval` and `offset` fields.
   */
  function getEpochParameters()
    external
    view
    returns (MD1Types.EpochParameters memory)
  {
    return _EPOCH_PARAMETERS_;
  }

  /**
   * @notice Get the active Merkle root and associated parameters.
   *
   * @return  merkleRoot  The active Merkle root.
   * @return  epoch       The epoch number corresponding to this Merkle tree.
   * @return  ipfsCid     An IPFS CID pointing to the Merkle tree data.
   */
  function getActiveRoot()
    external
    view
    returns (bytes32 merkleRoot, uint256 epoch, bytes memory ipfsCid)
  {
    merkleRoot = _ACTIVE_ROOT_.merkleRoot;
    epoch = _ACTIVE_ROOT_.epoch;
    ipfsCid = _ACTIVE_ROOT_.ipfsCid;
  }

  /**
   * @notice Get the proposed Merkle root and associated parameters.
   *
   * @return  merkleRoot  The active Merkle root.
   * @return  epoch       The epoch number corresponding to this Merkle tree.
   * @return  ipfsCid     An IPFS CID pointing to the Merkle tree data.
   */
  function getProposedRoot()
    external
    view
    returns (bytes32 merkleRoot, uint256 epoch, bytes memory ipfsCid)
  {
    merkleRoot = _PROPOSED_ROOT_.merkleRoot;
    epoch = _PROPOSED_ROOT_.epoch;
    ipfsCid = _PROPOSED_ROOT_.ipfsCid;
  }

  /**
   * @notice Get the time at which the proposed root may become active.
   *
   * @return The time at which the proposed root may become active, in epoch seconds.
   */
  function getWaitingPeriodEnd()
    external
    view
    returns (uint256)
  {
    return _WAITING_PERIOD_END_;
  }

  /**
   * @notice Check whether root updates are currently paused.
   *
   * @return Boolean `true` if root updates are currently paused, otherwise, `false`.
   */
  function getAreRootUpdatesPaused()
    external
    view
    returns (bool)
  {
    return _ARE_ROOT_UPDATES_PAUSED_;
  }

  /**
   * @notice Get the tokens claimed so far by a given user.
   *
   * @param  user  The address of the user.
   *
   * @return The tokens claimed so far by that user.
   */
  function getClaimed(
    address user
  )
    external
    view
    returns (uint256)
  {
    return _CLAIMED_[user];
  }

  /**
   * @notice Check whether the user opted into allowing anyone to trigger a claim on their behalf.
   *
   * @param  user  The address of the user.
   *
   * @return Boolean `true` if any address may trigger claims for the user, otherwise `false`.
   */
  function getAlwaysAllowClaimsFor(
    address user
  )
    external
    view
    returns (bool)
  {
    return _ALWAYS_ALLOW_CLAIMS_FOR_[user];
  }
}
