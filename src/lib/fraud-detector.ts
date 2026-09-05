/**
 * Automated Fraud & Spam Detection Intelligence Engine
 * Evaluates Employers and Candidates for phishing scams, bot flooding,
 * disposable emails, unrealistic salary outliers, and spam content.
 */

export interface FraudEvaluation {
  userId: string;
  name: string;
  email: string;
  userType: 'employee' | 'employer' | 'admin' | 'superadmin';
  isActive: boolean;
  verifiedStatus: string;
  companyName?: string;
  createdAt: Date | string | number | null;
  riskScore: number; // 0 - 100
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  flags: string[];
  sampleContent?: string;
  stats?: {
    jobsCount?: number;
    applicationsCount?: number;
    postsCount?: number;
  };
}

// Common disposable/temp email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'mailinator.com', 'guerrillamail.com',
  'sharklasers.com', 'trashmail.com', 'yopmail.com', 'getairmail.com',
  'dispostable.com', 'fakeinbox.com', 'temp-mail.org', 'throwawaymail.com',
  'mytemp.email', 'crazymailing.com', 'mohmal.com', 'generator.email'
]);

// Spam & Phishing Keyword Patterns
const SCAM_PHISHING_KEYWORDS = [
  /telegram\s*(bot|money|invest|@)/i,
  /whatsapp\s*(only|me|contact|\+?\d{9,})/i,
  /wire\s*transfer/i,
  /crypto\s*(investment|yield|bot|doubler|bonus)/i,
  /bitcoin\s*(doubler|investment|giveaway)/i,
  /cash\s*app\s*(flip|transfer|hack)/i,
  /western\s*union/i,
  /no\s*interview\s*(instant\s*hire|direct\s*payment)/i,
  /earn\s*\$?\d{4,}\s*(daily|per\s*day|hourly)/i,
  /100%\s*guaranteed\s*return/i,
  /package\s*reship(ping)?/i,
  /mystery\s*shopper\s*check/i,
  /bank\s*account\s*(login|sharing|details)/i,
  /gift\s*card\s*payment/i,
  /processing\s*fee\s*upfront/i,
  /visa\s*lottery\s*winner/i,
  /casino\s*(bonus|slot|jackpot)/i,
  /porn|escort|viagra|cialis/i
];

/**
 * Scans text content for spam and phishing keywords
 */
export function scanTextForKeywords(text: string | null | undefined): { matches: string[]; penalty: number } {
  if (!text || typeof text !== 'string') return { matches: [], penalty: 0 };
  const matches: string[] = [];
  let penalty = 0;

  for (const pattern of SCAM_PHISHING_KEYWORDS) {
    if (pattern.test(text)) {
      const matched = text.match(pattern);
      if (matched && matched[0]) {
        matches.push(matched[0].trim());
        penalty += 25;
      }
    }
  }

  // Excessive ALL CAPS check (> 60% capital letters if text length > 25)
  if (text.length > 25) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 15) {
      const caps = text.replace(/[^A-Z]/g, '');
      if (caps.length / letters.length > 0.6) {
        matches.push('Excessive ALL CAPS text');
        penalty += 15;
      }
    }
  }

  // Excessive repetitive characters (e.g. "free moneyyyyyy!!!!!!!")
  if (/(.)\1{5,}/.test(text)) {
    matches.push('Repetitive character spamming');
    penalty += 15;
  }

  return { matches, penalty: Math.min(penalty, 60) };
}

/**
 * Evaluates an Employer Account for fraud and spam signals
 */
