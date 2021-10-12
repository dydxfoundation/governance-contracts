// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import { MD1Types } from '../lib/MD1Types.sol';
import { MD1EpochSchedule } from './MD1EpochSchedule.sol';
import { MD1Roles } from './MD1Roles.sol';

/**
 * @title MD1Configuration
 * @author dYdX
 *
 * @notice Functions for modifying the Merkle distributor rewards configuration.
 *
 *  The more sensitive configuration values, which potentially give full control over the contents
 *  of the Merkle tree, may only be updated by the OWNER_ROLE. Other values may be configured by
 *  the CONFIG_UPDATER_ROLE.
 *
 *  Note that these configuration values are made available externally but are not used internally
 *  within this contract, with the exception of the IPFS update period which is used by
 *  the getIpfsEpoch() function.
 */
abstract contract MD1Configuration is
  MD1EpochSchedule,
  MD1Roles
{
  // ============ Constants ============

  uint256 public constant TRADER_SCORE_ALPHA_BASE = 10 ** 18;

  // ============ Events ============

  event RewardsOracleChanged(
    address rewardsOracle
  );

  event IpnsNameUpdated(
    string ipnsName
  );

  event IpfsUpdatePeriodUpdated(
    uint256 ipfsUpdatePeriod
  );

  event RewardsParametersUpdated(
    uint256 marketMakerRewardsAmount,
    uint256 traderRewardsAmount,
    uint256 traderScoreAlpha
  );

  // ============ Initializer ============

  function __MD1Configuration_init(
    address rewardsOracle,
    string calldata ipnsName,
    uint256 ipfsUpdatePeriod,
    uint256 marketMakerRewardsAmount,
    uint256 traderRewardsAmount,
    uint256 traderScoreAlpha
  )
    internal
  {
    _setRewardsOracle(rewardsOracle);
    _setIpnsName(ipnsName);
    _setIpfsUpdatePeriod(ipfsUpdatePeriod);
    _setRewardsParameters(
      marketMakerRewardsAmount,
      traderRewardsAmount,
      traderScoreAlpha
    );
  }

  // ============ External Functions ============

  /**
   * @notice Set the address of the oracle which provides Merkle root updates.
   *
   * @param  rewardsOracle  The new oracle address.
   */
  function setRewardsOracle(
    address rewardsOracle
  )
    external
    onlyRole(OWNER_ROLE)
    nonReentrant
  {
    _setRewardsOracle(rewardsOracle);
  }

  /**
   * @notice Set the IPNS name to which trader and market maker exchange statistics are published.
   *
   * @param  ipnsName  The new IPNS name.
   */
  function setIpnsName(
    string calldata ipnsName
  )
    external
    onlyRole(OWNER_ROLE)
    nonReentrant
  {
    _setIpnsName(ipnsName);
  }

  /**
   * @notice Set the period of time after the epoch end after which the new epoch exchange
   *  statistics should be available on IPFS via the IPNS name.
   *
   *  This can be used as a trigger for “keepers” who are incentivized to call the proposeRoot()
   *  and updateRoot() functions as needed.
   *
   * @param  ipfsUpdatePeriod  The new IPFS update period, in seconds.
   */
  function setIpfsUpdatePeriod(
    uint256 ipfsUpdatePeriod
  )
    external
    onlyRole(CONFIG_UPDATER_ROLE)
    nonReentrant
  {
    _setIpfsUpdatePeriod(ipfsUpdatePeriod);
  }

  /**
   * @notice Set the rewards formula parameters.
   *
   * @param  marketMakerRewardsAmount  Max rewards distributed per epoch as market maker incentives.
   * @param  traderRewardsAmount       Max rewards distributed per epoch as trader incentives.
   * @param  traderScoreAlpha          The alpha parameter between 0 and 1, in units out of 10^18.
   */
  function setRewardsParameters(
    uint256 marketMakerRewardsAmount,
    uint256 traderRewardsAmount,
    uint256 traderScoreAlpha
  )
    external
    onlyRole(CONFIG_UPDATER_ROLE)
    nonReentrant
  {
    _setRewardsParameters(marketMakerRewardsAmount, traderRewardsAmount, traderScoreAlpha);
  }

  /**
   * @notice Set the parameters defining the function from timestamp to epoch number.
   *
   * @param  interval  The length of an epoch, in seconds.
   * @param  offset    The start of epoch zero, in seconds.
   */
  function setEpochParameters(
    uint256 interval,
    uint256 offset
  )
    external
    onlyRole(CONFIG_UPDATER_ROLE)
    nonReentrant
  {
    _setEpochParameters(interval, offset);
  }

  // ============ Internal Functions ============

  function _setRewardsOracle(
    address rewardsOracle
  )
    internal
  {
    _REWARDS_ORACLE_ = IRewardsOracle(rewardsOracle);
    emit RewardsOracleChanged(rewardsOracle);
  }

  function _setIpnsName(
    string calldata ipnsName
  )
    internal
  {
    _IPNS_NAME_ = ipnsName;
    emit IpnsNameUpdated(ipnsName);
  }

  function _setIpfsUpdatePeriod(
    uint256 ipfsUpdatePeriod
  )
    internal
  {
    _IPFS_UPDATE_PERIOD_ = ipfsUpdatePeriod;
    emit IpfsUpdatePeriodUpdated(ipfsUpdatePeriod);
  }

  function _setRewardsParameters(
    uint256 marketMakerRewardsAmount,
    uint256 traderRewardsAmount,
    uint256 traderScoreAlpha
  )
    internal
  {
    require(
      traderScoreAlpha <= TRADER_SCORE_ALPHA_BASE,
      'MD1Configuration: Invalid traderScoreAlpha'
    );

    _MARKET_MAKER_REWARDS_AMOUNT_ = marketMakerRewardsAmount;
    _TRADER_REWARDS_AMOUNT_ = traderRewardsAmount;
    _TRADER_SCORE_ALPHA_ = traderScoreAlpha;

    emit RewardsParametersUpdated(
      marketMakerRewardsAmount,
      traderRewardsAmount,
      traderScoreAlpha
    );
  }
}
