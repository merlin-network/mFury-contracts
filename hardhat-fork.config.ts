import { hardhatConfig } from "./hardhat.config"

export default {
    ...hardhatConfig,
    networks: {
        ...hardhatConfig.networks,
        hardhat: {
            allowUnlimitedContractSize: false,
            forking: {
                url: process.env.NODE_URL || "https://34.93.171.55:8545",
            },
        },
    },
}
