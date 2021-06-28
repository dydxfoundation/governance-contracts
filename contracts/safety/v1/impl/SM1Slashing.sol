pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {SM1Staking} from './SM1Staking.sol';

/**
 * @title SM1Slashing
 * @author dYdX
 *
 * @notice Provides the slashing function for removing funds from the contract.
 */
abstract contract SM1Slashing is SM1Staking {
  using SafeMath for uint256;

  // ============ Constants ============


  // ============ Events ============

  event Slashed(uint256 amount, address recipient);

  // ============ External Functions ============

  /**
   * @notice Slash staked token balances, up to some limit, and withdraw those funds.
   *
   * @param  maxAmount  The maximum underlying token to slash.
   * @param  recipient  The address to receive the slashed tokens.
   */
  function slash(
    uint256 maxAmount,
    address recipient
  )
    external
    override
    onlyRole(SLASHER_ROLE)
    nonReentrant
  {
    // TODO: Check that no slash has occurred in the last x days.
    require(_slashOccurredAtBlockNumber == 0, 'Cannot slash more than once');

    // Store the block number in which slashing occurred.
    _slashOccurredAtBlockNumber = block.number;

    // Calculate the percentage and token amount to be slashed (max of 30%).
    uint256 totalSupply = totalSupply();
    uint256 slashNumerator = maxAmount.mul(SLASH_DENOMINATOR).div(totalSupply);
    slashNumerator = Math.min(slashNumerator, MAX_SLASH_NUMERATOR);
    uint256 slashAmount = slashNumerator.mul(totalSupply).div(SLASH_DENOMINATOR);

    // Update stored conversion rate. TODO

    // Transfer the slashed token.
    STAKED_TOKEN.safeTransfer(recipient, slashAmount);

    emit Slashed(slashAmount, recipient);
  }
}
