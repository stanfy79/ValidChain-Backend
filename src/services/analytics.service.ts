import axios from "axios";
import { env } from "../env";

export interface MappedTransaction {
  hash: string;
  address: string;
  state: string;
  network: string;
  operation_type: string;
  chain_id: string;
  mined_at_block: number;
  mined_at: string;
}

export function mapAlchemyTransaction(
  item: any,
  chainId: string,
): MappedTransaction {
  const blockNum = item?.blockNum ?? "";
  const blockTimestamp = item?.metadata?.blockTimestamp ?? "";

  return {
    hash: item?.hash ?? "",
    address: item?.to ?? item?.from ?? "",
    state: "confirmed",
    network: chainId,
    operation_type: item?.category ?? "",
    chain_id: chainId,
    mined_at_block: blockNum ? parseInt(blockNum, 16) : 0,
    mined_at: blockTimestamp,
  };
}

export const AnalyticsService = async (wallet: string) => {
  const createRequest = (addressFilter: "fromAddress" | "toAddress") => ({
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers",
    params: [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        [addressFilter]: wallet,
        category: ["external", "internal", "erc20", "erc721", "erc1155"],
        excludeZeroValue: false,
        maxCount: "0x3e8",
        withMetadata: true,
        order: "desc",
      },
    ],
  });

  try {
    const [
      mainnetResponse, 
      // testnetResponse
    ] = await Promise.all([
      axios.post(
        `${process.env.ALCHEMY_PROVIDER_URL}/${process.env.ALCHEMY_API_KEY}`,
        createRequest("fromAddress"),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),

      // axios.post(
      //   `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      //   createRequest("toAddress"),
      //   {
      //     headers: { "Content-Type": "application/json" },
      //   },
      // ),
    ]);

    const mainnet = mainnetResponse.data?.result?.transfers || [];
    // const testnet = testnetResponse.data?.result?.transfers || [];

    // Combine and remove duplicates
    const uniqueTransactions = Array.from(
      new Map(
        [
          ...mainnet, 
          // ...testnet
        ].map((tx) => [`${tx.hash}-${tx.uniqueId}`, tx]),
      ).values(),
    );

    const mappedTransactions: MappedTransaction[] = uniqueTransactions.map(
      (tx) => mapAlchemyTransaction(tx, "ethereum"),
    );

    console.log(
      `Fetched ${mappedTransactions.length} transactions for wallet: ${wallet}`,
    );

    return {
      data: mappedTransactions,
      success: true,
    };
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error("Alchemy API Error:", status, data || err?.message);

    throw new Error(
      data?.error?.message || err?.message || "Error fetching transaction data",
    );
  }
};
