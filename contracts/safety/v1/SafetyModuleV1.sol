pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../interfaces/IERC20.sol';
import {SM1Admin} from './impl/SM1Admin.sol';
import {SM1Getters} from './impl/SM1Getters.sol';
import {SM1Operators} from './impl/SM1Operators.sol';
import {SM1Slashing} from './impl/SM1Slashing.sol';
import {SM1Staking} from './impl/SM1Staking.sol';

/**
 * @title SafetyModuleV1
 * @author dYdX
 *
 * @notice Contract for staking tokens, which may be slashed by the permissioned slasher.
 *
 *  NOTE: Most functions will revert if epoch zero has not started.
 */
contract SafetyModuleV1 is
  SM1Slashing,
  SM1Operators,
  SM1Admin,
  SM1Getters
{
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
    address rewardsVault,
    uint256 distributionStart,
    uint256 distributionEnd
  ) SM1Staking(stakedToken, rewardsToken, rewardsVault, distributionStart, distributionEnd) {}

  // ============ External Functions ============

  function initialize(
    uint256 interval,
    uint256 offset,
    uint256 blackoutWindow
  ) external initializer {
    __SM1ExchangeRate_init();
    __SM1Roles_init();
    __SM1EpochSchedule_init(interval, offset, blackoutWindow);
    __SM1Rewards_init();

    // Store the domain separator for EIP-712 signatures.
    uint256 chainId;
    // solium-disable-next-line
    assembly {
      chainId := chainid()
    }
    _DOMAIN_SEPARATOR_ = keccak256(
      abi.encode(
        EIP712_DOMAIN_SCHEMA_HASH,
        keccak256(bytes(EIP712_DOMAIN_NAME)),
        keccak256(bytes(EIP712_DOMAIN_VERSION)),
        chainId,
        address(this)
      )
    );
  }

  // ============ Internal Functions ============

  /**
   * @dev Returns the revision of the implementation contract.
   *
   * @return The revision number.
   */
  function getRevision() internal pure override returns (uint256) {
    return 1;
  }
}
