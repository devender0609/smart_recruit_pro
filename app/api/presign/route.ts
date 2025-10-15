import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const type = url.searchParams.get("type") || "application/octet-stream";
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "S3 not configured" }, { status: 400 });
  }

  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type });
  const signed = await getSignedUrl(s3, cmd, { expiresIn: 60 });
  return NextResponse.json({ url: signed });
}
