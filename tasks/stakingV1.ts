import axios from "axios"
import { subtask, task, types } from "hardhat/config"
import { IEjector__factory, IncentivisedVotingLockup__factory } from "types/generated"
import { getSigner } from "./utils/signerFactory"
import { logTxDetails } from "./utils/deploy-utils"
import { getChain, getChainAddress, resolveAddress } from "./utils/networkAddressFactory"

task("eject-stakers", "Ejects expired stakers from Meta staking contract (vFURY)")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "average", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        const ejectorAddress = getChainAddress("Ejector", chain)
        console.log(`Ejector address ${ejectorAddress}`)
        const ejector = IEjector__factory.connect(ejectorAddress, signer)
        // TODO check the last time the eject was run
        // Check it's been more than 7 days since the last eject has been run

        // get stakers from API
        const response = await axios.get("https://api-dot-mfury.appspot.com/stakers")
        const stakers = response.data.ejected

        if (stakers.length === 0) {
            console.error(`No stakers to eject`)
            process.exit(0)
        }
        console.log(`${stakers.length} stakers to be ejected: ${stakers}`)
        const tx = await ejector.ejectMany(stakers)
        await logTxDetails(tx, "ejectMany")
    })

subtask("vfury-expire", "Expire old staking V1 contract")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "average", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        const vfuryAddress = resolveAddress("vFURY", chain)
        const vfury = IncentivisedVotingLockup__factory.connect(vfuryAddress, signer)
        const tx = await vfury.expireContract()
        await logTxDetails(tx, "Expire old V1 FURY staking contract")
    })
task("vfury-expire").setAction(async (_, __, runSuper) => {
    await runSuper()
})

subtask("vfury-withdraw", "Withdraw FURY from old Staking V1 contract")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "average", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed, false)
        const chain = getChain(hre)

        const vfuryAddress = resolveAddress("vFURY", chain)
        const vfury = IncentivisedVotingLockup__factory.connect(vfuryAddress, signer)
        const tx = await vfury.withdraw()
        await logTxDetails(tx, "Withdraw FURY from Staking V1 contract")
    })
task("vfury-withdraw").setAction(async (_, __, runSuper) => {
    await runSuper()
})

subtask("vfury-claim", "Claim FURY from old Staking V1 contract")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "average", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed, false)
        const chain = getChain(hre)

        const vfuryAddress = resolveAddress("vFURY", chain)
        const vfury = IncentivisedVotingLockup__factory.connect(vfuryAddress, signer)
        const tx = await vfury.claimReward()
        await logTxDetails(tx, "Claim FURY from old Staking V2 contract")
    })
task("vfury-claim").setAction(async (_, __, runSuper) => {
    await runSuper()
})

subtask("vfury-exit", "Withdraw and claim FURY from old Staking V1 contract")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "average", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed, false)
        const chain = getChain(hre)

        const vfuryAddress = resolveAddress("vFURY", chain)
        const vfury = IncentivisedVotingLockup__factory.connect(vfuryAddress, signer)
        const tx = await vfury.exit()
        await logTxDetails(tx, "Withdraw and claim FURY from old Staking V2 contract")
    })
task("vfury-exit").setAction(async (_, __, runSuper) => {
    await runSuper()
})
