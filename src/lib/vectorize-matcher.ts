import { getDb } from './db';
import { applications, jobPostings, users } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Calculates cosine similarity between two numeric vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extract clean readable text from a PDF Buffer in pure JS / Worker environment
 */
function extractTextFromPdf(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let rawText = '';
  // Stream decoder
  const decoder = new TextDecoder('latin1');
  const str = decoder.decode(bytes);

  // Look for text streams in PDF objects: BT ... ET blocks and string tokens (..) or /Text
  const textMatches: string[] = [];
  
  // 1. Match bracketed strings e.g. (Hello World) Tj or (Text)
  const literalPattern = /\(([^)]+)\)\s*(?:Tj|TJ|')/g;
  let match;
  while ((match = literalPattern.exec(str)) !== null) {
    if (match[1] && match[1].length > 1) {
      textMatches.push(match[1].replace(/\\([()\\])/g, '$1'));
    }
  }

  // 2. Fallback: extract plain ASCII word runs if PDF stream is simple
  if (textMatches.length < 10) {
    const wordPattern = /[A-Za-z0-9+#.\-_]{2,}/g;
    let wordMatch;
    let count = 0;
    while ((wordMatch = wordPattern.exec(str)) !== null && count < 1000) {
      // Filter out PDF internal operator words
      const w = wordMatch[0];
      if (!['obj', 'endobj', 'stream', 'endstream', 'xref', 'trailer', 'startxref', 'FlateDecode', 'Filter', 'Length'].includes(w)) {
        textMatches.push(w);
        count++;
      }
    }
  }

  rawText = textMatches.join(' ').replace(/\s+/g, ' ').trim();
  return rawText.slice(0, 4000); // Keep within 4k characters for optimal embedding
}

export interface MatchResult {
  score: number;
  summary: string;
}

/**
 * Evaluates candidate resume vs job description using Cloudflare Workers AI & Vectorize
 */
export async function evaluateMatchWithVectorize(
  env: any,
  job: { id: string; jobTitle: string; description: string; requirements?: any },
  resumeBuffer: ArrayBuffer,
  candidateProfile?: { firstName?: string; lastName?: string; skills?: any; bio?: string }
): Promise<MatchResult> {
  try {
    if (!env || !env.AI) {
      throw new Error('Cloudflare Workers AI binding (env.AI) is not available');
    }

    // 1. Prepare Job Text
    let reqText = '';
    if (job.requirements) {
      try {
        const reqs = typeof job.requirements === 'string' ? JSON.parse(job.requirements) : job.requirements;
        if (Array.isArray(reqs)) reqText = reqs.join(', ');
      } catch (e) {
        reqText = String(job.requirements);
      }
    }
    const jobText = `Job Title: ${job.jobTitle}\nDescription: ${job.description}\nRequirements: ${reqText}`.slice(0, 2000);

    // 2. Extract Candidate Text from Resume + Profile
    const extractedResumeText = extractTextFromPdf(resumeBuffer);
    
    let candidateSkills = '';
    if (candidateProfile?.skills) {
      try {
        const skills = typeof candidateProfile.skills === 'string' ? JSON.parse(candidateProfile.skills) : candidateProfile.skills;
        if (Array.isArray(skills)) candidateSkills = skills.join(', ');
      } catch (e) {}
    }

    const candidateText = `Candidate: ${candidateProfile?.firstName || ''} ${candidateProfile?.lastName || ''}\nSkills: ${candidateSkills}\nResume Content: ${extractedResumeText}`.slice(0, 2000);

    // 3. Generate 768-dim embeddings using Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5)
    // Matches the 768-dimension configuration of Cloudflare Vectorize 'job-embeddings' index
    const [jobEmbeddingRes, resumeEmbeddingRes] = await Promise.all([
      env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [jobText] }),
      env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [candidateText] })
    ]);

    const jobVec: number[] = jobEmbeddingRes.data?.[0];
    const resumeVec: number[] = resumeEmbeddingRes.data?.[0];

    if (!jobVec || !resumeVec) {
      throw new Error('Failed to generate embeddings from Workers AI');
    }

    // 4. Optionally upsert/query with Vectorize index if available
    if (env.VECTORIZE_INDEX) {
      try {
        await env.VECTORIZE_INDEX.upsert([
          {
            id: `job_${job.id}`,
            values: jobVec,
            metadata: { title: job.jobTitle }
          }
        ]);
      } catch (vecErr) {
        console.warn('Vectorize index upsert note:', vecErr);
      }
    }

    // 5. Calculate Cosine Similarity
    const similarity = cosineSimilarity(jobVec, resumeVec);
    
    // Normalizing embedding cosine score (typically 0.4 - 0.9 for semantic models) to 0-100% scale
    // 0.50 -> ~50%, 0.85+ -> ~95%
    let matchPercentage = Math.round(Math.min(Math.max((similarity - 0.3) / 0.6 * 100, 15), 98));

    let fitLevel = 'Moderate Match';
    let fitDescription = 'The candidate exhibits relevant baseline skills and general alignment with this role requirements.';
    if (matchPercentage >= 80) {
      fitLevel = 'Strong Candidate Fit';
      fitDescription = 'High technical and experiential compatibility found between the candidate resume and key position requirements.';
    } else if (matchPercentage < 50) {
      fitLevel = 'Low Skill Match';
      fitDescription = 'Limited overlap detected between the candidate profile background and specific criteria for this job role.';
    }

    const summary = `${fitLevel} (${matchPercentage}% Match) — ${fitDescription}`;

    return {
      score: matchPercentage,
      summary
    };
  } catch (error: any) {
    console.error('Vectorize evaluation error:', error);
    throw error;
  }
}
