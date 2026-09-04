import mongoose, { Schema, Document, Model } from "mongoose";

export type TxState = "verified" | "not_verified" | "pending" | "unavailable";

export const VALID_TX_STATES: TxState[] = [
  "verified",
  "not_verified",
  "pending",
  "unavailable",
];

export interface ITransaction extends Document {
  txHash: string;
  state: TxState;
  address?: string;
  network?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    txHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    state: {
      type: String,
      enum: VALID_TX_STATES,
      default: "pending",
      required: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      required: true,
    },
    network: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Create or retrieve model
const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", transactionSchema);

export default Transaction;
