import { NextResponse } from "next/server";
import formidable from "formidable";
import fs from "fs";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import { OpenAI } from "openai";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { api: { bodyParser: false } };

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const data = await pdf(fs.readFileSync(filePath));
    return data.text;
  } else if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  } else if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  } else {
    return "";
  }
}

export async function POST(req: Request) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, uploadDir: "/tmp", keepExtensions: true });

    form.parse(req as any, async (err, fields, files) => {
      if (err) return reject(err);

      try {
        const jdText = fields.jobDescription?.[0] || await extractText(files.jobFile?.[0].filepath);
        const resumes = Array.isArray(files.resumeFiles) ? files.resumeFiles : [files.resumeFiles];

        // Embed JD
        const jdEmbed = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: jdText,
        });

        const jdVector = jdEmbed.data[0].embedding;
        const results: any[] = [];

        for (let file of resumes) {
          if (!file) continue;
          const resumeText = await extractText(file.filepath);

          // Embed resume
          const resEmbed = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: resumeText,
          });

          const resVector = resEmbed.data[0].embedding;

          // Cosine similarity
          const dot = jdVector.reduce((a, v, i) => a + v * resVector[i], 0);
          const jdNorm = Math.sqrt(jdVector.reduce((a, v) => a + v * v, 0));
          const resNorm = Math.sqrt(resVector.reduce((a, v) => a + v * v, 0));
          const similarity = dot / (jdNorm * resNorm);

          // Extract structured info
          const analysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a resume parser." },
              { role: "user", content: `Extract candidate summary, key skills, education, and years of experience:\n\n${resumeText}` },
            ],
          });

          results.push({
            candidate: file.originalFilename,
            matchScore: (similarity * 100).toFixed(1) + "%",
            summary: analysis.choices[0].message.content,
          });
        }

        resolve(NextResponse.json({ results }));
      } catch (error) {
        console.error(error);
        reject(NextResponse.json({ error: "Processing failed" }, { status: 500 }));
      }
    });
  });
}