export function evaluateEmployer(
  user: any,
  jobs: any[] = [],
  posts: any[] = []
): FraudEvaluation {
  let score = 0;
  const flags: string[] = [];
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.companyName || 'Unknown Employer';
  const email = (user.email || '').toLowerCase().trim();
  const domain = email.split('@')[1] || '';

  // 1. Check Disposable Email Domain (+40 points)
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    score += 40;
    flags.push(`🚩 Disposable Email Provider detected (@${domain})`);
  }

  // 2. Suspicious Email pattern (random hex or excessive digits)
  if (/[a-f0-9]{15,}@/i.test(email) || /\d{10,}@/.test(email)) {
    score += 20;
    flags.push('⚠️ Suspicious automated/random email username');
  }

  // 3. Scan Company Name & Bio (+25 points)
  const bioScan = scanTextForKeywords(`${user.companyName || ''} ${user.companyBio || ''}`);
  if (bioScan.matches.length > 0) {
    score += bioScan.penalty;
    flags.push(`🚩 Flagged keywords in company profile: ${bioScan.matches.slice(0, 3).join(', ')}`);
  }

  // 4. Missing Company Details (+15 points if posting jobs without basic profile)
  if (jobs.length > 0) {
    if (!user.companyWebsite && !user.companyBio) {
      score += 15;
      flags.push('⚠️ Job postings created without company website or bio');
    }
  }

  // 5. Scan Job Postings (+30 points per suspicious job)
  let suspiciousJobCount = 0;
  let sampleContent = '';

  for (const job of jobs) {
    const jobScan = scanTextForKeywords(`${job.jobTitle} ${job.description} ${JSON.stringify(job.requirements || '')}`);
    if (jobScan.matches.length > 0) {
      suspiciousJobCount++;
      if (!sampleContent) sampleContent = `Job: "${job.jobTitle}" — Flagged: ${jobScan.matches.join(', ')}`;
      score += Math.min(jobScan.penalty, 30);
      flags.push(`🚩 Suspicious job post "${job.jobTitle}": (${jobScan.matches.join(', ')})`);
    }

    // Unrealistic Salary Outliers (e.g. > $1,000,000 for non-executive or min > max)
    if (job.salaryMin && job.salaryMin > 1000000) {
      score += 25;
      flags.push(`🚩 Extreme salary outlier in "${job.jobTitle}" ($${Number(job.salaryMin).toLocaleString()})`);
    }
    if (job.salaryMin && job.salaryMax && job.salaryMin > job.salaryMax) {
      score += 15;
      flags.push(`⚠️ Inverted salary range in "${job.jobTitle}"`);
    }
  }

  // 6. Job Posting Flooding (> 15 jobs in 24 hours)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const recentJobs = jobs.filter(j => {
    const created = j.createdAt ? new Date(j.createdAt).getTime() : 0;
    return created > oneDayAgo;
  });
  if (recentJobs.length > 10) {
    score += 25;
    flags.push(`🚩 Rapid job post flooding (${recentJobs.length} jobs created in 24 hours)`);
  }

  // 7. Scan Feed Posts (+20 points)
  for (const post of posts) {
    const postScan = scanTextForKeywords(post.content);
    if (postScan.matches.length > 0) {
      score += 20;
      flags.push(`🚩 Suspicious feed post: ${postScan.matches.join(', ')}`);
      if (!sampleContent) sampleContent = `Post: "${post.content.slice(0, 60)}..."`;
    }
  }

  // Check if already suspended
  if (user.isActive === false || user.isActive === 0) {
    flags.push('🛑 Account is currently Blocked / Suspended');
  }

  score = Math.min(100, Math.max(0, score));
  const riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

  return {
    userId: user.id,
    name,
    email: user.email,
    userType: 'employer',
    isActive: Boolean(user.isActive ?? true),
    verifiedStatus: user.verifiedStatus || 'pending',
    companyName: user.companyName || 'Not Provided',
    createdAt: user.createdAt,
    riskScore: score,
    riskLevel,
    flags,
    sampleContent: sampleContent || (jobs.length > 0 ? `Latest Job: ${jobs[0].jobTitle}` : undefined),
    stats: {
      jobsCount: jobs.length,
      postsCount: posts.length
    }
  };
}

/**
 * Evaluates a Candidate (Employee) Account for fraud, spam, and bot activity
 */
export function evaluateCandidate(
  user: any,
  applications: any[] = [],
  posts: any[] = []
): FraudEvaluation {
  let score = 0;
  const flags: string[] = [];
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Candidate';
  const email = (user.email || '').toLowerCase().trim();
  const domain = email.split('@')[1] || '';

  // 1. Check Disposable Email Domain (+40 points)
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    score += 40;
    flags.push(`🚩 Disposable Email Provider detected (@${domain})`);
  }

  // 2. Suspicious Email Pattern
  if (/[a-f0-9]{15,}@/i.test(email) || /\d{10,}@/.test(email)) {
    score += 20;
    flags.push('⚠️ Suspicious automated/random email username');
  }

  // 3. Scan Headline & Bio (+25 points)
  const profileScan = scanTextForKeywords(`${user.headline || ''} ${user.bio || ''}`);
  if (profileScan.matches.length > 0) {
    score += profileScan.penalty;
    flags.push(`🚩 Flagged keywords in candidate profile: ${profileScan.matches.slice(0, 3).join(', ')}`);
  }

  // 4. Rapid Mass Application Bot Behavior (+35 points)
  // E.g. > 25 applications submitted in under 2 hours
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  const recentApps = applications.filter(a => {
    const applied = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
    return applied > twoHoursAgo;
  });
  if (recentApps.length >= 15) {
    score += 35;
    flags.push(`🚩 Automated application burst (${recentApps.length} applications in 2 hours)`);
  }

  // 5. Repetitive / Spam Cover Letters (+20 points)
  if (applications.length > 5) {
    const coverLetters = applications.map(a => a.coverLetter || '').filter(c => c.length > 20);
    if (coverLetters.length > 3) {
      const allIdentical = coverLetters.every(c => c === coverLetters[0]);
      if (allIdentical && coverLetters[0].includes('http')) {
        score += 20;
        flags.push('⚠️ Identical mass-copy-pasted cover letter containing external link');
      }
    }
  }

  // 6. Scan Feed Posts (+25 points)
  let sampleContent = '';
  for (const post of posts) {
    const postScan = scanTextForKeywords(post.content);
    if (postScan.matches.length > 0) {
      score += 25;
      flags.push(`🚩 Spam content in feed post: ${postScan.matches.join(', ')}`);
      if (!sampleContent) sampleContent = `Post: "${post.content.slice(0, 60)}..."`;
    }
  }

  // Check if already suspended
  if (user.isActive === false || user.isActive === 0) {
    flags.push('🛑 Account is currently Blocked / Suspended');
  }

  score = Math.min(100, Math.max(0, score));
  const riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

  return {
    userId: user.id,
    name,
    email: user.email,
    userType: 'employee',
    isActive: Boolean(user.isActive ?? true),
    verifiedStatus: user.verifiedStatus || 'pending',
    createdAt: user.createdAt,
    riskScore: score,
    riskLevel,
    flags,
    sampleContent: sampleContent || (user.headline ? `Headline: "${user.headline}"` : undefined),
    stats: {
      applicationsCount: applications.length,
      postsCount: posts.length
    }
  };
}
