import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const UPLOAD_PREFIX = "uploads/";
const UPLOAD_URL_EXPIRES_IN = 15 * 60;
const READ_URL_EXPIRES_IN = 24 * 60 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UploadedAttachment = {
  id: string;
  name: string;
  type: string;
};

export class R2StorageConfigurationError extends Error {
  constructor() {
    super("R2 attachment storage is not configured.");
    this.name = "R2StorageConfigurationError";
  }
}

const getStorageConfig = () => {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_UPLOAD_BUCKET,
  } = env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_UPLOAD_BUCKET
  ) {
    throw new R2StorageConfigurationError();
  }

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_UPLOAD_BUCKET,
  };
};

let client: S3Client | null = null;

const getClient = (config: ReturnType<typeof getStorageConfig>) => {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
};

const getObjectKey = (id: string) => {
  if (!UUID_PATTERN.test(id)) throw new Error("Invalid attachment reference.");
  return `${UPLOAD_PREFIX}${id}`;
};

export const createAttachmentUploads = async (
  files: { name: string; type: string }[],
) => {
  const config = getStorageConfig();
  const s3 = getClient(config);

  return Promise.all(
    files.map(async ({ name, type }) => {
      const id = randomUUID();
      const contentType = type || "application/octet-stream";
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: getObjectKey(id),
          ContentType: contentType,
        }),
        { expiresIn: UPLOAD_URL_EXPIRES_IN },
      );

      return { id, uploadUrl, contentType, name };
    }),
  );
};

export const createAttachmentReadUrl = (id: string) => {
  const config = getStorageConfig();
  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: getObjectKey(id),
    }),
    { expiresIn: READ_URL_EXPIRES_IN },
  );
};

export const readUploadedAttachmentText = async (id: string) => {
  const config = getStorageConfig();
  const result = await getClient(config).send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: getObjectKey(id),
    }),
  );

  if (!result.Body) throw new Error("Uploaded attachment was not found.");
  return result.Body.transformToString();
};
