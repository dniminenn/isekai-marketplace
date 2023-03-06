const { ethers } = require("hardhat");
const { expect } = require("chai");
const ERC721JSON = require("../../frontend/artifacts/contracts/CatgirlNFT.sol/CatgirlNFT.json");
const {
  buildMultiBuyPattern,
  buildMultiSendTx,
} = require("./scripts/buildMultiSendTx");

function expandTo18Decimals(n, p = 18) {
  return ethers.BigNumber.from(n)
    .mul(ethers.BigNumber.from(10).pow(p))
    .toString();
}

describe("Cat girl Marketplace", function () {
  let exchange;
  let maker;
  let taker;
  let protocolFee;
  let merchant;
  let paymentToken;
  let erc721;
  let multiSend;
  let owner;
  let newProtocol;
  beforeEach(async () => {
    [maker, taker, merchant, protocolFee, owner, newProtocol] =
      await ethers.getSigners();

    // await network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [WHALE_ADDRESS],
    // });
    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    paymentToken = await MockTokenFactory.deploy();

    const MockExchange = await ethers.getContractFactory("CatGirlExchange");
    exchange = await upgrades.deployProxy(MockExchange.connect(owner), [], { kind: 'uups' });

    const NFTFactory = await ethers.getContractFactory("CatgirlNFT");
    erc721 = await upgrades.deployProxy(NFTFactory, { kind: "uups" });
    await erc721.deployed();
    await erc721.externalMint(maker.address, 1, 100, 1, 0);
    await erc721.externalMint(maker.address, 1, 50, 1, 0);
    await erc721.externalMint(maker.address, 1, 100, 1, 0);
    await erc721.externalMint(maker.address, 1, 50, 1, 0);
    await erc721.externalMint(maker.address, 1, 100, 1, 0);
    await erc721.externalMint(maker.address, 1, 50, 1, 0);

    const MockMultisend = await ethers.getContractFactory("MultiSend");
    multiSend = await MockMultisend.deploy();

    await paymentToken.transfer(
      await taker.getAddress(),
      expandTo18Decimals(1000)
    );
    await paymentToken
      .connect(taker)
      .approve(exchange.address, expandTo18Decimals(1000));
    await paymentToken.approve(exchange.address, expandTo18Decimals(1000));
  });

  it("Only owner can change maker fee", async () => {
    await exchange.connect(owner).setMakerFee(300);
    const newMakerFee = await exchange.MAKER_RELAYER_FEE();
    expect(newMakerFee.toString()).to.be.equals("300");
    await expect(exchange.connect(maker).setMakerFee(300)).to.be.reverted;
  });

  it("Only owner can change taker fee", async () => {
    await exchange.connect(owner).setTakerFee(300);
    const newTakerFee = await exchange.TAKER_RELAYER_FEE();
    expect(newTakerFee.toString()).to.be.equals("300");

    await expect(exchange.connect(maker).setTakerFee(300)).to.be.reverted;
  });

  it("Seller able to sell NFT through Fixed-Price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);
      await erc721.setApprovalForAll(exchange.address, true);
      const ownerNft1 = await erc721.ownerOf(1);

      const makerAddress = await maker.getAddress();
      const takerAddress = await taker.getAddress();
      console.log(ownerNft1, makerAddress, takerAddress);

      const iface = new ethers.utils.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.constants.AddressZero,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        1,
        0,
        0,
        callDataEncoded,
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
      );

      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchange.address,
          takerAddress,
          makerAddress,
          ethers.constants.AddressZero,
          erc721.address,
          paymentToken.address,
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          222,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          111,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
      );

      console.log("CAN BE MATCHED: " + canBeMatched);

      console.log("HASH ORDER: " + makerhashOrder);

      const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      const signedMessage = await maker.signMessage(hashOrderMessage);
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.utils.splitSignature(signedMessage);
      // let takerSig = ethers.utils.splitSignature(takerSignedMessage);

      await exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchange.address,
            takerAddress,
            makerAddress,
            ethers.constants.AddressZero,
            erc721.address,
            paymentToken.address,
            exchange.address,
            makerAddress,
            ethers.constants.AddressZero,
            await protocolFee.getAddress(),
            erc721.address,
            paymentToken.address,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            222,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );
      const newOwner = await erc721.ownerOf(1);
      expect(newOwner === maker, "Maker has NFT");
    }
  });

  it("Buyer able to make an offer to a single NFT auction", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    await erc721.setApprovalForAll(exchange.address, true);

    const makerAddress = await maker.getAddress();
    const takerAddress = await taker.getAddress();

    const iface = new ethers.utils.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.constants.AddressZero,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchange.address,
        takerAddress,
        ethers.constants.AddressZero,
        await protocolFee.getAddress(),
        erc721.address,
        paymentToken.address,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );

    const canBeMatched = await exchange.ordersCanMatch_(
      [
        exchange.address,
        takerAddress,
        ethers.constants.AddressZero,
        await protocolFee.getAddress(),
        erc721.address,
        paymentToken.address,
        exchange.address,
        makerAddress,
        takerAddress,
        ethers.constants.AddressZero,
        erc721.address,
        paymentToken.address,
      ],
      [
        expandTo18Decimals(1),
        currentTime,
        currentTime + 50000000000000,
        111,
        expandTo18Decimals(1),
        currentTime,
        currentTime + 50000000000000,
        222,
      ],
      [0, 0, 0, 1, 0, 0],
      callDataEncodedBuyer,
      callDataEncoded,
      "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
    );

    console.log("CAN BE MATCHED: " + canBeMatched);

    console.log("HASH ORDER: " + takerHashOrder);

    const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
    // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
    const signedMessage = await taker.signMessage(hashOrderMessage);
    // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

    // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

    let sig = ethers.utils.splitSignature(signedMessage);

    await exchange
      .connect(maker)
      .atomicMatch_(
        [
          exchange.address,
          takerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
          exchange.address,
          makerAddress,
          takerAddress,
          ethers.constants.AddressZero,
          erc721.address,
          paymentToken.address,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          111,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          222,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
        [sig.v, sig.v],
        [sig.r, sig.s, sig.r, sig.s]
      );

    const newOwner = await erc721.ownerOf("1");
    expect(newOwner).to.be.equals(await taker.getAddress());
  });

  it("Seller able to sell bundle NFTs through Fixed-Price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);
      await erc721.setApprovalForAll(exchange.address, true);

      const makerAddress = await maker.getAddress();
      const takerAddress = await taker.getAddress();

      const { multiSendEncoded, sellReplacementPattern } = buildMultiSendTx(
        makerAddress,
        ethers.constants.AddressZero,
        erc721.address,
        ["1", "2", "3", "4"]
      );

      const { buyMultiSendEncoded, buyReplacementPattern } =
        buildMultiBuyPattern(makerAddress, takerAddress, erc721.address, [
          "1",
          "2",
          "3",
          "4",
        ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          multiSend.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        1,
        0,
        1,
        multiSendEncoded,
        sellReplacementPattern
      );

      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchange.address,
          takerAddress,
          makerAddress,
          ethers.constants.AddressZero,
          multiSend.address,
          paymentToken.address,
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          multiSend.address,
          paymentToken.address,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          222,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          111,
        ],
        [0, 0, 1, 1, 0, 1],
        buyMultiSendEncoded,
        multiSendEncoded,
        buyReplacementPattern,
        sellReplacementPattern
      );

      console.log("CAN BE MATCHED: " + canBeMatched);

      console.log("HASH ORDER: " + makerhashOrder);

      const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      const signedMessage = await maker.signMessage(hashOrderMessage);
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.utils.splitSignature(signedMessage);
      // let takerSig = ethers.utils.splitSignature(takerSignedMessage);

      await exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchange.address,
            takerAddress,
            makerAddress,
            ethers.constants.AddressZero,
            multiSend.address,
            paymentToken.address,
            exchange.address,
            makerAddress,
            ethers.constants.AddressZero,
            await protocolFee.getAddress(),
            multiSend.address,
            paymentToken.address,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            222,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
          ],
          [0, 0, 1, 1, 0, 1],
          buyMultiSendEncoded,
          multiSendEncoded,
          buyReplacementPattern,
          sellReplacementPattern,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );

      const newOwner = await erc721.ownerOf("1");
      expect(newOwner).to.be.equals(takerAddress);

      const newOwner2 = await erc721.ownerOf("2");
      expect(newOwner2).to.be.equals(takerAddress);

      const newOwner3 = await erc721.ownerOf("3");
      expect(newOwner3).to.be.equals(takerAddress);

      // const balanceOf = await paymentToken.balanceOf(await protocolFee.getAddress());
      // console.log("PROTOCOL FEE BALANCE: " + balanceOf.toString());
      //
      // const takerBalance = await paymentToken.balanceOf(takerAddress);
      // console.log("TAKER BALANCE: " + takerBalance.toString());
      //
      // expect(balanceOf).to.be.equals("25000000000000000");
    }
  });

  it("Seller able to sell multiple NFTs through Auction", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);
      await erc721.setApprovalForAll(exchange.address, true);
      const makerAddress = await maker.getAddress();
      const takerAddress = await taker.getAddress();

      const { multiSendEncoded, sellReplacementPattern } = buildMultiSendTx(
        makerAddress,
        takerAddress,
        erc721.address,
        ["1", "2", "3", "4"]
      );

      const { buyMultiSendEncoded, buyReplacementPattern } =
        buildMultiBuyPattern(
          ethers.constants.AddressZero,
          takerAddress,
          erc721.address,
          ["1", "2", "3", "4"]
        );

      const takerHashOrder = await exchange.hashOrder_(
        [
          exchange.address,
          takerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          multiSend.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        0,
        0,
        1,
        buyMultiSendEncoded,
        buyReplacementPattern
      );
      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchange.address,
          takerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          multiSend.address,
          paymentToken.address,
          exchange.address,
          makerAddress,
          takerAddress,
          ethers.constants.AddressZero,
          multiSend.address,
          paymentToken.address,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          111,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          222,
        ],
        [0, 0, 1, 1, 0, 1],
        buyMultiSendEncoded,
        multiSendEncoded,
        buyReplacementPattern,
        sellReplacementPattern
      );

      console.log("CAN BE MATCHED: " + canBeMatched);

      console.log("HASH ORDER: " + takerHashOrder);

      const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      const signedMessage = await taker.signMessage(hashOrderMessage);
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.utils.splitSignature(signedMessage);

      await exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchange.address,
            takerAddress,
            ethers.constants.AddressZero,
            await protocolFee.getAddress(),
            multiSend.address,
            paymentToken.address,
            exchange.address,
            makerAddress,
            takerAddress,
            ethers.constants.AddressZero,
            multiSend.address,
            paymentToken.address,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            222,
          ],
          [0, 0, 1, 1, 0, 1],
          buyMultiSendEncoded,
          multiSendEncoded,
          buyReplacementPattern,
          sellReplacementPattern,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );

      const newOwner = await erc721.ownerOf("1");
      expect(newOwner).to.be.equals(takerAddress);

      const newOwner2 = await erc721.ownerOf("2");
      expect(newOwner2).to.be.equals(takerAddress);

      const newOwner3 = await erc721.ownerOf("3");
      expect(newOwner3).to.be.equals(takerAddress);
    }
  });

  it("Seller should be able to cancel listing", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);
      await erc721.setApprovalForAll(exchange.address, true);

      const makerAddress = await maker.getAddress();
      const takerAddress = await taker.getAddress();

      const iface = new ethers.utils.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.constants.AddressZero,
        "1",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        1,
        0,
        0,
        callDataEncoded,
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
      );
      const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      const signedMessage = await maker.signMessage(hashOrderMessage);

      let sig = ethers.utils.splitSignature(signedMessage);
      const hashToSign = await exchange.hashToSign_(
        [
          exchange.address,
          makerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        1,
        0,
        0,
        callDataEncoded,
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
      );
      console.log({ hashToSign });
      await expect(
        exchange
          .connect(maker)
          .cancelOrder_(
            [
              exchange.address,
              makerAddress,
              ethers.constants.AddressZero,
              await protocolFee.getAddress(),
              erc721.address,
              paymentToken.address,
            ],
            [
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              111,
            ],
            1,
            0,
            0,
            callDataEncoded,
            "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
            sig.v,
            sig.r,
            sig.s
          )
      )
        .to.emit(exchange, "OrderCancelled")
        .withArgs(hashToSign);
      await expect(
        await exchange.cancelledOrFinalized(hashToSign)
      ).to.be.equals(true);
      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        ethers.constants.AddressZero,
        takerAddress,
        "1",
      ]);
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchange.address,
              takerAddress,
              makerAddress,
              ethers.constants.AddressZero,
              erc721.address,
              paymentToken.address,
              exchange.address,
              makerAddress,
              ethers.constants.AddressZero,
              await protocolFee.getAddress(),
              erc721.address,
              paymentToken.address,
            ],
            [
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              222,
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              111,
            ],
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("Invalid Order Hash or already cancelled!");
    }
  });

  it("Buyer should be able to cancel bid", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    await erc721.setApprovalForAll(exchange.address, true);

    const makerAddress = await maker.getAddress();
    const takerAddress = await taker.getAddress();

    const iface = new ethers.utils.Interface(ERC721JSON.abi);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.constants.AddressZero,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchange.address,
        takerAddress,
        ethers.constants.AddressZero,
        await protocolFee.getAddress(),
        erc721.address,
        paymentToken.address,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );

    const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
    const signedMessage = await taker.signMessage(hashOrderMessage);

    let sig = ethers.utils.splitSignature(signedMessage);

    const hashToSign = await exchange.hashToSign_(
      [
        exchange.address,
        takerAddress,
        ethers.constants.AddressZero,
        await protocolFee.getAddress(),
        erc721.address,
        paymentToken.address,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );
    console.log({ hashToSign });
    await expect(
      exchange
        .connect(taker)
        .cancelOrder_(
          [
            exchange.address,
            takerAddress,
            ethers.constants.AddressZero,
            await protocolFee.getAddress(),
            erc721.address,
            paymentToken.address,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
          ],
          0,
          0,
          0,
          callDataEncodedBuyer,
          "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          sig.v,
          sig.r,
          sig.s
        )
    )
      .to.emit(exchange, "OrderCancelled")
      .withArgs(hashToSign);
    await expect(await exchange.cancelledOrFinalized(hashToSign)).to.be.equals(
      true
    );

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchange.address,
            takerAddress,
            ethers.constants.AddressZero,
            await protocolFee.getAddress(),
            erc721.address,
            paymentToken.address,
            exchange.address,
            makerAddress,
            takerAddress,
            ethers.constants.AddressZero,
            erc721.address,
            paymentToken.address,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            222,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith("Invalid Order Hash or already cancelled!");
  });

  it("Seller not able to match an expired offer", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);
      await erc721.setApprovalForAll(exchange.address, true);

      const makerAddress = await maker.getAddress();
      const takerAddress = await taker.getAddress();

      const iface = new ethers.utils.Interface(ERC721JSON.abi);

      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        ethers.constants.AddressZero,
        takerAddress,
        "1",
      ]);

      const takerHashOrder = await exchange.hashOrder_(
        [
          exchange.address,
          takerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
        ],
        [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111],
        0,
        0,
        0,
        callDataEncodedBuyer,
        "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
      );
      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchange.address,
          takerAddress,
          ethers.constants.AddressZero,
          await protocolFee.getAddress(),
          erc721.address,
          paymentToken.address,
          exchange.address,
          makerAddress,
          takerAddress,
          ethers.constants.AddressZero,
          erc721.address,
          paymentToken.address,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          111,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000000000,
          222,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000"
      );

      console.log("CAN BE MATCHED: " + canBeMatched);
      const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
      const signedMessage = await taker.signMessage(hashOrderMessage);

      let sig = ethers.utils.splitSignature(signedMessage);
      await network.provider.send("evm_setNextBlockTimestamp", [currentTime + 1000000000000000000]);
      await expect(
        exchange
          .connect(maker)
          .atomicMatch_(
            [
              exchange.address,
              takerAddress,
              ethers.constants.AddressZero,
              await protocolFee.getAddress(),
              erc721.address,
              paymentToken.address,
              exchange.address,
              makerAddress,
              takerAddress,
              ethers.constants.AddressZero,
              erc721.address,
              paymentToken.address,
            ],
            [
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              111,
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              222,
            ],
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            "0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000",
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("CATGIRL_Exchange::Order not matched");
    }
  });
});
