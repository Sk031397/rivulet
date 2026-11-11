/**
 * Amazon Bedrock client shared by the flow-building agent and the invoice reader.
 */

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

/** Override to try a stronger model (e.g. amazon.nova-pro-v1:0). */
export const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";

/**
 * Credentials, in order of preference:
 *  1. A Bedrock API key (BEDROCK_API_KEY, or AWS_BEARER_TOKEN_BEDROCK) — the
 *     simplest option on a host like Vercel.
 *  2. Static IAM keys under non-reserved names (BEDROCK_ACCESS_KEY_ID /
 *     BEDROCK_SECRET_ACCESS_KEY). Vercel reserves the plain AWS_* names.
 *  3. The normal AWS provider chain (profile, SSO, …) — what local dev uses.
 */
export function makeBedrock() {
  const region =
    process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

  const apiKey = process.env.BEDROCK_API_KEY ?? process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (apiKey) return createAmazonBedrock({ region, apiKey });

  const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return createAmazonBedrock({
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.BEDROCK_SESSION_TOKEN,
    });
  }

  return createAmazonBedrock({ region, credentialProvider: fromNodeProviderChain() });
}
