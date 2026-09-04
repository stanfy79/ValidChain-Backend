import dotenv from "dotenv";
import { z } from 'zod'

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  // DATABASE_URL: process.env.DATABASE_URL!,
  ZERION_API_KEY: z.string().default(process.env.ZERION_API_KEY!),
  // PRIVATE_KEY: process.env.PRIVATE_KEY!,
  // CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  // USDC_ADDRESS: process.env.USDC_ADDRESS!,
});

export const env = schema.parse(process.env);