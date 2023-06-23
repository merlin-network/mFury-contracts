import { network } from "hardhat"
import * as hre from "hardhat"

import { impersonate, impersonateAccount } from "@utils/fork"
import { Signer } from "ethers"
import { resolveAddress } from "tasks/utils/networkAddressFactory"
import { deploySplitRevenueBuyBack } from "tasks/utils/emissions-utils"
import { expect } from "chai"
import { simpleToExactAmount } from "@utils/math"
import { DAI, mBTC, FURY, mUSD, USDC, WBTC } from "tasks/utils/tokens"
import {
    EmissionsController,
    EmissionsController__factory,
    IERC20,
    IERC20__factory,
    RevenueSplitBuyBack,
    SavingsManager,
    SavingsManager__factory,
} from "types/generated"
import { Account } from "types/common"
import { encodeUniswapPath } from "@utils/peripheral/uniswap"

const furyUsdPrice = 42
const btcUsdPrice = 42300

const uniswapEthToken = resolveAddress("UniswapEthToken")
const musdUniswapPath = encodeUniswapPath([USDC.address, uniswapEthToken, FURY.address], [3000, 3000])
// const mbtcUniswapPath = encodeUniswapPath([WBTC.address, uniswapEthToken, FURY.address], [3000, 3000])
const mbtcUniswapPath = encodeUniswapPath([WBTC.address, uniswapEthToken, DAI.address, FURY.address], [3000, 3000, 3000])

describe("Fork test deploy of RevenueSplitBuyBack", async () => {
    let ops: Signer
    let governor: Signer
    let treasury: Account
    let emissionsController: EmissionsController
    let savingsManager: SavingsManager
    let fury: IERC20
    let revenueBuyBack: RevenueSplitBuyBack

    const setup = async (blockNumber?: number) => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: process.env.NODE_URL,
                        blockNumber,
                    },
                },
            ],
        })
        ops = await impersonate(resolveAddress("OperationsSigner"))
        governor = await impersonate(resolveAddress("Governor"))
        treasury = await impersonateAccount("0x3dd46846eed8d147841ae162c8425c08bd8e1b41")

        fury = IERC20__factory.connect(FURY.address, treasury.signer)

        const emissionsControllerAddress = resolveAddress("EmissionsController")
        emissionsController = EmissionsController__factory.connect(emissionsControllerAddress, ops)
        savingsManager = SavingsManager__factory.connect(resolveAddress("SavingsManager"), governor)

        // revenueBuyBack = RevenueSplitBuyBack__factory.connect(resolveAddress("RevenueBuyBack"), ops)
    }

    describe("Next revenue buy back", () => {
        let musdToken: IERC20
        let mbtcToken: IERC20

        before(async () => {
            // 23 March before fees were collected
            await setup(14439160)

            mbtcToken = IERC20__factory.connect(mBTC.address, ops)
            musdToken = IERC20__factory.connect(mUSD.address, ops)
        })
        it("Deploy RevenueSplitBuyBack", async () => {
            revenueBuyBack = await deploySplitRevenueBuyBack(ops, hre, simpleToExactAmount(5, 17))
        })
        it("Configure RevenueSplitBuyBack", async () => {
            await revenueBuyBack.connect(governor).mapBasset(mUSD.address, USDC.address)
            await revenueBuyBack.connect(governor).mapBasset(mBTC.address, WBTC.address)
        })
        it("Config SavingsManager", async () => {
            await savingsManager.setRevenueRecipient(mUSD.address, revenueBuyBack.address)
            await savingsManager.setRevenueRecipient(mBTC.address, revenueBuyBack.address)
        })
        context("buy back FURY using mUSD and mBTC", () => {
            before(async () => {})
            it("Distribute unallocated mUSD in Savings Manager", async () => {
                expect(await musdToken.balanceOf(revenueBuyBack.address), "mUSD bal before").to.eq(0)

                await savingsManager.distributeUnallocatedInterest(mUSD.address)

                expect(await musdToken.balanceOf(revenueBuyBack.address), "mUSD bal after").to.gt(0)
            })
            it("Distribute unallocated mBTC in Savings Manager", async () => {
                expect(await mbtcToken.balanceOf(revenueBuyBack.address), "mBTC bal before").to.eq(0)

                await savingsManager.distributeUnallocatedInterest(mBTC.address)

                expect(await mbtcToken.balanceOf(revenueBuyBack.address), "mBTC bal after").to.gt(0)
            })
            it("Buy back FURY using mUSD", async () => {
                const musdRbbBalBefore = await musdToken.balanceOf(revenueBuyBack.address)
                expect(musdRbbBalBefore, "mUSD bal before").to.gt(0)
                expect(await fury.balanceOf(revenueBuyBack.address), "RBB FURY bal before").to.eq(0)

                // 1% slippage on redeem, 50% to treasury and convert from 18 to 6 decimals
                const minBassets = musdRbbBalBefore.mul(99).div(100).div(2).div(1e12)
                console.log(`minBassets ${minBassets} = ${musdRbbBalBefore} * 98% / 1e12`)
                // FURY = USD * FURY/USD price * 10^(18-6) to convert from 6 to 18 decimals
                const minFury = minBassets.mul(furyUsdPrice).div(100).mul(1e12)
                await revenueBuyBack.buyBackRewards([mUSD.address], [minBassets], [minFury], [musdUniswapPath.encoded])

                expect(await musdToken.balanceOf(revenueBuyBack.address), "mUSD bal after").to.eq(0)
                expect(await fury.balanceOf(revenueBuyBack.address), "RBB FURY bal after").to.gt(1)
            })
            it("Buy back FURY using mBTC", async () => {
                const mbtcRbbBalBefore = await mbtcToken.balanceOf(revenueBuyBack.address)
                const furyRbbBalBefore = await fury.balanceOf(revenueBuyBack.address)

                // 1% slippage on redeem, 50% to treasury and convert from 18 to 8 decimals
                const minBassets = mbtcRbbBalBefore.mul(99).div(100).div(2).div(1e10)
                console.log(`minBassets ${minBassets} = ${mbtcRbbBalBefore} * 98% / 1e10`)
                // FURY = BTC * BTC/USD price * FURY/USD price * 10^(18-8) to convert from 8 to 18 decimals
                const minFury = minBassets.mul(btcUsdPrice).mul(furyUsdPrice).div(100).mul(1e10)
                await revenueBuyBack.buyBackRewards([mBTC.address], [minBassets], [minFury], [mbtcUniswapPath.encoded])

                expect(await mbtcToken.balanceOf(revenueBuyBack.address), "mBTC bal after").to.eq(0)

                expect(await fury.balanceOf(revenueBuyBack.address), "RBB FURY bal after").to.gt(furyRbbBalBefore)
            })
            it("Donate FURY to Emissions Controller staking dials", async () => {
                const furyEcBalBefore = await fury.balanceOf(emissionsController.address)
                const furyRbbBalBefore = await fury.balanceOf(revenueBuyBack.address)
                expect(furyRbbBalBefore, "RBB FURY bal before").to.gt(0)

                await revenueBuyBack.donateRewards()

                expect(await fury.balanceOf(revenueBuyBack.address), "RBB FURY bal after").to.lte(1)
                expect(await fury.balanceOf(emissionsController.address), "EC FURY bal after").to.eq(
                    furyEcBalBefore.add(furyRbbBalBefore).sub(1),
                )
            })
        })
    })
})
