pragma solidity 0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/ICatgirlNFT.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IPancakeRouter02.sol";
import "./libraries/ABDKMath64x64.sol";
import "./PriceOracle.sol";
import "./vrf/VRFConsumerBaseV2Upgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

contract MysteryBoxManager is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    VRFConsumerBaseV2Upgradeable
{
    using ABDKMath64x64 for int128;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    /**
     * @dev Contract roles
     * @dev UPGRADER: Ability to upgrade contract
     * @dev SETTER: update contract state
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    /**
     * @dev current season
     */
    uint32 public currentSeason;
    /**
     * @dev fiat price for mystery box
     */
    uint256 public mysteryBoxFiatPrice;
    /**
     * @dev fund distribution
     */
    int128 developmentPercentage;
    int128 burnPercentage;
    /**
     * @dev tax recipients
     */
    address public farmingAddress;
    address public developmentAddress;
    //@deprecated
    IERC20 public catgirlToken; // 0x79ebc9a2ce02277a4b5b3a768b1c0a4ed75bd936
    ICatgirlNFT public catgirlNFT;
    /**
     * @dev swap address
     */
    IPancakeRouter02 pancakeRouter;
    /**
     * @dev Price oracle address
     */
    IPriceOracle priceOracle;
    address public constant deadAddress =
        0x000000000000000000000000000000000000dEaD;
    uint256 previousSeed;
    IERC20Upgradeable uCatgirlToken;

    /* Chainlink coordinator */
    VRFCoordinatorV2Interface COORDINATOR;

    /* Chainlink config */
    uint64 sSubscriptionId;
    bytes32 sKeyHash;
    uint32 callbackGasLimit;
    uint16 requestConfirmations;
    uint32 numWords;
    address vrfCoordinator;

    // Peding box
    struct PendingBox {
        uint8 numberOfBox;
        uint256 randomNumber;
    }
    struct RequestBuyBoxData {
        address user;
        uint8 numberOfBox;
    }
    mapping(address => PendingBox[]) public pendingBox;
    mapping(uint256 => RequestBuyBoxData) public requestVrf;

    uint8 public maximumNumberOfBox;
    //-------------------------------------------------------------------------
    // EVENTS
    //-------------------------------------------------------------------------

    event RequestVrf(uint256 requestId);
    event FullfillRequestVrf(uint256 requestId);

    function initialize(
        IERC20Upgradeable _catgirlAddress,
        ICatgirlNFT _catgirlNFT,
        IPriceOracle _priceOracle
    ) public initializer {
        __MysteryBoxManager_init_unchained(
            _catgirlAddress,
            _catgirlNFT,
            _priceOracle
        );
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        // callbackGasLimit = 172000;
        // requestConfirmations = 3;
        // numWords = 1;
    }
    
    function __MysteryBoxManager_init_unchained(
        IERC20Upgradeable _catgirlAddress,
        ICatgirlNFT _catgirlNFT,
        IPriceOracle _priceOracle
    ) internal initializer {
        uCatgirlToken = _catgirlAddress;
        catgirlNFT = _catgirlNFT;
        priceOracle = _priceOracle;
        currentSeason = 1;
        mysteryBoxFiatPrice = 10 * 10**18;
        developmentPercentage = ABDKMath64x64.divu(20, 100);
        burnPercentage = ABDKMath64x64.divu(5, 100);
        /**
         * @dev PancakeSwap
         *  Mainnet: 0x10ED43C718714eb63d5aA57B78B54704E256024E
         * Testnet: 0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3
         */
        pancakeRouter = IPancakeRouter02(
            0x10ED43C718714eb63d5aA57B78B54704E256024E
        );
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(SETTER_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    //-------------------------------------------------------------------------
    // VIEWS
    //------------------------------------------------------------------------
    //-------------------------------------------------------------------------
    // SETTERS
    //-------------------------------------------------------------------------
    function setMysteryBoxPrice(uint256 _newPrice)
        external
        onlyRole(SETTER_ROLE)
    {
        require(mysteryBoxFiatPrice != _newPrice, "New price == current price");
        mysteryBoxFiatPrice = _newPrice;
    }

    function setMaximumNumberOfBox(uint8 _newMaxNumberOfBox)
        external
        onlyRole(SETTER_ROLE)
    {
        require(_newMaxNumberOfBox != maximumNumberOfBox, "Must be different to old config");
        maximumNumberOfBox = _newMaxNumberOfBox;
    }

    function setFundDistributionPercentage(uint256 _development, uint256 _burn)
        external
        onlyRole(SETTER_ROLE)
    {
        require(_development + _burn < 100, "Fee cant be more than 100%");
        if (_development == 0) developmentPercentage = 0;
        else developmentPercentage = ABDKMath64x64.divu(_development, 100);
        if (_burn == 0) burnPercentage = 0;
        else burnPercentage = ABDKMath64x64.divu(_burn, 100);
    }

    function setAddress(address _farmingAddress, address _developmentAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        farmingAddress = _farmingAddress;
        developmentAddress = _developmentAddress;
    }

    function setPancakeRouter(IPancakeRouter02 _pancake)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        pancakeRouter = _pancake;
    }

    //@dev need to set this before upgrade
    function setCatgirlTokenAddress(address _catgirlTokenAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        uCatgirlToken = IERC20Upgradeable(_catgirlTokenAddress);
    }

    function setCatgirlNFTAddress(address _catgirlNFTAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        catgirlNFT = ICatgirlNFT(_catgirlNFTAddress);
    }

    function setCurrentSeason(uint32 _season) external onlyRole(SETTER_ROLE) {
        currentSeason = _season;
    }

    function emergencyWithdraw() public onlyRole(DEFAULT_ADMIN_ROLE) {
        uCatgirlToken.safeTransfer(
            msg.sender,
            uCatgirlToken.balanceOf(address(this))
        );
        payable(msg.sender).transfer(address(this).balance);
    }

    /**
     * @dev Manually distribute everyday
     */
    function processDistributionCatgirl()
        public
        onlyRole(SETTER_ROLE)
        nonReentrant
    {
        require(developmentAddress != address(0), "invalid development add");
        require(farmingAddress != address(0), "invalid farming add");
        uint256 tokenBalance = uCatgirlToken.balanceOf(address(this));
        uint256 devAmount;
        uint256 burnAmount;
        if (developmentPercentage > 0)
            devAmount = ABDKMath64x64.mulu(developmentPercentage, tokenBalance);
        if (burnPercentage > 0)
            burnAmount = ABDKMath64x64.mulu(burnPercentage, tokenBalance);
        if (devAmount > 0)
            uCatgirlToken.safeTransfer(developmentAddress, devAmount);
        if (burnAmount > 0) uCatgirlToken.safeTransfer(deadAddress, burnAmount);
        uCatgirlToken.safeTransfer(
            farmingAddress,
            tokenBalance - (devAmount + burnAmount)
        );
    }

    function processDistributionBNB()
        public
        onlyRole(SETTER_ROLE)
        nonReentrant
    {
        require(developmentAddress != address(0), "invalid development add");
        require(farmingAddress != address(0), "invalid farming add");
        uint256 bnbBalance = address(this).balance;
        uint256 devAmount;
        uint256 burnAmount;
        if (developmentPercentage > 0)
            devAmount = ABDKMath64x64.mulu(developmentPercentage, bnbBalance);
        if (burnPercentage > 0)
            burnAmount = ABDKMath64x64.mulu(burnPercentage, bnbBalance);
        if (devAmount > 0) payable(developmentAddress).transfer(devAmount);
        // Calculate the burn ratio based on remaining BNB
        int128 burnRatio = ABDKMath64x64.divu(
            burnAmount,
            bnbBalance - devAmount
        );
        uint256 currentCatgirlBalance = uCatgirlToken.balanceOf(address(this));
        swapBNBForCatgirl(bnbBalance - devAmount);
        // Calculate balance after swap to transfer
        uint256 balanceToTransfer = uCatgirlToken.balanceOf(address(this)) -
            currentCatgirlBalance;
        uint256 burnAmountCatgirl;
        if (burnRatio > 0)
            burnAmountCatgirl = ABDKMath64x64.mulu(
                burnRatio,
                balanceToTransfer
            );
        if (burnAmountCatgirl > 0)
            uCatgirlToken.safeTransfer(deadAddress, burnAmountCatgirl);
        uCatgirlToken.safeTransfer(
            farmingAddress,
            balanceToTransfer - burnAmountCatgirl
        );
    }

    function swapBNBForCatgirl(uint256 amount) private {
        address[] memory path = new address[](2);
        path[0] = pancakeRouter.WETH();
        path[1] = address(uCatgirlToken);
        pancakeRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: amount
        }(0, path, address(this), block.timestamp);
    }

    function pause() external onlyRole(SETTER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(SETTER_ROLE) {
        _unpause();
    }

    //-------------------------------------------------------------------------
    // VIEWS
    //-------------------------------------------------------------------------
    function calculateBNBSalePrice() public view returns (uint256) {
        int128 price = ABDKMath64x64.divu(mysteryBoxFiatPrice, 1e18);
        return ABDKMath64x64.mulu(price, priceOracle.getBNBPerUSD());
    }

    function calculateCatgirlSalePrice() public view returns (uint256) {
        int128 price = ABDKMath64x64.divu(mysteryBoxFiatPrice, 1e18);
        return ABDKMath64x64.mulu(price, priceOracle.getCatgirlPerUSD());
    }

    //-------------------------------------------------------------------------
    // STATE MODIFYING FUNCTIONS
    //-------------------------------------------------------------------------
    function buyCommonBoxWithBNB(uint8 _numberOfBoxes)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        // User must interact directly with contract
        require(tx.origin == msg.sender, "Must call directly from user");
        require(_numberOfBoxes <= maximumNumberOfBox);
        require(
            msg.value >= calculateBNBSalePrice() * _numberOfBoxes,
            "Dont pay enough BNB"
        );

        requestRandomNumber(msg.sender, _numberOfBoxes);
        // @dev 0 is common rate
        // catgirlNFT.openBoxes(
        //     msg.sender,
        //     0,
        //     currentSeason,
        //     _numberOfBoxes,
        //     random()
        // );
    }

    function setConfigVfr(
        uint64 _ssubcriptionId,
        bytes32 _skeyhash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords,
        address _vrfCoordinator
    ) external onlyRole(SETTER_ROLE) {
        sSubscriptionId = _ssubcriptionId;
        sKeyHash = _skeyhash;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        numWords = _numWords;
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        vrfCoordinator = _vrfCoordinator;
    }

    function buyCommonBoxWithCatgirl(uint8 _numberOfBoxes)
        external
        nonReentrant
        whenNotPaused
    {
        // User must interact directly with contract
        require(tx.origin == msg.sender, "Must call directly from user");
        require(getTotalPendingBox(msg.sender) < maximumNumberOfBox);
        uint256 amount = calculateCatgirlSalePrice() * _numberOfBoxes;
        require(
            uCatgirlToken.balanceOf(msg.sender) >= amount,
            "Not enough balance"
        );
        uCatgirlToken.transferFrom(msg.sender, address(this), amount);
        requestRandomNumber(msg.sender, _numberOfBoxes);
        // @dev 1 is common catgirl rate
        // catgirlNFT.openBoxes(
        //     msg.sender,
        //     1,
        //     currentSeason,
        //     _numberOfBoxes,
        //     random()
        // );
    }

    // function claim() external nonReentrant whenNotPaused {
    //     uint256 length = pendingBox[msg.sender].length;
    //     for (uint256 i = length; i > 0; i--) {
    //         catgirlNFT.openBoxes(
    //             msg.sender,
    //             1,
    //             currentSeason,
    //             pendingBox[msg.sender][i - 1].numberOfBox,
    //             pendingBox[msg.sender][i - 1].randomNumber
    //         );
    //     }
    //     delete pendingBox[msg.sender];
    // }

    function claim() external nonReentrant whenNotPaused {
        uint256 length = pendingBox[msg.sender].length;
        uint8[] memory numberOfPendingBoxes = new uint8[](length);
        uint8 totalBox = 0;
        uint[] memory rand = new uint[](length);
        for (uint8 i = 0; i < length; i++) {
            numberOfPendingBoxes[i] = pendingBox[msg.sender][i].numberOfBox;
            rand[i] = pendingBox[msg.sender][i].randomNumber;
            totalBox += pendingBox[msg.sender][i].numberOfBox;
        }
        catgirlNFT.openPendingBoxes(
                msg.sender,
                1,
                currentSeason,
                numberOfPendingBoxes,
                rand,
                totalBox
        );
        delete pendingBox[msg.sender];
    }

    /**
     * Use to call to VRF contract to get a new random value
     *
     * @param _user Address of user who buy nfts
     */
    function requestRandomNumber(address _user, uint8 _numberOfBox)
        internal
        returns (uint256 requestId)
    {
        // Will revert if subscription is not set and funded.
        requestId = COORDINATOR.requestRandomWords(
            sKeyHash,
            sSubscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        // Save request
        requestVrf[requestId] = RequestBuyBoxData({
            user: _user,
            numberOfBox: _numberOfBox
        });
        emit RequestVrf(requestId);
    }

    /**
     * Callback function for VRF contract call when fullfill request
     *
     * @param requestId_ Request ID
     * @param randomWords_ Return data of VRF contract
     */
    function fulfillRandomWords(
        uint256 requestId_,
        uint256[] memory randomWords_
    ) internal override {
        if (msg.sender != vrfCoordinator) {
            revert("Must be vrf");
        }
        uint256 randomValue = (randomWords_[0] % 10000) + 1;
        address user = requestVrf[requestId_].user;
        pendingBox[user].push(
            PendingBox(requestVrf[requestId_].numberOfBox, randomValue)
        );
        emit FullfillRequestVrf(requestId_);
    }

    function getTotalPendingBox(address user) public view returns (uint256) {
        uint256 totalBox = 0;
        for (uint256 i = 0; i < pendingBox[user].length; i++) {
            totalBox = totalBox + pendingBox[user][i].numberOfBox;
        }
        return totalBox;
    }

    function random() internal view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp +
                            block.difficulty +
                            ((
                                uint256(
                                    keccak256(abi.encodePacked(block.coinbase))
                                )
                            ) / (block.timestamp)) +
                            block.gaslimit +
                            ((
                                uint256(keccak256(abi.encodePacked(msg.sender)))
                            ) / (block.timestamp)) +
                            block.number
                    )
                )
            );
    }
}
