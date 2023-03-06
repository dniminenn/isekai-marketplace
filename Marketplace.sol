// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./exchange/Exchange.sol";

contract CatGirlExchange is
    Initializable,
    Exchange,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    string public constant name = "Catgirl Exchange";
    string public constant version = "1.0";

    /**
     * @dev Contract roles
     * @dev UPGRADER: Ability to upgrade contract
     * @dev SETTER: update contract config: maker fee, taker fee
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    function initialize() public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(SETTER_ROLE, msg.sender);
        MAKER_RELAYER_FEE = 250;
        TAKER_RELAYER_FEE = 0;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function setMakerFee(uint256 makerFee) public onlyRole(SETTER_ROLE) {
        MAKER_RELAYER_FEE = makerFee;
    }

    function setTakerFee(uint256 takerFee) public onlyRole(SETTER_ROLE) {
        TAKER_RELAYER_FEE = takerFee;
    }
}
