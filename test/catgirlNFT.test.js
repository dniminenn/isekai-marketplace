const { expect } = require("chai");
const { ethers, upgrades } = require('hardhat');

describe("CatgirlNFT", async function() {
    let catgirlNFT = [];
    let nft;
    let manager;
    let ownerAddress;

    before(async () => {
        const [owner, addr1, addr2] = await ethers.getSigners();
        ownerAddress = owner;
        const factory = await ethers.getContractFactory('CatgirlNFT');
        // Deploy NFT
        nft = await upgrades.deployProxy(factory,{ kind: 'uups' });
        await nft.deployed();

        const PriceOracleFactory = await ethers.getContractFactory('MockPriceOracle');
        const priceOracle = await PriceOracleFactory.deploy();
        await priceOracle.deployed();

        const ManagerFactory = await ethers.getContractFactory('MysteryBoxManager');
        manager = await upgrades.deployProxy(ManagerFactory, ['0xE499B06f48F552fd2c4E4a72269ff83a9B15f2CE', nft.address, priceOracle.address],{ kind: 'uups' });
        await manager.deployed();
        await manager.setCurrentSeason(2);
        await manager.setMysteryBoxPrice(1);
        // Set probabilities
        // await nft.setOptionSettings(0, 200000, [8599, 1000, 300, 100, 1], [0, 1, 2, 3, 4], [[0], [0], [0], [0], [0]]);
        // await nft.setOptionSettings(1, 200000, [8099, 1450, 350, 100, 1], [0, 1, 2, 3, 4], [[0], [0], [0], [0], [0]]);
        await nft.setOptionSettings(0, 20, [8599, 1000, 300, 100, 1], [0, 1, 2, 3, 4], [[0, 1, 2], [0, 1], [0, 1], [0, 1], [0]]);
        await nft.setOptionSettings(1, 20, [8099, 1450, 350, 100, 1], [0, 1, 2, 3, 4], [[0, 1, 2], [0, 1], [0, 1], [0, 1], [0]]);

        // Grant roles
        const minterRole = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
        await nft.connect(ownerAddress).grantRole(minterRole, manager.address);
/*        await addr2.sendTransaction({
            to: owner.address,
            value: ethers.constants.WeiPerEther.mul(10000),
        });*/
    });
    it('should be able to mint NFT', async function () {
        // await manager["requestToOpenBox(address,uint8,uint)"](ownerAddress.address, 25, 1);
        // Test mint
        // await catgirlNFT.connect(owner)["safeMint(address,uint32,uint64)"](addr1.address, 2, 1);

        await manager.connect(ownerAddress)["buyCommonBoxWithBNB(uint8)"](10);
        expect(await nft.balanceOf(ownerAddress.address)).to.equal(10);
        expect(await nft.tokenURI(8)).to.equal('http://api.catgirl.io/nft/catgirls/8');
    });
});
